import { describe, expect, it } from "vitest";
import type { RoleKey } from "../src/blueprint.js";
import { blueprint, requiredBotPermissions } from "../src/blueprint.js";
import { commandJson } from "../src/commands.js";
import { verifyComponentId } from "../src/component-id.js";
import { planProvisioning, applyPlan } from "../src/provisioning.js";
import {
  hasAuthority,
  roleKeysFor,
  type Actor,
} from "../src/runtime/authority.js";
import {
  CommandRouter,
  type AuditEvent,
  type BotReply,
  type BotServices,
  type CommandDefinition,
} from "../src/runtime/command.js";
import { HealthMonitor } from "../src/runtime/health.js";
import {
  formatLiveAccess,
  liveAccess,
} from "../src/runtime/live-permissions.js";
import { createLogger, redact } from "../src/runtime/logger.js";
import { resolvePath, tokenise } from "../src/runtime/prefix.js";
import { SlidingWindowLimiter } from "../src/runtime/rate-limit.js";
import { commands } from "../src/runtime/registry.js";
import { nextDelay, shouldRestart } from "../src/supervisor.js";
import { FakeGuild } from "./fake-guild.js";

const SECRET = "component-secret-with-at-least-32-characters";

const actor = (roles: RoleKey[], extra: Partial<Actor> = {}): Actor => ({
  userId: "11111111111111111",
  displayName: "Tester",
  roles: new Set(roles),
  isGuildOwner: false,
  ...extra,
});

/** Fake Discord surface: records public and private replies. */
function harness(clock = { now: 1_000_000 }) {
  const audits: AuditEvent[] = [];
  const logs: string[] = [];
  const guild = FakeGuild.fresh(requiredBotPermissions);
  const services: BotServices = {
    config: {
      applicationId: "12345678901234567",
      guildId: "22345678901234567",
      apiBaseUrl: "http://127.0.0.1:4310",
      supportTenantId: "11111111-1111-4111-8111-111111111111",
      roleIds: {},
      channelIds: {},
      panelMessages: {},
    },
    componentSecret: SECRET,
    health: new HealthMonitor("22345678901234567", () => clock.now),
    log: createLogger((line) => logs.push(line)),
    now: () => clock.now,
    observeGuild: () => guild.observe(),
    memberRoleIds: async () => null,
    audit: (event) => audits.push(event),
    api: {} as BotServices["api"],
    tickets: {
      channels: new Map(),
    } as unknown as BotServices["tickets"],
  };
  const router = new CommandRouter(commands, () => clock.now);
  const run = async (
    content: string,
    who: Actor,
    source: "prefix" | "slash" = "prefix",
  ) => {
    const publicReplies: BotReply[] = [];
    const privateReplies: BotReply[] = [];
    const resolved = router.resolve(tokenise(content)!);
    if (!resolved)
      return { outcome: "unknown" as const, publicReplies, privateReplies };
    const outcome = await router.dispatch(resolved.command, {
      source,
      actor: who,
      guildId: services.config.guildId,
      channelId: "33345678901234567",
      args: resolved.args,
      services,
      reply: async (reply) => void publicReplies.push(reply),
      replyPrivately: async (reply) => {
        privateReplies.push(reply);
        return source === "slash" ? "ephemeral" : "dm";
      },
    });
    return { outcome, publicReplies, privateReplies };
  };
  return { router, services, audits, logs, guild, run, clock };
}

const text = (reply: BotReply | undefined) => JSON.stringify(reply ?? {});

