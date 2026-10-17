import { PermissionFlagsBits as P } from "discord.js";
import {
  configuredRoleId,
  ticketChannelOverwrites,
  type RoleKey,
} from "../blueprint.js";
import type { ResolvedOverwrite } from "../provisioning.js";
import type { Logger } from "../runtime/logger.js";

/**
 * Private Discord channels for staff applications. Visible only to the
 * applicant, recruiters (management, administrators) and the bot. Messages
 * here are recorded on the application, so the website shows them too.
 */

export interface ApplicationChannelApi {
  applicationChannels(): Promise<
    { applicationId: string; channelId: string; status: string }[]
  >;
  recordApplicationChannel(
    applicationId: string,
    channelId: string,
  ): Promise<void>;
  applicationMessage(
    channelId: string,
    input: { discordUserId: string; messageId: string; content: string },
  ): Promise<void>;
}

export interface ApplicationDiscord {
  createChannel(input: {
    name: string;
    parentId: string | null;
    topic: string;
    overwrites: ResolvedOverwrite[];
  }): Promise<string>;
  send(
    channelId: string,
    message: { content: string; mentionUserIds?: string[] },
  ): Promise<unknown>;
}

export class ApplicationChannels {
  /** channelId -> applicationId */
  readonly channels = new Map<string, string>();

  constructor(
    private readonly api: ApplicationChannelApi,
    private readonly discord: ApplicationDiscord,
    private readonly config: {
      guildId: string;
      botRoleId: () => string | undefined;
      roleIds: Record<string, string>;
      channelIds: Record<string, string>;
    },
    private readonly log: Logger,
  ) {}

  async load() {
    for (const row of await this.api.applicationChannels())
      this.channels.set(row.channelId, row.applicationId);
    return this.channels.size;
  }

  overwrites(applicantId: string): ResolvedOverwrite[] {
    const resolved: ResolvedOverwrite[] = [];
    for (const overwrite of ticketChannelOverwrites({
      kind: "application",
      creatorId: applicantId,
      assigneeIds: [],
    })) {
      const principal = overwrite.principal;
      if (typeof principal === "object") {
        if (principal.memberId)
          resolved.push({
            id: principal.memberId,
            kind: "member",
            allow: overwrite.allow,
            deny: overwrite.deny,
          });
        continue;
      }
      const id =
        principal === "everyone"
          ? this.config.guildId
          : principal === "kush-bot"
            ? this.config.botRoleId()
            : configuredRoleId(this.config.roleIds, principal as RoleKey);
      if (!id) {
        this.log.warn("application.overwrite.unresolved", { principal });
        continue;
      }
      resolved.push({
        id,
        kind: "role",
        allow: overwrite.allow,
        deny: overwrite.deny,
      });
    }
    // Defence in depth: never create a channel that @everyone could read.
    if (
      !resolved.some(
        (o) =>
          o.id === this.config.guildId &&
          (o.deny & P.ViewChannel) === P.ViewChannel,
      )
    )
      throw new Error(
        "Refusing to create an application channel without an @everyone deny",
      );
    return resolved;
  }

  /** Creates the channel, posts the intro and records it with the API. */
  async create(input: {
    applicationId: string;
    number: number;
    applicantDiscordId: string;
    content: string;
  }) {
    const existing = [...this.channels].find(
      ([, id]) => id === input.applicationId,
    );
    if (existing) return existing[0];
    const channelId = await this.discord.createChannel({
      name: `application-${String(input.number).padStart(4, "0")}`,
      parentId: this.config.channelIds["tickets"] ?? null,
      topic: `Private staff application #${input.number}`,
      overwrites: this.overwrites(input.applicantDiscordId),
    });
    // Record first: if posting fails, the retry must not create a second channel.
    await this.api.recordApplicationChannel(input.applicationId, channelId);
    this.channels.set(channelId, input.applicationId);
    await this.discord.send(channelId, {
      content: input.content,
      mentionUserIds: [input.applicantDiscordId],
    });
    return channelId;
  }

  /** Records a Discord message from an application channel. */
  async mirror(message: {
    channelId: string;
    authorId: string;
    id: string;
    content: string;
    attachments: string[];
  }) {
    if (!this.channels.has(message.channelId)) return false;
    const content = [
      message.content,
      ...message.attachments.map((name) => `[attachment: ${name}]`),
    ]
      .join("\n")
      .trim();
    if (!content) return true;
    try {
      await this.api.applicationMessage(message.channelId, {
        discordUserId: message.authorId,
        messageId: message.id,
        content: content.slice(0, 5000),
      });
    } catch (error) {
      this.log.warn("application.mirror.failed", {
        channelId: message.channelId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
    return true;
  }
}
