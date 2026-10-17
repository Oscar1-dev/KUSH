import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ChannelType, PermissionFlagsBits as P } from "discord.js";
import {
  blueprint,
  botManagedRoles,
  participation,
  requiredBotPermissions,
  rolesAfterRestriction,
  ticketChannelOverwrites,
  type RoleKey,
} from "../src/blueprint.js";
import {
  accessLevel,
  buildMatrix,
  personaPermissions,
  personas,
  renderMatrixMarkdown,
  simulatedOverwrites,
  type AccessLevel,
} from "../src/permission-matrix.js";
import { has } from "../src/permissions.js";

const matrix = buildMatrix(blueprint);
const cell = (channelKey: string, persona: string): AccessLevel => {
  const row = matrix.find((item) => item.channel.key === channelKey);
  if (!row) throw new Error(`unknown channel ${channelKey}`);
  return row.access[persona]!;
};
const channelsWhere = (predicate: (key: string) => boolean) =>
  matrix.map((row) => row.channel.key).filter(predicate);
const persona = (key: string) => personas.find((item) => item.key === key)!;

const privateStaff = channelsWhere(
  (key) => key.startsWith("staff:") || key.startsWith("owner:"),
);
const customerOnly = ["products:downloads", "products:setup-guides"];
const programmes = [
  "partnerships:reseller-programme",
  "partnerships:seller-programme",
  "partnerships:creative-partners",
];
const informational = channelsWhere(
  (key) =>
    (key.startsWith("information:") && key !== "information:do-not-post") ||
    key.startsWith("studio:") ||
    key.startsWith("support:") ||
    key === "partnerships:partner-information" ||
    [
      "products:products",
      "products:releases",
      "products:known-issues",
    ].includes(key),
);
const communityChannels = channelsWhere((key) => key.startsWith("community:"));

