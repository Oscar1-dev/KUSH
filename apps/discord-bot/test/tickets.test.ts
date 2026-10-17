import { describe, expect, it } from "vitest";
import { PermissionFlagsBits as P } from "discord.js";
import type {
  DiscordApiClient,
  Ticket,
  TicketChannelRecord,
} from "../src/api-client.js";
import { configuredRoleId } from "../src/blueprint.js";
import type { ResolvedOverwrite } from "../src/provisioning.js";
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
import { TicketManager, type TicketDiscord } from "../src/tickets/manager.js";
import { formatTranscript } from "../src/tickets/transcript.js";

const GUILD = "100000000000000000";
const BOT_ROLE = "100000000000000001";
const roleIds = {
  "support-lead": "200000000000000001",
  "support-team": "200000000000000002", // v1 key for Support Staff
  moderator: "200000000000000003",
  administrator: "200000000000000004",
};
const channelIds = {
  tickets: "300000000000000001",
  reports: "300000000000000002",
  "staff:ticket-queue": "300000000000000003",
  "staff:moderation-log": "300000000000000004",
};
const CUSTOMER = "400000000000000001";
const STAFF = "400000000000000002";

class FakeDiscord implements TicketDiscord {
  channels = new Map<
    string,
    { name: string; parentId: string | null; overwrites: ResolvedOverwrite[] }
  >();
  sent: { channelId: string; content: string; mentionUserIds?: string[] }[] =
    [];
  #next = 500000000000000000n;
  async createChannel(input: {
    name: string;
    parentId: string | null;
    topic: string;
    overwrites: ResolvedOverwrite[];
  }) {
    const id = String(this.#next++);
    this.channels.set(id, {
      name: input.name,
      parentId: input.parentId,
      overwrites: input.overwrites,
    });
    return id;
  }
  async channelExists(id: string) {
    return this.channels.has(id);
  }
  async setOverwrites(id: string, overwrites: ResolvedOverwrite[]) {
    this.channels.get(id)!.overwrites = overwrites;
  }
  async rename(id: string, name: string) {
    this.channels.get(id)!.name = name;
  }
  async send(
    channelId: string,
    message: { content: string; mentionUserIds?: string[] },
  ) {
    this.sent.push({ channelId, ...message });
  }
}

const ticket = (overrides: Partial<Ticket> = {}): Ticket => ({
  id: "11111111-1111-4111-8111-111111111111",
  number: 7,
  category: "technical",
  status: "open",
  priority: "normal",
  assignedUserId: null,
  customerId: "c1",
  version: 1,
  description: "SECRET CUSTOMER DESCRIPTION",
  closureReason: null,
  createdAt: "2026-10-17T00:00:00.000Z",
  updatedAt: "2026-10-17T00:00:00.000Z",
  ...overrides,
});

/** Records API calls and serves canned backend state. */
function fakeApi(state: { ticket: Ticket; records: TicketChannelRecord[] }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const record =
    (method: string) =>
    async (...args: unknown[]) => {
      calls.push({ method, args });
      switch (method) {
        case "ticketChannels":
          return state.records;
        case "claim":
        case "claimBy":
          state.ticket = {
            ...state.ticket,
            assignedUserId: "staff-user",
            version: state.ticket.version + 1,
          };
          state.records = state.records.map((item) => ({
            ...item,
            assigneeDiscordUserId: STAFF,
          }));
          return state.ticket;
        case "close":
          state.ticket = {
            ...state.ticket,
            status: "closed",
            version: state.ticket.version + 1,
          };
          state.records = state.records.map((item) => ({
            ...item,
            status: "closed",
          }));
          return state.ticket;
        case "transcript":
          return {
            exportedAt: "2026-10-17T00:00:00.000Z",
            ticket: state.ticket,
            messages: [
              {
                id: "m",
                authorId: "c1",
                kind: "reply",
                content: "hello",
                createdAt: "t",
              },
            ],
            events: [],
          };
        case "setTicketChannel":
          return { channelId: args[2] };
        default:
          return state.ticket;
      }
    };
  const api = new Proxy({} as DiscordApiClient, {
    get: (_target, property: string) => record(property),
  });
  return { api, calls };
}

function setup() {
  const discord = new FakeDiscord();
  const state = { ticket: ticket(), records: [] as TicketChannelRecord[] };
  const { api, calls } = fakeApi(state);
  const logs: string[] = [];
  const manager = new TicketManager(
    discord,
    api,
    { guildId: GUILD, botRoleId: () => BOT_ROLE, roleIds, channelIds },
    createLogger((line) => logs.push(line)),
  );
  return { discord, state, api, calls, manager, logs };
}

const overwrite = (list: ResolvedOverwrite[], id: string) =>
  list.find((item) => item.id === id);

describe("ticket channels", () => {
  it("creates a private support channel for the creator, Support Lead and bot only", async () => {
    const { discord, manager, calls, state } = setup();
    const channelId = await manager.open({
      ticket: state.ticket,
      queue: "support",
      creatorId: CUSTOMER,
      existingChannelId: null,
    });
    const channel = discord.channels.get(channelId)!;
    expect(channel.name).toBe("ticket-0007");
    expect(channel.parentId).toBe(channelIds.tickets);
    expect(overwrite(channel.overwrites, GUILD)?.deny).toBe(P.ViewChannel);
    expect(
      overwrite(channel.overwrites, BOT_ROLE)?.allow! & P.ViewChannel,
    ).toBe(P.ViewChannel);
    expect(
      overwrite(channel.overwrites, roleIds["support-lead"]),
    ).toBeDefined();
    expect(overwrite(channel.overwrites, CUSTOMER)).toMatchObject({
      kind: "member",
    });
    // Support Staff and moderators are not granted by role.
    expect(
      overwrite(channel.overwrites, roleIds["support-team"]),
    ).toBeUndefined();
    expect(overwrite(channel.overwrites, roleIds.moderator)).toBeUndefined();
    expect(
      calls.find((call) => call.method === "setTicketChannel")?.args.slice(2),
    ).toEqual([channelId, "support"]);
    expect(manager.channels.get(channelId)?.ticketId).toBe(state.ticket.id);
  });

  it("notifies the queue with a summary that never includes the description", async () => {
    const { discord, manager, state } = setup();
    await manager.open({
      ticket: state.ticket,
      queue: "support",
      creatorId: CUSTOMER,
      existingChannelId: null,
    });
    const queueMessage = discord.sent.find(
      (item) => item.channelId === channelIds["staff:ticket-queue"],
    );
    expect(queueMessage?.content).toContain("#7");
    expect(JSON.stringify(discord.sent)).not.toContain(
      "SECRET CUSTOMER DESCRIPTION",
    );
    const intro = discord.sent.find(
      (item) => item.channelId !== channelIds["staff:ticket-queue"],
    );
    expect(intro?.mentionUserIds).toEqual([CUSTOMER]);
  });

  it("routes moderation reports to moderators, never support staff", async () => {
    const { discord, manager, state } = setup();
    const channelId = await manager.open({
      ticket: { ...state.ticket, category: "member-report" },
      queue: "reports",
      creatorId: CUSTOMER,
      existingChannelId: null,
    });
    const channel = discord.channels.get(channelId)!;
    expect(channel.name).toBe("report-0007");
    expect(channel.parentId).toBe(channelIds.reports);
    expect(overwrite(channel.overwrites, roleIds.moderator)).toBeDefined();
    expect(
      overwrite(channel.overwrites, roleIds["support-lead"]),
    ).toBeUndefined();
    expect(
      discord.sent.some(
        (item) => item.channelId === channelIds["staff:moderation-log"],
      ),
    ).toBe(true);
    expect(
      discord.sent.some(
        (item) => item.channelId === channelIds["staff:ticket-queue"],
      ),
    ).toBe(false);
  });

  it("reuses an existing channel on retry instead of creating a duplicate", async () => {
    const { discord, manager, state } = setup();
    const first = await manager.open({
      ticket: state.ticket,
      queue: "support",
      creatorId: CUSTOMER,
      existingChannelId: null,
    });
    const second = await manager.open({
      ticket: state.ticket,
      queue: "support",
      creatorId: CUSTOMER,
      existingChannelId: first,
    });
    expect(second).toBe(first);
    expect(discord.channels.size).toBe(1);
  });

  it("adds the assignee and makes closed tickets read-only", async () => {
    const { discord, manager, state } = setup();
    const channelId = await manager.open({
      ticket: state.ticket,
      queue: "support",
      creatorId: CUSTOMER,
      existingChannelId: null,
    });
    await manager.sync({
      channelId,
      queue: "support",
      number: 7,
      creatorId: CUSTOMER,
      assigneeIds: [STAFF],
      closed: false,
    });
    expect(
      overwrite(discord.channels.get(channelId)!.overwrites, STAFF)?.allow! &
        P.SendMessages,
    ).toBe(P.SendMessages);
    await manager.sync({
      channelId,
      queue: "support",
      number: 7,
      creatorId: CUSTOMER,
      assigneeIds: [STAFF],
      closed: true,
    });
    const closed = discord.channels.get(channelId)!;
    expect(overwrite(closed.overwrites, CUSTOMER)?.deny! & P.SendMessages).toBe(
      P.SendMessages,
    );
    expect(overwrite(closed.overwrites, CUSTOMER)?.allow! & P.ViewChannel).toBe(
      P.ViewChannel,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(closed.name).toBe("closed-0007");
  });

  it("omits unresolved roles but always denies @everyone", async () => {
    const discord = new FakeDiscord();
    const { api } = fakeApi({ ticket: ticket(), records: [] });
    const logs: string[] = [];
    const manager = new TicketManager(
      discord,
      api,
      {
        guildId: GUILD,
        botRoleId: () => BOT_ROLE,
        roleIds: {},
        channelIds: {},
      },
      createLogger((line) => logs.push(line)),
    );
    const channelId = await manager.open({
      ticket: ticket(),
      queue: "support",
      creatorId: CUSTOMER,
      existingChannelId: null,
    });
    const channel = discord.channels.get(channelId)!;
    expect(overwrite(channel.overwrites, GUILD)?.deny).toBe(P.ViewChannel);
    expect(channel.parentId).toBeNull();
    expect(logs.join("\n")).toContain("ticket.overwrite.unresolved");
  });

  it("recovers mappings after a restart and archives channels that no longer exist", async () => {
    const { discord, manager, state, calls } = setup();
    const live = await discord.createChannel({
      name: "ticket-0007",
      parentId: null,
      topic: "",
      overwrites: [],
    });
    state.records = [
      {
        ticketId: state.ticket.id,
        number: 7,
        status: "open",
        category: "technical",
        priority: "normal",
        channelId: live,
        queue: "support",
        state: "active",
        customerDiscordUserId: CUSTOMER,
        assigneeDiscordUserId: STAFF,
      },
      {
        ticketId: "gone",
        number: 8,
        status: "open",
        category: "technical",
        priority: "normal",
        channelId: "599999999999999999",
        queue: "support",
        state: "active",
        customerDiscordUserId: CUSTOMER,
        assigneeDiscordUserId: null,
      },
    ];
    const result = await manager.recover();
    expect(result).toEqual({ restored: 1, missing: [8] });
    expect(manager.channels.has(live)).toBe(true);
    expect(
      overwrite(discord.channels.get(live)!.overwrites, STAFF),
    ).toBeDefined();
    expect(
      calls.find((call) => call.method === "setChannelState")?.args,
    ).toEqual(["599999999999999999", "archived"]);
  });

  it("resolves v1 role IDs through legacy keys", () => {
    expect(configuredRoleId({ "support-team": "x" }, "support-staff")).toBe(
      "x",
    );
    expect(
      configuredRoleId(
        { "support-staff": "y", "support-team": "x" },
        "support-staff",
      ),
    ).toBe("y");
  });
});

describe("ticket commands", () => {
  const actor = (
    roles: Actor["roles"] extends ReadonlySet<infer R> ? R[] : never,
    userId = STAFF,
  ): Actor => ({
    userId,
    displayName: "t",
    roles: new Set(roles),
    isGuildOwner: false,
  });

  async function run(content: string, who: Actor, inTicket: boolean) {
    const env = setup();
    const channelId = await env.manager.open({
      ticket: env.state.ticket,
      queue: "support",
      creatorId: CUSTOMER,
      existingChannelId: null,
    });
    env.state.records = [
      {
        ticketId: env.state.ticket.id,
        number: 7,
        status: "open",
        category: "technical",
        priority: "normal",
        channelId,
        queue: "support",
        state: "active",
        customerDiscordUserId: CUSTOMER,
        assigneeDiscordUserId: null,
      },
    ];
    env.calls.length = 0;
    const services = {
      config: {
        applicationId: "1",
        guildId: GUILD,
        apiBaseUrl: "http://127.0.0.1:4310",
        supportTenantId: "t",
        roleIds,
        channelIds,
      },
      componentSecret: "component-secret-with-at-least-32-characters",
      health: new HealthMonitor(GUILD),
      log: createLogger(() => undefined),
      now: Date.now,
      observeGuild: async () => ({ guildId: GUILD, roles: [], channels: [] }),
      memberRoleIds: async () => null,
      audit: () => undefined,
      api: env.api,
      tickets: env.manager,
    } satisfies BotServices;
    const router = new CommandRouter(commands);
    const resolved = router.resolve(tokenise(content)!)!;
    const publicReplies: BotReply[] = [];
    const privateReplies: BotReply[] = [];
    let deleted = false;
    const outcome = await router.dispatch(resolved.command, {
      source: "prefix",
      actor: who,
      guildId: GUILD,
      channelId: inTicket ? channelId : "999999999999999999",
      args: resolved.args,
      services,
      deleteTrigger: async () => {
        deleted = true;
      },
      reply: async (reply) => void publicReplies.push(reply),
      replyPrivately: async (reply) => {
        privateReplies.push(reply);
        return "dm";
      },
    });
    return {
      ...env,
      channelId,
      outcome,
      publicReplies,
      privateReplies,
      deleted,
    };
  }

  it("claims the ticket in its channel and grants the claimer access", async () => {
    const result = await run(
      "!claim",
      actor(["member", "support-staff"]),
      true,
    );
    expect(result.outcome).toBe("ok");
    expect(result.calls.map((call) => call.method)).toContain("claimBy");
    expect(
      overwrite(
        result.discord.channels.get(result.channelId)!.overwrites,
        STAFF,
      ),
    ).toBeDefined();
    expect(JSON.stringify(result.publicReplies)).toContain("handled by");
  });

  it("refuses ticket staff commands to customers", async () => {
    const result = await run(
      "!claim 7",
      actor(["member", "verified-customer"], CUSTOMER),
      false,
    );
    expect(result.outcome).toBe("denied");
    expect(result.calls).toEqual([]);
  });

  it("keeps internal notes private: deletes the command and confirms only by DM", async () => {
    const result = await run(
      "!note checked the logs",
      actor(["member", "support-staff"]),
      true,
    );
    expect(result.deleted).toBe(true);
    expect(result.publicReplies).toEqual([]);
    expect(JSON.stringify(result.privateReplies)).toContain(
      "Internal note saved",
    );
    const message = result.calls.find((call) => call.method === "message");
    expect(message?.args[2]).toMatchObject({
      kind: "note",
      content: "checked the logs",
    });
  });

  it("lets a customer close their own ticket, which becomes read-only", async () => {
    const result = await run(
      "!close fixed now",
      actor(["member"], CUSTOMER),
      true,
    );
    expect(result.outcome).toBe("ok");
    expect(
      result.calls.find((call) => call.method === "close")?.args.slice(3),
    ).toEqual(["fixed now"]);
    const creator = overwrite(
      result.discord.channels.get(result.channelId)!.overwrites,
      CUSTOMER,
    );
    expect(creator?.deny! & P.SendMessages).toBe(P.SendMessages);
  });

  it("sends transcripts privately as a file", async () => {
    const result = await run(
      "!transcript 7",
      actor(["member"], CUSTOMER),
      false,
    );
    const file = result.privateReplies[0]?.files?.[0] as {
      name: string;
      attachment: Buffer;
    };
    expect(file.name).toBe("kush-ticket-7.txt");
    expect(file.attachment.toString()).toContain("hello");
    expect(JSON.stringify(result.publicReplies)).not.toContain("hello");
  });

  it("asks for a ticket number outside ticket channels", async () => {
    const result = await run(
      "!claim",
      actor(["member", "support-staff"]),
      false,
    );
    expect(JSON.stringify(result.publicReplies)).toContain("ticket number");
  });
});

describe("transcripts", () => {
  it("labels internal notes for staff exports", () => {
    const text = formatTranscript({
      exportedAt: "now",
      ticket: ticket(),
      messages: [
        { id: "1", authorId: "s", kind: "note", content: "n", createdAt: "t" },
      ],
      events: [],
    });
    expect(text).toContain("(INTERNAL NOTE)");
    expect(text).toContain("KUSH ticket #7");
  });
});
