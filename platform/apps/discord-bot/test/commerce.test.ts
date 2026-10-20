import { describe, expect, it } from "vitest";
import type { RoleKey } from "../src/blueprint.js";
import { ApiError } from "../src/api-client.js";
import { commandJson } from "../src/commands.js";
import { money, parsePrice } from "../src/commerce/commands.js";
import {
  attribute,
  type InviteSnapshot,
} from "../src/commerce/invite-tracker.js";
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

const SECRET = "component-secret-with-at-least-32-characters";
const TICKET_CHANNEL = "44445678901234567";

const actor = (roles: RoleKey[]): Actor => ({
  userId: "11111111111111111",
  displayName: "Tester",
  roles: new Set(roles),
  isGuildOwner: false,
});

/** Records every API call the commands make, and what they reply. */
function harness(api: Record<string, (...args: unknown[]) => unknown>) {
  const calls: { method: string; args: unknown[] }[] = [];
  const proxied = new Proxy(api, {
    get: (target, method: string) => {
      const fn = target[method];
      if (!fn) throw new Error(`unexpected API call: ${method}`);
      return async (...args: unknown[]) => {
        calls.push({ method, args });
        return fn(...args);
      };
    },
  });
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
    health: new HealthMonitor("22345678901234567", () => 1_000_000),
    log: createLogger(() => undefined),
    now: () => 1_000_000,
    observeGuild: async () => {
      throw new Error("unused");
    },
    memberRoleIds: async () => null,
    memberDates: async () => ({
      createdAt: new Date("2024-01-01"),
      joinedAt: new Date(),
    }),
    audit: () => undefined,
    api: proxied as unknown as BotServices["api"],
    tickets: {
      channels: new Map([
        [TICKET_CHANNEL, { ticketId: "t", queue: "support" }],
      ]),
    } as unknown as BotServices["tickets"],
  };
  const router = new CommandRouter(commands, () => 1_000_000);
  const run = async (
    content: string,
    who: Actor,
    options: { source?: "prefix" | "slash"; channelId?: string } = {},
  ) => {
    const publicReplies: BotReply[] = [];
    const privateReplies: BotReply[] = [];
    const resolved = router.resolve(tokenise(content)!)!;
    const outcome = await router.dispatch(resolved.command, {
      source: options.source ?? "slash",
      actor: who,
      guildId: services.config.guildId,
      channelId: options.channelId ?? "33345678901234567",
      invocationId: "998877665544332211",
      args: resolved.args,
      services,
      reply: async (reply) => void publicReplies.push(reply),
      replyPrivately: async (reply) => {
        privateReplies.push(reply);
        return "ephemeral";
      },
    });
    return { outcome, publicReplies, privateReplies, calls };
  };
  return { run, calls };
}

const text = (reply: BotReply | undefined) => JSON.stringify(reply ?? {});

describe("money helpers", () => {
  it("parses prices to whole pence and formats them back", () => {
    expect(parsePrice("15")).toBe(1_500);
    expect(parsePrice("£15.5")).toBe(1_550);
    expect(parsePrice("15.05")).toBe(1_505);
    expect(parsePrice("15.555")).toBeNull();
    expect(parsePrice("-5")).toBeNull();
    expect(parsePrice("free")).toBeNull();
    expect(money(1_500)).toBe("£15");
    expect(money(1_505)).toBe("£15.05");
  });
});

describe("invite attribution", () => {
  const snap = (entries: [string, number, number, string | null][]) =>
    new Map(
      entries.map(([code, uses, maxUses, inviterId]) => [
        code,
        { uses, maxUses, inviterId },
      ]),
    ) as InviteSnapshot;

  it("credits the one invite whose use count went up", () => {
    expect(
      attribute(
        snap([
          ["abc", 3, 0, "100000000000000001"],
          ["xyz", 1, 0, "2"],
        ]),
        snap([
          ["abc", 4, 0, "100000000000000001"],
          ["xyz", 1, 0, "2"],
        ]),
      ),
    ).toEqual({
      inviterId: "100000000000000001",
      code: "abc",
      confidence: "exact",
    });
  });

  it("treats a used-up single-use invite as probable", () => {
    expect(
      attribute(snap([["one", 0, 1, "100000000000000003"]]), snap([])),
    ).toMatchObject({ code: "one", confidence: "probable" });
  });

  it("records nothing when it can't tell", () => {
    // Two invites moved (two people joined at once).
    expect(
      attribute(
        snap([
          ["a", 1, 0, "1"],
          ["b", 1, 0, "2"],
        ]),
        snap([
          ["a", 2, 0, "1"],
          ["b", 2, 0, "2"],
        ]),
      ),
    ).toBeNull();
    // Nothing moved (vanity URL or server discovery).
    expect(
      attribute(snap([["a", 1, 0, "1"]]), snap([["a", 1, 0, "1"]])),
    ).toBeNull();
    // An unlimited invite was deleted: not evidence of a join.
    expect(attribute(snap([["a", 1, 0, "1"]]), snap([]))).toBeNull();
  });
});