describe("blueprint v2 structure", () => {
  it("defines the requested role hierarchy with unique keys and names", () => {
    expect(blueprint.roles.map((role) => role.name)).toEqual([
      "Owner",
      "Administrator",
      "Developer",
      "Support Lead",
      "Support Staff",
      "Moderator",
      "KUSH Bot",
      "Creative Partner",
      "Verified Reseller",
      "Approved Seller",
      "Verified Customer",
      "Beta Tester",
      "Member",
      "Restricted",
    ]);
    const keys = blueprint.channels.map((channel) => channel.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("places the bot directly above exactly the roles it manages", () => {
    const order = blueprint.roles.map((role) => role.key);
    const botIndex = order.indexOf("kush-bot");
    expect(order.slice(botIndex + 1)).toEqual(botManagedRoles);
  });

  it("gives Administrator only to the Owner role", () => {
    for (const role of blueprint.roles)
      expect(Boolean(role.permissions & P.Administrator)).toBe(
        role.key === "owner",
      );
    expect(blueprint.everyonePermissions & P.Administrator).toBe(0n);
  });

  it("only uses permission bits the bot can actually write", () => {
    for (const channel of blueprint.channels)
      for (const overwrite of channel.overwrites)
        expect(
          (overwrite.allow | overwrite.deny) & ~requiredBotPermissions,
        ).toBe(0n);
    for (const key of botManagedRoles) {
      const role = blueprint.roles.find((item) => item.key === key)!;
      expect(role.permissions & ~requiredBotPermissions).toBe(0n);
    }
  });

  // Regression (live apply, 17 Oct): an @everyone deny applies to the bot too,
  // so if the bot's own allow does not re-grant a denied bit it loses that
  // permission in the channel and Discord refuses the write with 50013.
  it("re-grants the bot every bit any @everyone overwrite denies", () => {
    for (const channel of blueprint.channels) {
      const everyone = channel.overwrites.find(
        (item) => item.principal === "everyone",
      );
      const bot = channel.overwrites.find(
        (item) => item.principal === "kush-bot",
      );
      if (!everyone?.deny || !bot) continue;
      const manageable = everyone.deny & ~P.ViewChannel;
      expect(manageable & ~bot.allow, channel.key).toBe(0n);
    }
  });

  it("never grants the bot dangerous permissions", () => {
    for (const flag of [
      P.Administrator,
      P.ManageGuild,
      P.MentionEveryone,
      P.ManageWebhooks,
      P.KickMembers,
      P.BanMembers,
    ])
      expect(requiredBotPermissions & flag).toBe(0n);
  });

  it("denies @everyone ViewChannel on every private channel", () => {
    for (const key of [...privateStaff, ...customerOnly, ...programmes]) {
      const channel = blueprint.channels.find((item) => item.key === key)!;
      const everyone = channel.overwrites.find(
        (item) => item.principal === "everyone",
      );
      expect(everyone?.deny ?? 0n, key).toBe(
        (everyone?.deny ?? 0n) | P.ViewChannel,
      );
    }
  });

  it("keeps ordinary participation out of channel allows for roles kept under restriction", () => {
    for (const channel of blueprint.channels)
      for (const overwrite of channel.overwrites)
        if (overwrite.principal === "member")
          expect(overwrite.allow & participation, channel.key).toBe(0n);
  });
});

describe("effective permissions by role", () => {
  it("lets visitors read information but not write or see private areas", () => {
    for (const key of informational)
      expect(cell(key, "visitor"), key).toBe("read");
    for (const key of communityChannels)
      expect(cell(key, "visitor"), key).toBe("read");
    for (const key of [...privateStaff, ...customerOnly, ...programmes])
      expect(cell(key, "visitor"), key).toBe("none");
  });

  it("lets members write in community channels only", () => {
    for (const key of communityChannels)
      expect(cell(key, "member"), key).toBe("write");
    for (const key of informational)
      expect(cell(key, "member"), key).toBe("read");
    for (const key of [...privateStaff, ...customerOnly, ...programmes])
      expect(cell(key, "member"), key).toBe("none");
  });

  it("makes the honeypot writable by members so compromised accounts trip it", () => {
    expect(cell("information:do-not-post", "member")).toBe("write");
    expect(cell("information:do-not-post", "visitor")).toBe("read");
    expect(cell("information:do-not-post", "restricted")).toBe("read");
  });

  it("gives customers read access to downloads and guides only", () => {
    for (const key of customerOnly)
      expect(cell(key, "customer"), key).toBe("read");
    for (const key of [...privateStaff, ...programmes])
      expect(cell(key, "customer"), key).toBe("none");
    expect(cell("products:beta-programme", "customer")).toBe("none");
  });

  it("isolates partner programmes from each other", () => {
    const holders: Record<string, string> = {
      "partnerships:reseller-programme": "reseller",
      "partnerships:seller-programme": "seller",
      "partnerships:creative-partners": "creative",
    };
    for (const [channel, holder] of Object.entries(holders))
      for (const candidate of ["reseller", "seller", "creative", "customer"])
        expect(cell(channel, candidate), `${channel}/${candidate}`).toBe(
          candidate === holder ? "write" : "none",
        );
  });

  it("keeps moderators out of support, business and customer records", () => {
    for (const key of [
      "staff:ticket-queue",
      "staff:bot-log",
      "owner:owner-operations",
      "owner:confidential-partnerships",
      "owner:security-events",
      "owner:infrastructure",
      ...customerOnly,
    ])
      expect(cell(key, "moderator"), key).toBe("none");
    expect(cell("staff:moderation-log", "moderator")).toBe("read");
    for (const key of communityChannels)
      expect(cell(key, "moderator"), key).toBe("manage");
  });

  it("gives support staff the queue but not moderation or owner channels", () => {
    expect(cell("staff:ticket-queue", "support-staff")).toBe("write");
    expect(cell("staff:moderation-log", "support-staff")).toBe("none");
    for (const key of channelsWhere((key) => key.startsWith("owner:")))
      expect(cell(key, "support-staff"), key).toBe("none");
    expect(cell("staff:ticket-queue", "support-lead")).toBe("manage");
  });

  it("gives developers engineering access without owner or moderation access", () => {
    expect(cell("staff:bot-log", "developer")).toBe("read");
    expect(cell("staff:operational-alerts", "developer")).toBe("read");
    expect(cell("products:releases", "developer")).toBe("write");
    expect(cell("products:beta-programme", "developer")).toBe("manage");
    for (const key of channelsWhere((key) => key.startsWith("owner:")))
      expect(cell(key, "developer"), key).toBe("none");
    expect(cell("staff:moderation-log", "developer")).toBe("none");
    expect(cell("staff:ticket-queue", "developer")).toBe("none");
  });

  it("keeps administrators out of owner-only channels", () => {
    expect(cell("owner:owner-operations", "administrator")).toBe("none");
    expect(cell("owner:confidential-partnerships", "administrator")).toBe(
      "none",
    );
    expect(cell("owner:security-events", "administrator")).toBe("read");
  });

  it("gives the Owner role every channel", () => {
    for (const row of matrix)
      expect(row.access["owner-role"], row.channel.key).toBe("manage");
  });

  it("excludes the bot from owner-only channels but lets it post elsewhere", () => {
    expect(cell("owner:owner-operations", "bot")).toBe("none");
    expect(cell("owner:confidential-partnerships", "bot")).toBe("none");
    expect(cell("staff:moderation-log", "bot")).toBe("manage");
    expect(cell("information:announcements", "bot")).toBe("manage");
  });

  it("never lets the bot mention everyone", () => {
    for (const row of blueprint.channels) {
      const permissions = personaPermissions(blueprint, persona("bot"), {
        type: row.type,
        overwrites: simulatedOverwrites(row.overwrites),
      });
      expect(permissions & P.MentionEveryone, row.key).toBe(0n);
    }
  });
});

describe("restriction", () => {
  it("strips every access-granting role", () => {
    expect(
      rolesAfterRestriction([
        "member",
        "verified-customer",
        "beta-tester",
        "support-staff",
      ]).sort(),
    ).toEqual(["member", "restricted"]);
  });

  it("removes all participation for a restricted member", () => {
    for (const row of matrix) {
      expect(["none", "read"], row.channel.key).toContain(
        row.access.restricted,
      );
      const permissions = personaPermissions(blueprint, persona("restricted"), {
        type: row.channel.type,
        overwrites: simulatedOverwrites(row.channel.overwrites),
      });
      expect(
        permissions & (participation & ~P.UseApplicationCommands),
        row.channel.key,
      ).toBe(0n);
    }
  });

  it("documents why roles are stripped: Discord lets another role's allow beat Restricted", () => {
    const raw: RoleKey[] = ["member", "beta-tester", "restricted"];
    const beta = blueprint.channels.find(
      (item) => item.key === "products:beta-programme",
    )!;
    const permissions = personaPermissions(
      blueprint,
      { key: "raw", label: "raw", memberId: "raw", roles: raw },
      { type: beta.type, overwrites: simulatedOverwrites(beta.overwrites) },
    );
    expect(has(permissions, P.SendMessages)).toBe(true);
  });

  it("silences timed-out members everywhere", () => {
    for (const row of matrix)
      expect(["none", "read"], row.channel.key).toContain(
        row.access["timed-out"],
      );
  });
});

describe("private tickets", () => {
  const evaluate = (
    kind: "support" | "report",
    who: { memberId: string; roles: RoleKey[] },
    creatorId = "creator",
    assigneeIds = ["assigned-staff"],
  ) =>
    accessLevel(
      personaPermissions(
        blueprint,
        { key: who.memberId, label: who.memberId, ...who },
        {
          type: ChannelType.GuildText,
          overwrites: simulatedOverwrites(
            ticketChannelOverwrites({ kind, creatorId, assigneeIds }),
          ),
        },
      ),
    );

  it("admits the creator, assignee, Support Lead and bot only", () => {
    expect(
      evaluate("support", { memberId: "creator", roles: ["member"] }),
    ).toBe("write");
    expect(
      evaluate("support", {
        memberId: "creator",
        roles: ["member", "verified-customer"],
      }),
    ).toBe("write");
    expect(
      evaluate("support", {
        memberId: "assigned-staff",
        roles: ["member", "support-staff"],
      }),
    ).toBe("write");
    expect(
      evaluate("support", {
        memberId: "lead",
        roles: ["member", "support-lead"],
      }),
    ).toBe("write");
    expect(evaluate("support", { memberId: "bot", roles: ["kush-bot"] })).toBe(
      "manage",
    );
  });

  it("denies other customers, unassigned staff and moderators", () => {
    expect(
      evaluate("support", {
        memberId: "customer-b",
        roles: ["member", "verified-customer"],
      }),
    ).toBe("none");
    expect(
      evaluate("support", {
        memberId: "other-staff",
        roles: ["member", "support-staff"],
      }),
    ).toBe("none");
    expect(
      evaluate("support", { memberId: "mod", roles: ["member", "moderator"] }),
    ).toBe("none");
    expect(
      evaluate("support", {
        memberId: "admin",
        roles: ["member", "administrator"],
      }),
    ).toBe("none");
  });

  it("isolates moderation reports from support staff", () => {
    expect(
      evaluate(
        "report",
        { memberId: "lead", roles: ["member", "support-lead"] },
        "creator",
        [],
      ),
    ).toBe("none");
    expect(
      evaluate(
        "report",
        { memberId: "staff", roles: ["member", "support-staff"] },
        "creator",
        [],
      ),
    ).toBe("none");
    expect(
      evaluate(
        "report",
        { memberId: "mod", roles: ["member", "moderator"] },
        "creator",
        [],
      ),
    ).toBe("write");
  });

  it("lets a restricted member reply in their own ticket (appeals)", () => {
    expect(
      evaluate("support", {
        memberId: "creator",
        roles: rolesAfterRestriction(["member"]),
      }),
    ).toBe("write");
  });
});

describe("generated documentation", () => {
  it("matches the committed permission matrix", () => {
    const committed = readFileSync(
      new URL("../../../docs/discord/PERMISSION-MATRIX.md", import.meta.url),
      "utf8",
    ).replaceAll("\r\n", "\n");
    expect(committed).toBe(renderMatrixMarkdown(blueprint));
  });
});
