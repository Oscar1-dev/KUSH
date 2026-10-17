import { describe, expect, it } from "vitest";
import { ChannelType, PermissionFlagsBits as P } from "discord.js";
import {
  blueprint,
  requiredBotPermissions,
  type Blueprint,
} from "../src/blueprint.js";
import {
  applyPlan,
  ApplyError,
  planHash,
  planProvisioning,
  reviveObservedGuild,
  serialisePlan,
  type ObservedGuild,
} from "../src/provisioning.js";
import { FakeGuild } from "./fake-guild.js";

const staffChat = blueprint.channels.find(
  (channel) => channel.key === "staff:staff-chat",
)!;
// Parent placement is removed so only overwrites can drift.
const onlyStaffChat: Blueprint = {
  ...blueprint,
  channels: [{ ...staffChat, parentKey: undefined }],
};

const matchingRoles = () =>
  blueprint.roles.map((role, index) => ({
    id: role.key,
    name: role.name,
    colour: role.colour,
    permissions: role.permissions,
    hoist: role.hoist,
    position: blueprint.roles.length - index,
    managed: role.managed,
  }));

const observedWith = (
  overwrites: { id: string; allow: bigint; deny: bigint }[],
): ObservedGuild => ({
  guildId: "guild",
  roles: [
    {
      id: "guild",
      name: "@everyone",
      colour: 0,
      permissions: blueprint.everyonePermissions,
      hoist: false,
      position: 0,
    },
    ...matchingRoles(),
  ],
  channels: [
    {
      id: "c1",
      name: staffChat.name,
      type: staffChat.type,
      parentId: null,
      topic: staffChat.topic ?? null,
      overwrites,
    },
  ],
});

const correctOverwrites = staffChat.overwrites.map((item) => ({
  id: item.principal === "everyone" ? "guild" : item.principal,
  allow: item.allow,
  deny: item.deny,
}));

// Regression: overwritesMatch() returned `true` (no drift) whenever any
// principal could not be resolved, and resolved roles only from the desired
// subset. The CLI never passed everyoneRoleId, so every channel compared as
// matching even with empty or public overwrites.
describe("provisioning permission drift (regression)", () => {
  it("reports drift when a private channel has lost all overwrites", () => {
    const plan = planProvisioning(onlyStaffChat, observedWith([]));
    expect(plan.operations).toMatchObject([
      { action: "update-channel", id: "c1", exposure: true },
    ]);
  });

  it("reports drift when @everyone can view a staff channel", () => {
    const plan = planProvisioning(
      onlyStaffChat,
      observedWith([{ id: "guild", allow: P.ViewChannel, deny: 0n }]),
    );
    expect(plan.operations).toMatchObject([
      { action: "update-channel", id: "c1", exposure: true },
    ]);
  });

  it("treats a principal that cannot be resolved as drift, not a match", () => {
    const observed = observedWith(correctOverwrites);
    observed.roles = observed.roles.filter((role) => role.id !== "moderator");
    const plan = planProvisioning(onlyStaffChat, observed);
    const update = plan.operations.find(
      (item) => item.action === "update-channel",
    );
    expect(update).toMatchObject({ action: "update-channel" });
    expect(JSON.stringify(serialisePlan(update))).toContain(
      "unresolved roles: moderator",
    );
  });

  it("reports unexpected extra overwrites", () => {
    const plan = planProvisioning(
      onlyStaffChat,
      observedWith([
        ...correctOverwrites,
        { id: "member", allow: P.ViewChannel, deny: 0n },
      ]),
    );
    expect(plan.operations).toMatchObject([
      { action: "update-channel", exposure: true },
    ]);
  });

  it("is clean when overwrites match exactly", () => {
    expect(
      planProvisioning(onlyStaffChat, observedWith(correctOverwrites))
        .operations,
    ).toEqual([]);
  });
});