describe("prefix parsing", () => {
  it("tokenises prefix commands with quoted arguments", () => {
    expect(tokenise('!guide "KUSH Developer" now')).toEqual([
      "guide",
      "KUSH Developer",
      "now",
    ]);
    expect(tokenise("hello !help")).toBeNull();
    expect(tokenise("! help")).toBeNull();
    expect(tokenise("!")).toBeNull();
    expect(tokenise(`!${"x".repeat(2_000)}`)).toBeNull();
  });

  it("resolves the longest command path, case-insensitively, with aliases", () => {
    expect(resolvePath(["Setup", "Guide", "kush"], commands)).toMatchObject({
      command: { path: ["setup", "guide"] },
      args: ["kush"],
    });
    expect(resolvePath(["guide", "kush"], commands)?.command.path).toEqual([
      "guide",
    ]);
    expect(resolvePath(["support"], commands)?.command.path).toEqual([
      "ticket",
      "create",
    ]);
    // `!ticket` alone still opens a ticket; `!ticket close` is its own path.
    expect(resolvePath(["ticket"], commands)?.command.path).toEqual([
      "ticket",
      "create",
    ]);
    expect(resolvePath(["ticket", "close", "42"], commands)).toMatchObject({
      command: { path: ["ticket", "close"] },
      args: ["42"],
    });
    expect(resolvePath(["apply", "reseller"], commands)?.command.path).toEqual([
      "apply",
      "reseller",
    ]);
    expect(resolvePath(["unknown"], commands)).toBeNull();
  });

  it("registers every command the directive lists", () => {
    const names = commands.map((command) => `!${command.path.join(" ")}`);
    for (const required of [
      "!help",
      "!products",
      "!downloads",
      "!guide",
      "!setup guide",
      "!ticket create",
      "!ticket close",
      "!ticket claim",
      "!ticket add",
      "!ticket transcript",
      "!buy",
      "!orders",
      "!order",
      "!credit",
      "!referrals",
      "!referral rewards",
      "!referral leaderboard",
      "!commission create",
      "!commission status",
      "!commission quote",
      "!commission assign",
      "!commission update",
      "!commission complete",
      "!product create",
      "!product edit",
      "!product archive",
      "!staff orders",
      "!staff commissions",
      "!staff assign",
      "!staff customer",
      "!staff stats",
      "!status",
      "!licenses",
      "!account",
      "!faq",
      "!rules",
      "!partner",
      "!apply seller",
      "!apply reseller",
      "!tickets",
      "!claim",
      "!assign",
      "!close",
      "!reopen",
      "!priority",
      "!note",
      "!transcript",
      "!report",
      "!warn",
      "!timeout",
      "!case",
      "!config",
      "!permissions",
      "!health",
      "!sync",
      "!entitlement grant",
      "!entitlement revoke",
    ])
      expect(names).toContain(required);
    expect(resolvePath(["support"], commands)).not.toBeNull();
  });
});

describe("authority", () => {
  it("maps live role IDs to blueprint keys", () => {
    expect(
      [
        ...roleKeysFor(
          ["r1", "r2", "x"],
          { member: "r1", moderator: "r2", "support-team": "x" },
          ["member", "moderator"],
        ),
      ].sort(),
    ).toEqual(["member", "moderator"]);
  });

  it("enforces least privilege between staff roles", () => {
    expect(hasAuthority(actor(["moderator"]), "ticket-staff")).toBe(false);
    expect(hasAuthority(actor(["administrator"]), "ticket-staff")).toBe(false);
    expect(hasAuthority(actor(["ticket-staff"]), "moderator")).toBe(false);
    expect(hasAuthority(actor(["staff-manager"]), "ticket-staff")).toBe(true);
    expect(hasAuthority(actor(["administrator"]), "moderator")).toBe(true);
    expect(hasAuthority(actor(["developer"]), "administrator")).toBe(false);
    expect(hasAuthority(actor([]), "member")).toBe(false);
    expect(hasAuthority(actor(["restricted"]), "member")).toBe(false);
    expect(hasAuthority(actor([], { isGuildOwner: true }), "owner")).toBe(true);
  });
});

