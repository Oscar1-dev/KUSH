import type { Guild } from "discord.js";
import type { BotReply } from "../runtime/command.js";
import type { ContentAdapter } from "./publisher.js";

/** discord.js content adapter. Mentions are always disabled in official posts. */
export class DiscordContentAdapter implements ContentAdapter {
  constructor(private readonly guild: Guild) {}

  async #channel(channelId: string) {
    const channel = await this.guild.channels.fetch(channelId);
    if (!channel?.isTextBased())
      throw new Error(`Channel ${channelId} is not a text channel`);
    return channel;
  }

  async messageExists(channelId: string, messageId: string) {
    const channel = await this.#channel(channelId).catch(() => null);
    if (!channel) return false;
    const message = await channel.messages.fetch(messageId).catch(() => null);
    return Boolean(message && message.author.id === this.guild.client.user.id);
  }

  async send(channelId: string, reply: BotReply) {
    const channel = await this.#channel(channelId);
    const message = await channel.send({
      ...reply,
      allowedMentions: { parse: [] },
    });
    return message.id;
  }

  async edit(channelId: string, messageId: string, reply: BotReply) {
    const channel = await this.#channel(channelId);
    const message = await channel.messages.fetch(messageId);
    await message.edit({ ...reply, allowedMentions: { parse: [] } });
  }

  async pin(channelId: string, messageId: string) {
    const channel = await this.#channel(channelId);
    const message = await channel.messages.fetch(messageId);
    if (!message.pinned) await message.pin("KUSH official channel information");
  }
}