describe("provisioning apply and idempotency", () => {
  it("provisions a fresh guild and a second plan has no operations", async () => {
    const guild = FakeGuild.fresh(requiredBotPermissions);
    const first = planProvisioning(blueprint, await guild.observe());
    expect(
      first.operations.filter((op) => op.action === "create-role"),
    ).toHaveLength(blueprint.roles.length - 1);
    expect(
      first.operations.filter((op) => op.action === "create-channel"),
    ).toHaveLength(blueprint.channels.length);

    const result = await applyPlan(first, guild);
    const second = planProvisioning(
      blueprint,
      await guild.observe(),
      result.mapping,
    );
    expect(second.operations).toEqual([]);

    // Remaining work is manual and explained: senior roles must be dragged
    // above the bot, and the bot cannot grant Administrator-level bits.
    const reasons = second.conflicts.map((item) => item.reason).join("\n");
    expect(reasons).toMatch(/Move role "Moderator" above "KUSH Bot"/);
    expect(reasons).toMatch(
      /Owner must update this role manually.*Administrator/s,
    );
  });

  it("is fully clean after the owner completes the manual steps", async () => {
    const guild = FakeGuild.fresh(requiredBotPermissions);
    const result = await applyPlan(
      planProvisioning(blueprint, await guild.observe()),
      guild,
    );
    // Simulate the owner: drag senior roles above the bot, grant bits.
    const senior = blueprint.roles.slice(0, 6);
    senior.forEach((role, index) => {
      const observed = guild.state.roles.find(
        (item) => item.id === result.mapping.roleIds[role.key],
      )!;
      observed.position = 100 - index;
      observed.permissions = role.permissions;
    });
    const plan = planProvisioning(
      blueprint,
      await guild.observe(),
      result.mapping,
    );
    expect(plan.operations).toEqual([]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.unmanaged.channels).toEqual([]);
  });

  it("orders bot-managed roles directly below the bot", async () => {
    const guild = FakeGuild.fresh(requiredBotPermissions);
    const result = await applyPlan(
      planProvisioning(blueprint, await guild.observe()),
      guild,
    );
    const position = (key: string) =>
      guild.state.roles.find((item) => item.id === result.mapping.roleIds[key])!
        .position!;
    expect(position("kush-bot")).toBeGreaterThan(position("creative-partner"));
    expect(position("creative-partner")).toBeGreaterThan(position("member"));
    expect(position("member")).toBeGreaterThan(position("restricted"));
  });

  it("stops at the first failure and returns the partial mapping", async () => {
    const guild = FakeGuild.fresh(requiredBotPermissions);
    guild.failOn = (call) => call === "createChannel staff-chat";
    const plan = planProvisioning(blueprint, await guild.observe());
    const error = await applyPlan(plan, guild).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ApplyError);
    const partial = (error as ApplyError).partial;
    expect(partial.mapping.channelIds.staff).toBeDefined();
    expect(partial.mapping.channelIds["staff:staff-chat"]).toBeUndefined();

    guild.failOn = undefined;
    const resumed = planProvisioning(
      blueprint,
      await guild.observe(),
      partial.mapping,
    );
    expect(
      resumed.operations.filter((op) => op.action === "create-channel"),
    ).toHaveLength(
      blueprint.channels.length -
        Object.keys(partial.mapping.channelIds).length,
    );
  });

  it("refuses to apply a channel with an unresolved principal", async () => {
    const guild = FakeGuild.fresh(requiredBotPermissions);
    guild.state.roles = guild.state.roles.filter((role) => !role.managed);
    delete guild.state.bot;
    const plan = planProvisioning(blueprint, await guild.observe());
    expect(plan.conflicts.map((item) => item.key)).toContain("kush-bot");
    const channelsOnly = {
      ...plan,
      operations: plan.operations.filter(
        (op) => op.action === "create-channel",
      ),
    };
    await expect(applyPlan(channelsOnly, guild)).rejects.toThrow(
      /is unresolved; refusing a partial overwrite set/,
    );
    expect(
      guild.calls.filter((call) => call.startsWith("createChannel")),
    ).toEqual([]);
  });
});

