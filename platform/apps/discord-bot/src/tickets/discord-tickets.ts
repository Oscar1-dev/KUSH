import type { TicketMessage } from "./manager.js";
import { ChannelType, OverwriteType, type Guild } from "discord.js";
import type { ResolvedOverwrite } from "../provisioning.js";
import type { TicketDiscord } from "./manager.js";

const toDiscord = (overwrites: ResolvedOverwrite[]) =>
  overwrites.map((overwrite) => ({
    id: overwrite.id,
    type:
      overwrite.kind === "member" ? OverwriteType.Member : OverwriteType.Role,
    allow: overwrite.allow,
    deny: overwrite.deny,
  }));

/** discord.js implementation of the ticket channel surface. */
export class DiscordTicketChannels implements TicketDiscord {
  constructor(private readonly guild: () => Guild) {}

  async createChannel(input: {
    name: string;
    parentId: string | null;
    topic: string;
    overwrites: ResolvedOverwrite[];
  }) {
    const channel = await this.guild().channels.create({
      name: input.name,
      type: ChannelType.GuildText,
      parent: input.parentId,
      topic: input.topic,
      permissionOverwrites: toDiscord(input.overwrites),
      reason: "KUSH private ticket",
    });
    return channel.id;
  }

  async channelExists(channelId: string) {
    const channel = await this.guild()
      .channels.fetch(channelId)
      .catch(() => null);
    return Boolean(channel);
  }

  async setOverwrites(channelId: string, overwrites: ResolvedOverwrite[]) {
    const channel = await this.guild().channels.fetch(channelId);
    if (!channel || channel.isThread())
      throw new Error("Ticket channel not found");
    await channel.permissionOverwrites.set(
      toDiscord(overwrites),
      "KUSH ticket access sync",
    );
  }

  async rename(channelId: string, name: string) {
    const channel = await this.guild().channels.fetch(channelId);
    if (!channel || channel.name === name) return;
    await channel.setName(name, "KUSH ticket state");
  }

  async send(channelId: string, message: TicketMessage) {
    const channel = await this.guild().channels.fetch(channelId);
    if (!channel?.isSendable()) throw new Error("Channel is not sendable");
    await channel.send({
      ...(message.content ? { content: message.content } : {}),
      ...(message.embeds ? { embeds: message.embeds } : {}),
      ...(message.components ? { components: message.components } : {}),
      allowedMentions: { parse: [], users: message.mentionUserIds ?? [] },
    });
  }
}