describe("slash commands", () => {
  const byName = new Map(commandJson.map((command) => [command.name, command]));
  const subs = (name: string) =>
    (byName.get(name)?.options ?? []).map((option) => option.name).sort();

  it("fit Discord's limits", () => {
    expect(commandJson.length).toBeLessThanOrEqual(100);
    expect(new Set(commandJson.map((c) => c.name)).size).toBe(
      commandJson.length,
    );
    for (const command of commandJson)
      expect((command.options ?? []).length).toBeLessThanOrEqual(25);
  });

  it("groups commerce, commission, staff and ticket commands", () => {
    expect(subs("ticket")).toEqual([
      "add",
      "claim",
      "close",
      "create",
      "transcript",
    ]);
    expect(subs("commission")).toEqual([
      "assign",
      "complete",
      "create",
      "quote",
      "status",
      "update",
    ]);
    expect(subs("product")).toEqual(["archive", "create", "edit"]);
    expect(subs("referral")).toEqual(["claim", "leaderboard", "rewards"]);
    expect(subs("staff")).toEqual([
      "assign",
      "commissions",
      "customer",
      "orders",
      "role",
      "stats",
    ]);
    for (const name of [
      "products",
      "buy",
      "orders",
      "order",
      "credit",
      "referrals",
    ])
      expect(byName.has(name)).toBe(true);
  });

  it("asks for members and ticket numbers with typed options", () => {
    const assign = byName
      .get("commission")!
      .options!.find((option) => option.name === "assign") as unknown as {
      options: { name: string; type: number }[];
    };
    // 6 = USER, 4 = INTEGER in Discord's option types.
    expect(assign.options.find((o) => o.name === "developer")?.type).toBe(6);
    expect(assign.options.find((o) => o.name === "ticket")?.type).toBe(4);
  });
});

describe("shop commands", () => {
  it("starts checkout privately and keys it to the interaction", async () => {
    const { run, calls } = harness({
      checkout: () => ({
        orderNumber: 1042,
        status: "pending",
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_1",
        totalPence: 1_100,
        creditAppliedPence: 400,
      }),
    });
    const result = await run("!buy rust-pack", actor(["member"]));
    expect(calls[0]).toEqual({
      method: "checkout",
      args: [
        {
          discordUserId: "11111111111111111",
          productSlug: "rust-pack",
          interactionId: "998877665544332211",
          useCredit: true,
        },
      ],
    });
    expect(result.publicReplies).toEqual([]);
    expect(text(result.privateReplies[0])).toContain("#1042");
    expect(text(result.privateReplies[0])).toContain("£4");
    expect(text(result.privateReplies[0])).toContain("checkout.stripe.com");
  });

  it("rejects malformed product codes before calling the API", async () => {
    const { run, calls } = harness({});
    const result = await run("!buy ../../admin", actor(["member"]));
    expect(result.outcome).toBe("error");
    expect(calls).toEqual([]);
  });

  it("lists only what the API publishes", async () => {
    const { run } = harness({
      products: () => [
        {
          slug: "rust-pack",
          name: "TEST Rust pack",
          description: "Configs",
          category: null,
          imageUrl: null,
          pricePence: 1_500,
          currency: "GBP",
        },
      ],
      catalogue: () => [
        {
          slug: "websites",
          name: "Websites",
          summary: "",
          category: "websites",
          startingPrice: "from £40",
          offers: [],
        },
      ],
    });
    const result = await run("!products", actor([]));
    expect(text(result.publicReplies[0])).toContain("TEST Rust pack");
    expect(text(result.publicReplies[0])).toContain("from £40");
  });
});

describe("staff commission commands", () => {
  it("are refused for members without a staff role, without calling the API", async () => {
    const { run, calls } = harness({});
    const result = await run(
      "!commission quote 120 #42 Full build, two revisions",
      actor(["member"]),
    );
    expect(result.outcome).toBe("denied");
    expect(calls).toEqual([]);
  });

  it("quote the ticket named, or the ticket channel they're run in", async () => {
    const { run, calls } = harness({
      commissionQuote: () => ({ ticketNumber: 42, amount: "£120.50" }),
    });
    await run(
      "!commission quote £120.50 #42 Full build, two revisions",
      actor(["developer"]),
    );
    expect(calls[0]!.args).toEqual([
      "11111111111111111",
      { ticket: 42 },
      {
        amountPence: 12_050,
        summary: "Full build, two revisions",
        timeframe: null,
        revisions: null,
      },
    ]);
    await run(
      "!commission quote 99 Logo and banner pack",
      actor(["staff-manager"]),
      {
        channelId: TICKET_CHANNEL,
      },
    );
    expect(calls[1]!.args[1]).toEqual({ channelId: TICKET_CHANNEL });
  });

  it("show the API's refusal instead of pretending", async () => {
    const { run } = harness({
      commissionStatus: () => {
        throw new ApiError(409, "That status change is not allowed");
      },
    });
    const result = await run(
      "!commission update in_progress #7",
      actor(["developer"]),
    );
    expect(text(result.publicReplies[0])).toContain("not allowed");
  });
});