describe("hierarchy and bot authority", () => {
  it("flags a bot role with extra or missing permissions", async () => {
    const guild = FakeGuild.fresh(requiredBotPermissions | P.Administrator);
    const plan = planProvisioning(blueprint, await guild.observe());
    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({
        key: "kush-bot",
        reason: expect.stringContaining("unexpected Administrator"),
      }),
    );
  });

  it("does not propose edits to roles above the bot", () => {
    const observed = observedWith(correctOverwrites);
    observed.bot = { userId: "bot-user", roleId: "kush-bot" };
    const developer = observed.roles.find((role) => role.id === "developer")!;
    developer.colour = 0;
    const plan = planProvisioning(onlyStaffChat, observed);
    expect(plan.operations).toEqual([]);
    expect(plan.conflicts).toMatchObject([
      { key: "developer", reason: expect.stringContaining("manually") },
    ]);
  });

  it("reports a channel the bot can no longer manage as an owner action", () => {
    const observed = observedWith([]);
    observed.bot = { userId: "bot-user", roleId: "kush-bot" };
    observed.channels[0]!.overwrites = [
      { id: "guild", allow: 0n, deny: P.ViewChannel },
    ];
    const plan = planProvisioning(onlyStaffChat, observed);
    expect(plan.operations).toEqual([]);
    expect(plan.conflicts[0]?.reason).toMatch(/bot cannot manage/);
  });
});

describe("v1 to v2 migration", () => {
  // Reproduces the state written by .local/apply-discord.mjs: v1 roles with
  // no permissions and staff/management channels with no overwrites.
  const v1: ObservedGuild = {
    guildId: "guild",
    bot: { userId: "bot-user", roleId: "bot" },
    roles: [
      {
        id: "guild",
        name: "@everyone",
        colour: 0,
        permissions: P.ViewChannel | P.SendMessages | P.ReadMessageHistory,
        hoist: false,
        position: 0,
      },
      {
        id: "bot",
        name: "KUSH Bot",
        colour: 0,
        permissions: requiredBotPermissions,
        hoist: false,
        position: 30,
        managed: true,
      },
      {
        id: "v1-owner",
        name: "Owner",
        colour: 0x7c3aed,
        permissions: 0n,
        hoist: true,
        position: 20,
      },
      {
        id: "v1-support",
        name: "Support Team",
        colour: 0x16a34a,
        permissions: 0n,
        hoist: false,
        position: 15,
      },
      {
        id: "v1-management",
        name: "Management",
        colour: 0x5b21b6,
        permissions: 0n,
        hoist: true,
        position: 18,
      },
      {
        id: "v1-member",
        name: "Member",
        colour: 0x64748b,
        permissions: 0n,
        hoist: false,
        position: 2,
      },
    ],
    channels: [
      {
        id: "v1-staff-cat",
        name: "08 — STAFF OPERATIONS",
        type: ChannelType.GuildCategory,
        parentId: null,
        overwrites: [],
      },
      {
        id: "v1-staff-chat",
        name: "staff-chat",
        type: ChannelType.GuildText,
        parentId: "v1-staff-cat",
        overwrites: [],
      },
      {
        id: "v1-staff-tasks",
        name: "staff-tasks",
        type: ChannelType.GuildText,
        parentId: "v1-staff-cat",
        overwrites: [],
      },
      {
        id: "v1-financial",
        name: "financial-planning",
        type: ChannelType.GuildText,
        parentId: null,
        overwrites: [],
      },
      {
        id: "v1-showcase",
        name: "showcase",
        type: ChannelType.GuildText,
        parentId: null,
        overwrites: [],
      },
    ],
  };
  const v1Ids = {
    roleIds: {
      owner: "v1-owner",
      "support-team": "v1-support",
      management: "v1-management",
      member: "v1-member",
    },
    channelIds: {
      "08-staff-operations": "v1-staff-cat",
      "08-staff-operations:staff-chat": "v1-staff-chat",
      "08-staff-operations:staff-tasks": "v1-staff-tasks",
      "09-management:financial-planning": "v1-financial",
      "02-community:showcase": "v1-showcase",
    },
  };
  const plan = planProvisioning(blueprint, v1, v1Ids);

  it("adopts legacy IDs instead of creating duplicates", () => {
    expect(plan.resolved.roleIds["support-staff"]).toBe("v1-support");
    expect(plan.resolved.channelIds["staff:staff-chat"]).toBe("v1-staff-chat");
    expect(plan.resolved.channelIds["community:showcases"]).toBe("v1-showcase");
    expect(
      plan.operations.some(
        (op) => op.action === "create-channel" && op.key === "staff:staff-chat",
      ),
    ).toBe(false);
  });

  it("renames adopted roles and flags exposed private channels", () => {
    expect(plan.operations).toContainEqual(
      expect.objectContaining({
        action: "update-role",
        key: "support-staff",
        changes: expect.arrayContaining([
          'name "Support Team" → "Support Staff"',
        ]),
      }),
    );
    expect(plan.operations).toContainEqual(
      expect.objectContaining({
        action: "update-channel",
        key: "staff:staff-chat",
        exposure: true,
      }),
    );
  });

  it("reports unmanaged legacy resources and their exposure without deleting them", () => {
    expect(plan.unmanaged.roles.map((role) => role.name)).toContain(
      "Management",
    );
    expect(plan.unmanaged.channels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "staff-tasks",
          visibleToMembers: true,
        }),
        expect.objectContaining({
          name: "financial-planning",
          visibleToMembers: true,
        }),
      ]),
    );
    expect(JSON.stringify(serialisePlan(plan.operations))).not.toMatch(
      /delete/,
    );
  });

  it("can propose restricting exposed unmanaged channels when asked", () => {
    const restricting = planProvisioning(blueprint, v1, v1Ids, {
      restrictUnmanaged: true,
    });
    expect(
      restricting.operations
        .filter((op) => op.action === "restrict-unmanaged-channel")
        .map((op) => (op as { name: string }).name)
        .sort(),
    ).toEqual(["financial-planning", "staff-tasks"]);
  });
});

