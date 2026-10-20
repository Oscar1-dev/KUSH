import { PermissionFlagsBits as P } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  ApplicationChannels,
  type ApplicationChannelApi,
  type ApplicationDiscord,
} from "../src/automation/applications.js";
import { createLogger } from "../src/runtime/logger.js";

const GUILD = "100000000000000001";
const ROLE = {
  administrator: "200000000000000001",
  "staff-manager": "200000000000000002",
  "ticket-staff": "200000000000000003",
  moderator: "200000000000000004",
};

class FakeApi implements ApplicationChannelApi {
  recorded: [string, string][] = [];
  messages: { channelId: string; discordUserId: string; content: string }[] =
    [];
  existing: { applicationId: string; channelId: string; status: string }[] = [];
  async applicationChannels() {
    return this.existing;
  }
  async recordApplicationChannel(applicationId: string, channelId: string) {
    this.recorded.push([applicationId, channelId]);
  }
  async applicationMessage(
    channelId: string,
    input: { discordUserId: string; content: string },
  ) {
    this.messages.push({ channelId, ...input });
  }
}

class FakeDiscord implements ApplicationDiscord {
  created: {
    name: string;
    overwrites: { id: string; allow: bigint; deny: bigint }[];
  }[] = [];
  order: string[] = [];
  async createChannel(input: {
    name: string;
    overwrites: { id: string; allow: bigint; deny: bigint }[];
  }) {
    this.created.push(input);
    this.order.push("create");
    return `30000000000000000${this.created.length}`;
  }
  async send() {
    this.order.push("send");
  }
}

const setup = () => {
  const api = new FakeApi();
  const discord = new FakeDiscord();
  const channels = new ApplicationChannels(
    api,
    discord,
    {
      guildId: GUILD,
      botRoleId: () => "900000000000000001",
      roleIds: ROLE,
      channelIds: { tickets: "400000000000000001" },
    },
    createLogger(() => undefined),
  );
  return { api, discord, channels };
};
const input = {
  applicationId: "app-1",
  number: 7,
  applicantDiscordId: "500000000000000001",
  content: "hello",
};

describe("application channels", () => {
  it("are private to the applicant, administrators and the bot", async () => {
    const { discord, channels } = setup();
    await channels.create(input);
    const overwrites = discord.created[0]!.overwrites;
    const everyone = overwrites.find((o) => o.id === GUILD)!;
    expect(everyone.deny & P.ViewChannel).toBe(P.ViewChannel);
    const ids = overwrites.map((o) => o.id);
    expect(ids).toContain("500000000000000001");
    expect(ids).toContain(ROLE.administrator);
    // Support staff and moderators never see applicants' details.
    expect(ids).not.toContain(ROLE["staff-manager"]);
    expect(ids).not.toContain(ROLE["ticket-staff"]);
    expect(ids).not.toContain(ROLE.moderator);
    expect(discord.created[0]!.name).toBe("application-0007");
  });

  it("records the channel before posting, and never creates two", async () => {
    const { api, discord, channels } = setup();
    await channels.create(input);
    expect(api.recorded).toEqual([["app-1", "300000000000000001"]]);
    expect(discord.order).toEqual(["create", "send"]);
    await channels.create(input);
    expect(discord.created).toHaveLength(1);
  });

  it("mirrors messages only from application channels", async () => {
    const { api, channels } = setup();
    api.existing = [
      {
        applicationId: "app-9",
        channelId: "600000000000000001",
        status: "reviewing",
      },
    ];
    await channels.load();
    expect(
      await channels.mirror({
        channelId: "600000000000000001",
        authorId: "500000000000000002",
        id: "1",
        content: "hi",
        attachments: ["cv.pdf"],
      }),
    ).toBe(true);
    expect(api.messages[0]).toMatchObject({
      channelId: "600000000000000001",
      content: "hi\n[attachment: cv.pdf]",
    });
    expect(
      await channels.mirror({
        channelId: "700000000000000001",
        authorId: "5",
        id: "2",
        content: "x",
        attachments: [],
      }),
    ).toBe(false);
  });
});