describe("command router", () => {
  it("denies privileged commands and audits the attempt", async () => {
    const { run, audits } = harness();
    const result = await run("!health", actor(["member"]));
    expect(result.outcome).toBe("denied");
    expect(text(result.publicReplies[0])).toContain("don't have access");
    expect(result.privateReplies).toEqual([]);
    expect(audits).toMatchObject([{ action: "!health", outcome: "denied" }]);
  });

  it("sends administrative output privately, never to the channel", async () => {
    const { run, audits } = harness();
    const result = await run("!config", actor(["administrator"]));
    expect(result.outcome).toBe("ok");
    expect(text(result.privateReplies[0])).toContain("Blueprint: v3");
    expect(text(result.publicReplies[0])).not.toContain("Blueprint");
    expect(text(result.publicReplies[0])).toContain("direct message");
    expect(audits).toMatchObject([{ action: "!config", outcome: "ok" }]);
  });

  it("limits restricted members to help, rules, faq and tickets", async () => {
    const { run } = harness();
    const restricted = actor(["member", "restricted"]);
    expect((await run("!rules", restricted)).outcome).toBe("ok");
    expect((await run("!ticket", restricted)).outcome).toBe("ok");
    const denied = await run("!partner", restricted);
    expect(denied.outcome).toBe("denied");
    expect(text(denied.publicReplies[0])).toContain("restricted");
  });

  it("rate limits bursts and warns only once per window", async () => {
    const { run, clock } = harness();
    const member = actor(["member"]);
    for (let index = 0; index < 5; index += 1)
      expect((await run("!rules", member)).outcome).toBe("ok");
    const limited = await run("!rules", member);
    expect(limited.outcome).toBe("limited");
    expect(text(limited.publicReplies[0])).toContain("Slow down");
    const silent = await run("!rules", member);
    expect(silent.outcome).toBe("limited");
    expect(silent.publicReplies).toEqual([]);
    clock.now += 10_001;
    expect((await run("!rules", member)).outcome).toBe("ok");
  });

  it("applies per-command cooldowns", async () => {
    const { run } = harness();
    const member = actor(["member"]);
    expect((await run("!ticket", member)).outcome).toBe("ok");
    expect((await run("!ticket", member)).outcome).toBe("limited");
  });

  it("isolates handler failures with an incident reference and no internals", async () => {
    const failing: CommandDefinition = {
      path: ["boom"],
      group: "Community",
      authority: "everyone",
      summary: "fails",
      usage: "!boom",
      run: async () => {
        throw new Error("database password=hunter2 at C:\\secret");
      },
    };
    const { services, logs } = harness();
    const router = new CommandRouter([failing]);
    const replies: BotReply[] = [];
    const outcome = await router.dispatch(failing, {
      source: "prefix",
      actor: actor([]),
      guildId: "g",
      channelId: "c",
      args: [],
      services,
      reply: async (reply) => void replies.push(reply),
      replyPrivately: async () => "dm",
    });
    expect(outcome).toBe("error");
    expect(text(replies[0])).toMatch(/Reference: `?[0-9a-f]{8}/);
    expect(text(replies[0])).not.toContain("hunter2");
    expect(logs.join("\n")).toContain("command.failed");
    expect(services.health.snapshot().commands.failed).toBe(1);
  });

  it("marks unconnected workflows as unavailable instead of faking results", async () => {
    const { run } = harness();
    const result = await run("!guide kush", actor(["member"]));
    expect(text(result.publicReplies[0])).toContain("not connected");
    expect(result.privateReplies).toEqual([]);
  });

  it("issues ticket buttons signed for the requesting user only", async () => {
    const { run, clock } = harness();
    const result = await run("!ticket", actor(["member"]));
    const button = (
      result.publicReplies[0]?.components?.[0] as {
        toJSON(): { components: { custom_id: string }[] };
      }
    ).toJSON().components[0]!;
    const payload = verifyComponentId(button.custom_id, SECRET, clock.now);
    expect(payload).toMatchObject({
      action: "ticket-start",
      subject: "11111111111111111",
    });
    expect(
      verifyComponentId(button.custom_id, SECRET, clock.now + 11 * 60_000),
    ).toBeNull();
  });

  it("filters help to the caller's authority", async () => {
    const { run } = harness();
    const member = await run("!help", actor(["member"]));
    expect(text(member.publicReplies[0])).not.toContain("!sync");
    const admin = await run("!help", actor(["administrator"]));
    expect(text(admin.publicReplies[0])).toContain("!sync");
  });

  it("runs !sync as a private dry run against the observed guild", async () => {
    const { run, guild } = harness();
    await applyPlan(planProvisioning(blueprint, await guild.observe()), guild);
    const result = await run("!sync", actor(["administrator"]));
    expect(text(result.privateReplies[0])).toContain("dry run");
    expect(text(result.privateReplies[0])).toContain("Owner actions");
  });
});

describe("live permission inspection", () => {
  it("computes access from the observed guild", async () => {
    const guild = FakeGuild.fresh(requiredBotPermissions);
    const applied = await applyPlan(
      planProvisioning(blueprint, await guild.observe()),
      guild,
    );
    const observed = await guild.observe();
    const rows = liveAccess(observed, {
      memberId: "m",
      roleIds: [applied.mapping.roleIds.member!],
    });
    const staffChat = rows.find((row) => row.name === "staff-chat")!;
    const general = rows.find((row) => row.name === "general")!;
    expect(staffChat.access).toBe("none");
    expect(general.access).toBe("write");
    expect(formatLiveAccess(rows).join("\n")).not.toContain("staff-chat");
  });
});

describe("slash fallbacks", () => {
  it("generates valid, unique slash commands from the registry", () => {
    const names = commandJson.map((command) => command.name);
    expect(new Set(names).size).toBe(names.length);
    for (const command of commandJson) {
      expect(command.name).toMatch(/^[a-z0-9-]{1,32}$/);
      expect(command.description.length).toBeGreaterThan(0);
    }
    const apply = commandJson.find((command) => command.name === "apply")!;
    expect(apply.options?.map((option) => option.name).sort()).toEqual([
      "reseller",
      "seller",
    ]);
    const sync = commandJson.find((command) => command.name === "sync")!;
    expect(sync.default_member_permissions).not.toBeUndefined();
  });
});

describe("operational plumbing", () => {
  it("redacts secrets and token-shaped strings in logs", () => {
    const fakeToken = `${"M".repeat(24)}.${"a".repeat(6)}.${"b".repeat(30)}`;
    expect(
      redact({
        integrationSecret: "x",
        nested: { code: "ABC" },
        note: `token ${fakeToken}`,
      }),
    ).toEqual({
      integrationSecret: "[redacted]",
      nested: { code: "[redacted]" },
      note: "token [redacted]",
    });
  });

  it("never reports partial health as healthy", () => {
    const health = new HealthMonitor("g");
    expect(health.snapshot().status).toBe("unknown");
    health.gatewayReady();
    health.guildAvailable(true);
    expect(health.snapshot().status).toBe("unknown");
    health.apiChecked(false, "ECONNREFUSED");
    expect(health.snapshot().status).toBe("degraded");
    health.apiChecked(true);
    expect(health.snapshot().status).toBe("ok");
  });

  it("restarts with bounded exponential backoff and stops on config errors", () => {
    expect(nextDelay(null, 0)).toBe(1_000);
    expect(nextDelay(1_000, 500)).toBe(2_000);
    expect(nextDelay(32_000, 500)).toBe(60_000);
    expect(nextDelay(60_000, 500)).toBe(60_000);
    expect(nextDelay(60_000, 11 * 60_000)).toBe(1_000);
    expect(shouldRestart(1, null)).toBe(true);
    expect(shouldRestart(78, null)).toBe(false);
    expect(shouldRestart(0, null)).toBe(false);
    expect(shouldRestart(null, "SIGTERM")).toBe(false);
  });

  it("bounds limiter memory", () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(1, 100, () => now);
    limiter.take("a");
    limiter.take("b");
    now = 1_000;
    limiter.sweep();
    expect(limiter.size).toBe(0);
  });
});

describe("component IDs", () => {
  it("fit Discord's 100-character limit for every scoped action", async () => {
    const { createComponentId, MAX_CUSTOM_ID_LENGTH } =
      await import("../src/component-id.js");
    const longest = createComponentId(
      {
        action: "ticket-modal:seller-application",
        subject: "12345678901234567890",
        expiresAt: Date.UTC(2100, 0, 1),
      },
      SECRET,
    );
    expect(longest.length).toBeLessThanOrEqual(MAX_CUSTOM_ID_LENGTH);
    expect(verifyComponentId(longest, SECRET, 0)?.action).toBe(
      "ticket-modal:seller-application",
    );
    expect(
      verifyComponentId(longest.replace("seller", "buyer!"), SECRET, 0),
    ).toBeNull();
  });
});