describe("@everyone permissions", () => {
  it("reconciles default @everyone permissions to the blueprint", async () => {
    const guild = FakeGuild.fresh(requiredBotPermissions);
    guild.role("@everyone").permissions =
      P.ViewChannel | P.SendMessages | P.CreateInstantInvite;
    const plan = planProvisioning(blueprint, await guild.observe());
    expect(plan.operations).toContainEqual(
      expect.objectContaining({
        action: "update-everyone",
        permissions: blueprint.everyonePermissions,
      }),
    );
    await applyPlan(plan, guild);
    expect(guild.role("@everyone").permissions).toBe(
      blueprint.everyonePermissions,
    );
  });

  it("asks the owner when the bot lacks a bit @everyone needs", async () => {
    const guild = FakeGuild.fresh(
      requiredBotPermissions & ~P.UseApplicationCommands,
    );
    const plan = planProvisioning(blueprint, await guild.observe());
    expect(plan.conflicts.map((item) => item.key)).toContain("everyone");
  });
});

describe("snapshots and review gate", () => {
  it("round-trips a snapshot with bigint permissions", async () => {
    const guild = FakeGuild.fresh(requiredBotPermissions);
    const observed = await guild.observe();
    const revived = reviveObservedGuild(
      JSON.parse(JSON.stringify(serialisePlan(observed))),
    );
    expect(revived).toEqual(observed);
    expect(() => reviveObservedGuild({ roles: [], channels: [] })).toThrow(
      /guildId/,
    );
  });

  it("changes the plan hash whenever operations change", async () => {
    const guild = FakeGuild.fresh(requiredBotPermissions);
    const before = planProvisioning(blueprint, await guild.observe());
    expect(planHash(before)).toBe(
      planHash(planProvisioning(blueprint, await guild.observe())),
    );
    await applyPlan(before, guild);
    expect(
      planHash(planProvisioning(blueprint, await guild.observe())),
    ).not.toBe(planHash(before));
  });
});

