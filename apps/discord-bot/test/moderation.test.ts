import { describe, expect, it } from "vitest";
import type { EmbedBuilder } from "discord.js";
import type { CaseInput, ModerationCase } from "../src/api-client.js";
import type { RoleKey } from "../src/blueprint.js";
import type { ModerationGateway } from "../src/moderation/commands.js";
import { caseForEntry } from "../src/moderation/mod-log.js";
import type { Actor } from "../src/runtime/authority.js";
import {
  CommandRouter,
  type BotReply,
  type BotServices,
} from "../src/runtime/command.js";
import { HealthMonitor } from "../src/runtime/health.js";
import { createLogger } from "../src/runtime/logger.js";
import { tokenise } from "../src/runtime/prefix.js";
import { commands } from "../src/runtime/registry.js";
import { AuditLogEvent } from "discord.js";

const MOD = "11111111111111111";
const TARGET = "44444444444444444";
const STAFF = "55555555555555555";
const MOD_ROLE = "66666666666666666";
const SUPPORT = "77777777777777777";
const SUPPORT_ROLE = "66666666666666667";

const actor = (roles: RoleKey[]): Actor => ({
  userId: MOD,
  displayName: "Mod",
  roles: new Set(roles),
  isGuildOwner: false,
});

function harness(options: { canBan?: boolean } = {}) {
  const calls: string[] = [];
  const cases: CaseInput[] = [];
  const logged: EmbedBuilder[] = [];
  const dms: string[] = [];
  const posted: { channelId: string; title: string }[] = [];
  const api: string[] = [];
  const reports: string[] = [];
  const privates: string[] = [];
  const moderation: ModerationGateway = {
    member: async (id) =>
      id === TARGET
        ? { roleIds: [], isOwner: false, isBot: false }
        : id === STAFF
          ? { roleIds: [MOD_ROLE], isOwner: false, isBot: false }
          : id === SUPPORT
            ? { roleIds: [SUPPORT_ROLE], isOwner: false, isBot: false }
            : null,
    permitted: (kind) => (kind === "ban" ? Boolean(options.canBan) : true),
    timeout: async (id, ms) => void calls.push(`timeout ${id} ${ms}`),
    kick: async (id) => void calls.push(`kick ${id}`),
    ban: async (id) => void calls.push(`ban ${id}`),
    unban: async (id) => void calls.push(`unban ${id}`),
    notify: async (id) => (dms.push(id), true),
    log: async (embed) => void logged.push(embed),
    removeRoles: async (id, roleIds) =>
      void calls.push(`remove ${id} ${roleIds.join(",")}`),
    post: async (channelId, embed) => {
      posted.push({ channelId, title: String(embed.data.title) });
      return "777777777777777777";
    },
    deleteMessage: async (channelId, messageId) =>
      void calls.push(`delete ${channelId} ${messageId}`),
  };
  const services = {
    config: {
      applicationId: "12345678901234567",
      guildId: "22345678901234567",
      apiBaseUrl: "http://127.0.0.1:4310",
      supportTenantId: "11111111-1111-4111-8111-111111111111",
      roleIds: { moderator: MOD_ROLE, "ticket-staff": SUPPORT_ROLE },
      channelIds: {
        "community:vouches": "888888888888888881",
        "staff:bot-log": "888888888888888882",
      },
      panelMessages: {},
    },
    componentSecret: "component-secret-with-at-least-32-characters",
    health: new HealthMonitor("22345678901234567", () => 0),
    log: createLogger(() => undefined),
    now: () => 0,
    observeGuild: async () => {
      throw new Error("unused");
    },
    memberRoleIds: async () => null,
    audit: () => undefined,
    moderation,
    api: {
      recordCase: async (input: CaseInput): Promise<ModerationCase> => {
        cases.push(input);
        return {
          ...input,
          number: cases.length,
          durationSeconds: input.durationSeconds ?? null,
          createdAt: new Date(0).toISOString(),
        };
      },
      vouch: async (input: { rating: number }) => {
        api.push(`vouch ${input.rating}`);
        return { number: 7, ...input };
      },
      setVouchMessage: async (n: number, id: string) =>
        void api.push(`message ${n} ${id}`),
      hideVouch: async (n: number) => {
        api.push(`hide ${n}`);
        return { hidden: true, messageId: "777777777777777777" };
      },
      offboard: async (id: string, reason: string) => {
        api.push(`offboard ${id} ${reason}`);
        return {
          recorded: true,
          ticketsUnassigned: 2,
          commissionsUnassigned: 1,
        };
      },
      create: async (input: { category: string; description: string }) => {
        api.push(`ticket ${input.category}`);
        reports.push(input.description);
        return {
          reference: "#0099",
          ticket: { id: "t1", number: 99 },
          queue: input.category === "member-report" ? "reports" : "support",
          channel: null,
        };
      },
      memberEntitlements: async () => ({
        linked: true,
        entitlements: [
          { productName: "TEST Toolkit", status: "active", expiresAt: null },
          { productName: "TEST Old", status: "revoked", expiresAt: null },
        ],
      }),
    } as unknown as BotServices["api"],
    tickets: {
      channels: new Map(),
      open: async () => "888888888888888899",
    } as unknown as BotServices["tickets"],
  } satisfies BotServices;
  const router = new CommandRouter(commands);
  const run = async (content: string, roles: RoleKey[] = ["moderator"]) => {
    const replies: BotReply[] = [];
    const resolved = router.resolve(tokenise(content)!)!;
    await router.dispatch(resolved.command, {
      source: "prefix",
      actor: actor(roles),
      guildId: services.config.guildId,
      channelId: "33345678901234567",
      args: resolved.args,
      services,
      reply: async (reply) => void replies.push(reply),
      replyPrivately: async (reply) => (
        privates.push(JSON.stringify(reply)),
        "dm"
      ),
    });
    return replies.map((reply) => JSON.stringify(reply)).join("\n");
  };
  return { run, calls, cases, logged, dms, posted, api, reports, privates };
}