describe("security lockdown", () => {
  it("restricts exposed sensitive channels and keeps bot access", async () => {
    const { planLockdown, applyLockdown } =
      await import("../src/provisioning.js");
    const guild = new FakeGuild({
      guildId: "guild",
      bot: { userId: "bot-user", roleId: "bot" },
      roles: [
        {
          id: "guild",
          name: "@everyone",
          colour: 0,
          permissions: P.ViewChannel | P.SendMessages,
          hoist: false,
          position: 0,
        },
        {
          id: "bot",
          name: "KUSH",
          colour: 0,
          permissions: P.ViewChannel | P.ManageChannels | P.ManageRoles,
          hoist: false,
          position: 5,
          managed: true,
        },
      ],
      channels: [
        {
          id: "cat",
          name: "08 — STAFF OPERATIONS",
          type: ChannelType.GuildCategory,
          parentId: null,
          overwrites: [],
        },
        {
          id: "chat",
          name: "staff-chat",
          type: ChannelType.GuildText,
          parentId: "cat",
          overwrites: [],
        },
        {
          id: "tasks",
          name: "staff-tasks",
          type: ChannelType.GuildText,
          parentId: "cat",
          overwrites: [],
        },
        {
          id: "general",
          name: "general",
          type: ChannelType.GuildText,
          parentId: null,
          overwrites: [],
        },
      ],
    });
    const ids = {
      channelIds: {
        "08-staff-operations": "cat",
        "08-staff-operations:staff-chat": "chat",
      },
    };
    const targets = planLockdown(blueprint, await guild.observe(), ids);
    expect(targets.map((item) => item.name).sort()).toEqual(
      ["08 — STAFF OPERATIONS", "staff-chat", "staff-tasks"].sort(),
    );
    await applyLockdown(targets, await guild.observe(), guild);
    expect(planLockdown(blueprint, await guild.observe(), ids)).toEqual([]);
    const general = guild.state.channels.find((item) => item.id === "general")!;
    expect(general.overwrites).toEqual([]);
    const chat = guild.state.channels.find((item) => item.id === "chat")!;
    expect(chat.overwrites).toContainEqual(
      expect.objectContaining({ id: "bot", allow: expect.any(BigInt) }),
    );
  });
});

// Regression: the hash was taken over the raw operations, whose `changes`
// strings follow Discord's arbitrary overwrite order. Three consecutive
// inspects of an unchanged guild produced three different hashes, so the
// --plan-hash approval gate could never be satisfied.
describe("plan hash determinism", () => {
  const shuffle = <T>(items: readonly T[], seed: number): T[] => {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const target = seed % (index + 1);
      [copy[index], copy[target]] = [copy[target]!, copy[index]!];
    }
    return copy;
  };

  it("is identical when Discord returns the same guild in a different order", () => {
    const base = observedWith([
      ...correctOverwrites.slice(1),
      { id: "member", allow: P.ViewChannel, deny: 0n },
    ]);
    const hashes = [1, 2, 3, 4].map((seed) =>
      planHash(
        planProvisioning(onlyStaffChat, {
          ...base,
          roles: shuffle(base.roles, seed),
          channels: base.channels.map((channel) => ({
            ...channel,
            overwrites: shuffle(channel.overwrites ?? [], seed),
          })),
        }),
      ),
    );
    expect(new Set(hashes).size).toBe(1);
  });

  it("still changes when the plan actually changes", () => {
    const clean = planHash(
      planProvisioning(onlyStaffChat, observedWith(correctOverwrites)),
    );
    const drifted = planHash(planProvisioning(onlyStaffChat, observedWith([])));
    expect(clean).not.toBe(drifted);
  });
});