describe("moderation commands", () => {
  it("times out, notifies, records a case and logs it", async () => {
    const h = harness();
    const reply = await h.run(`!timeout <@${TARGET}> 15 spamming links`);
    expect(h.calls).toEqual([`timeout ${TARGET} 900000`]);
    expect(h.dms).toEqual([TARGET]);
    expect(h.cases[0]).toMatchObject({
      kind: "timeout",
      targetId: TARGET,
      moderatorId: MOD,
      reason: "spamming links",
      durationSeconds: 900,
      source: "bot",
    });
    expect(reply).toContain("Case **#1**");
    expect(h.logged[0]!.data.title).toContain("Case #1");
  });

  it("warns without any Discord action", async () => {
    const h = harness();
    await h.run(`!warn <@${TARGET}> be kind`);
    expect(h.calls).toEqual([]);
    expect(h.cases[0]).toMatchObject({ kind: "warn", reason: "be kind" });
  });

  it("refuses self, staff, missing reasons and bad durations", async () => {
    const h = harness();
    expect(await h.run(`!warn <@${MOD}> test`)).toContain("yourself");
    expect(await h.run(`!kick <@${STAFF}> test`)).toContain("KUSH staff");
    expect(await h.run(`!warn <@${TARGET}>`)).toContain("reason");
    expect(await h.run(`!timeout <@${TARGET}> 99999 x`)).toContain(
      "whole number",
    );
    expect(h.cases).toEqual([]);
    expect(h.calls).toEqual([]);
  });

  it("does not DM or record when the bot lacks the permission", async () => {
    const h = harness({ canBan: false });
    const reply = await h.run(`!ban <@${TARGET}> raiding`);
    expect(reply).toContain("Discord's own ban option");
    expect(h.dms).toEqual([]);
    expect(h.cases).toEqual([]);
  });

  it("is moderator-only", async () => {
    const h = harness();
    expect(await h.run(`!warn <@${TARGET}> hi`, ["member"])).toContain(
      "do not have access",
    );
    expect(h.cases).toEqual([]);
  });
});

describe("audit-log cases", () => {
  const entry = (action: AuditLogEvent, changes: object[] = []) =>
    ({
      action,
      targetId: TARGET,
      executorId: MOD,
      reason: null,
      changes,
    }) as unknown as Parameters<typeof caseForEntry>[0];

  it("turns Discord-UI bans, kicks and timeouts into cases", () => {
    expect(caseForEntry(entry(AuditLogEvent.MemberBanAdd))).toMatchObject({
      kind: "ban",
      source: "discord",
      reason: "No reason given",
    });
    expect(
      caseForEntry(
        entry(AuditLogEvent.MemberUpdate, [
          { key: "communication_disabled_until", new: null },
        ]),
      ),
    ).toMatchObject({ kind: "untimeout" });
    expect(
      caseForEntry(entry(AuditLogEvent.MemberUpdate, [{ key: "nick" }])),
    ).toBeNull();
    expect(caseForEntry(entry(AuditLogEvent.MessageDelete))).toBeNull();
  });
});

describe("command names", () => {
  it("has no duplicate command paths", () => {
    const paths = commands.map((command) => command.path.join(" "));
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("vouches", () => {
  it("lets verified customers vouch and posts the card", async () => {
    const h = harness();
    const reply = await h.run("!vouch 5 Brilliant work, very fast", [
      "member",
      "verified-customer",
    ]);
    expect(h.api).toEqual(["vouch 5", "message 7 777777777777777777"]);
    expect(h.posted[0]).toEqual({
      channelId: "888888888888888881",
      title: "⭐ Vouch #7",
    });
    expect(reply).toContain("#7");
  });

  it("refuses non-customers, bad ratings and short reviews", async () => {
    const h = harness();
    expect(await h.run("!vouch 5 Brilliant work", ["member"])).toContain(
      "verified customers",
    );
    const customer: RoleKey[] = ["member", "verified-customer"];
    expect(await h.run("!vouch 6 Brilliant work here", customer)).toContain(
      "Usage",
    );
    expect(await h.run("!vouch 4 ok", customer)).toContain("10 to 600");
    expect(h.api).toEqual([]);
  });

  it("lets moderators remove a vouch everywhere", async () => {
    const h = harness();
    await h.run("!unvouch #7");
    expect(h.api).toEqual(["hide 7"]);
    expect(h.calls).toEqual(["delete 888888888888888881 777777777777777777"]);
  });
});

describe("offboarding", () => {
  it("removes staff roles, records it and logs the hand-back", async () => {
    const h = harness();
    const reply = await h.run(`!offboard <@${SUPPORT}> moved on`, [
      "administrator",
    ]);
    expect(h.calls).toEqual([`remove ${SUPPORT} ${SUPPORT_ROLE}`]);
    expect(h.api).toEqual([`offboard ${SUPPORT} moved on`]);
    expect(h.dms).toEqual([SUPPORT]);
    expect(h.posted[0]!.channelId).toBe("888888888888888882");
    expect(reply).toContain("offboarded");
  });

  it("is admin-only and needs a staff target", async () => {
    const h = harness();
    expect(await h.run(`!offboard <@${SUPPORT}> x`)).toContain(
      "do not have access",
    );
    expect(
      await h.run(`!offboard <@${TARGET}> x`, ["administrator"]),
    ).toContain("doesn't hold any KUSH staff role");
    expect(h.calls).toEqual([]);
  });
});

describe("reports and downloads", () => {
  it("files a private member report for moderators", async () => {
    const h = harness();
    const reply = await h.run(
      `!report <@${TARGET}> posting scam links in general`,
      ["member"],
    );
    expect(h.api).toEqual(["ticket member-report"]);
    expect(h.reports[0]).toContain(`<@${TARGET}>`);
    expect(h.reports[0]).toContain("posting scam links");
    expect(h.privates[0]).toContain("888888888888888899");
    expect(reply).toContain("privately");
    expect(await h.run("!report nobody", ["member"])).toContain("Usage");
  });

  it("lists only active products and points to the website for files", async () => {
    const h = harness();
    await h.run("!downloads", ["member"]);
    expect(h.privates[0]).toContain("TEST Toolkit");
    expect(h.privates[0]).not.toContain("TEST Old");
    expect(h.privates[0]).toContain("Downloads");
  });
});
