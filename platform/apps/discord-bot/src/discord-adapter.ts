import {
  ChannelType,
  Client,
  GatewayIntentBits,
  OverwriteType,
  PermissionFlagsBits,
  type Guild,
  type GuildChannel,
  type OverwriteResolvable,
} from "discord.js";
import type {
  ChannelInput,
  GuildAdapter,
  ObservedGuild,
  ResolvedOverwrite,
  RoleInput,
} from "./provisioning.js";

/**
 * discord.js implementation of the provisioning adapter.
 *
 * `observe()` is read-only. Every other method mutates the live guild and is
 * only reachable through `cli.ts setup --apply`, which requires a reviewed
 * plan and explicit owner confirmation of the guild ID.
 *
 * NOT YET VERIFIED against a live guild. Unit tests use test/fake-guild.ts.
 */
export class DiscordGuildAdapter implements GuildAdapter {
  constructor(private readonly guild: Guild) {}

  async observe(): Promise<ObservedGuild> {
    const [roles, channels, me] = await Promise.all([
      this.guild.roles.fetch(),
      this.guild.channels.fetch(),
      this.guild.members.fetchMe(),
    ]);
    const botRole = me.roles.botRole;
    return {
      guildId: this.guild.id,
      ownerId: this.guild.ownerId,
      memberCount: this.guild.memberCount,
      ...(botRole ? { bot: { userId: me.id, roleId: botRole.id } } : {}),
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        colour: role.colors.primaryColor,
        permissions: role.permissions.bitfield,
        hoist: role.hoist,
        position: role.position,
        managed: role.managed,
      })),
      channels: [...channels.values()]
        .filter((channel) => channel !== null)
        .map((channel) => ({
          id: channel.id,
          name: channel.name,
          type: channel.type,
          parentId: channel.parentId,
          position: channel.rawPosition,
          topic: "topic" in channel ? (channel.topic as string | null) : null,
          overwrites: channel.permissionOverwrites.cache.map((overwrite) => ({
            id: overwrite.id,
            kind:
              overwrite.type === OverwriteType.Member
                ? ("member" as const)
                : ("role" as const),
            allow: overwrite.allow.bitfield,
            deny: overwrite.deny.bitfield,
          })),
        })),
    };
  }

  async createRole(input: RoleInput, reason: string): Promise<string> {
    const role = await this.guild.roles.create({
      name: input.name,
      colors: { primaryColor: input.colour },
      permissions: input.permissions,
      hoist: input.hoist,
      mentionable: false,
      reason,
    });
    return role.id;
  }

  async updateRole(id: string, input: RoleInput, reason: string) {
    await this.guild.roles.edit(id, {
      name: input.name,
      colors: { primaryColor: input.colour },
      permissions: input.permissions,
      hoist: input.hoist,
      reason,
    });
  }

  /** Number of members holding each role (needs the Server Members intent). */
  async roleHolders(): Promise<Map<string, number>> {
    const members = await this.guild.members.fetch();
    const counts = new Map<string, number>();
    for (const member of members.values())
      for (const id of member.roles.cache.keys())
        counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  }

  /** Irreversible. Only called by `cli.ts retire-roles --apply`. */
  async deleteRole(id: string, reason: string) {
    await this.guild.roles.delete(id, reason);
  }

  async setEveryonePermissions(permissions: bigint, reason: string) {
    await this.guild.roles.everyone.setPermissions(permissions, reason);
  }

  async setRolePositions(
    positions: { id: string; position: number }[],
    reason: string,
  ) {
    void reason; // The positions endpoint does not accept an audit reason.
    await this.guild.roles.setPositions(
      positions.map((item) => ({ role: item.id, position: item.position })),
    );
  }

  async setChannelPositions(
    positions: { id: string; position: number }[],
    reason: string,
  ) {
    void reason; // The positions endpoint does not accept an audit reason.
    await this.guild.channels.setPositions(
      positions.map((item) => ({ channel: item.id, position: item.position })),
    );
  }

  async createChannel(input: ChannelInput, reason: string): Promise<string> {
    const channel = await this.guild.channels.create({
      name: input.name,
      type: input.type as
        | ChannelType.GuildText
        | ChannelType.GuildCategory
        | ChannelType.GuildVoice,
      parent: input.parentId,
      ...(input.topic !== undefined && input.type === ChannelType.GuildText
        ? { topic: input.topic }
        : {}),
      permissionOverwrites: toDiscord(input.overwrites),
      reason,
    });
    return channel.id;
  }

  async updateChannel(id: string, input: ChannelInput, reason: string) {
    const channel = await this.#channel(id);
    await channel.edit({
      name: input.name,
      parent: input.parentId,
      lockPermissions: false,
      ...(input.topic !== undefined && input.type === ChannelType.GuildText
        ? { topic: input.topic }
        : {}),
      reason,
    });
    await this.#applyOverwrites(channel, input.overwrites, reason);
  }

  /**
   * Applies overwrites one principal at a time instead of replacing the whole
   * set. A bulk replace is evaluated as a single new state, so on a private
   * channel Discord sees the @everyone ViewChannel deny land without the bot's
   * own allow and refuses the edit (50013) to avoid locking the bot out. The
   * bot's own overwrite therefore goes first, and stale ones are removed last.
   */
  async #applyOverwrites(
    channel: GuildChannel,
    overwrites: ResolvedOverwrite[],
    reason: string,
  ) {
    const botRoleId = channel.guild.members.me?.roles.botRole?.id;
    const ordered = [...overwrites].sort(
      (left, right) =>
        Number(right.id === botRoleId) - Number(left.id === botRoleId),
    );
    for (const overwrite of ordered)
      await channel.permissionOverwrites.edit(
        overwrite.id,
        toOptions(overwrite.allow, overwrite.deny),
        {
          type:
            overwrite.kind === "member"
              ? OverwriteType.Member
              : OverwriteType.Role,
          reason,
        },
      );
    const wanted = new Set(overwrites.map((overwrite) => overwrite.id));
    for (const [existingId] of channel.permissionOverwrites.cache)
      if (!wanted.has(existingId))
        await channel.permissionOverwrites.delete(existingId, reason);
  }

  async setRoleOverwrite(
    channelId: string,
    roleId: string,
    allow: bigint,
    deny: bigint,
    reason: string,
  ) {
    const channel = await this.#channel(channelId);
    const others = channel.permissionOverwrites.cache
      .filter((overwrite) => overwrite.id !== roleId)
      .map((overwrite): OverwriteResolvable => ({
        id: overwrite.id,
        type: overwrite.type,
        allow: overwrite.allow.bitfield,
        deny: overwrite.deny.bitfield,
      }));
    await channel.permissionOverwrites.set(
      [...others, { id: roleId, type: OverwriteType.Role, allow, deny }],
      reason,
    );
  }

  async #channel(id: string): Promise<GuildChannel> {
    const channel = await this.guild.channels.fetch(id);
    if (!channel || channel.isThread())
      throw new Error(`Channel ${id} is not a guild channel`);
    return channel;
  }
}

/**
 * Bitfields → discord.js per-permission options: true allow, false deny,
 * null inherit. Every flag is listed, including the nulls: an edit merges
 * into the existing overwrite, so omitting a bit would silently keep its
 * previous explicit value instead of clearing it.
 */
const toOptions = (allow: bigint, deny: bigint) =>
  Object.fromEntries(
    Object.entries(PermissionFlagsBits).map(([name, flag]) => [
      name,
      (allow & flag) === flag ? true : (deny & flag) === flag ? false : null,
    ]),
  ) as Record<string, boolean | null>;

const toDiscord = (overwrites: ResolvedOverwrite[]): OverwriteResolvable[] =>
  overwrites.map((overwrite) => ({
    id: overwrite.id,
    type:
      overwrite.kind === "member" ? OverwriteType.Member : OverwriteType.Role,
    allow: overwrite.allow,
    deny: overwrite.deny,
  }));

/** Logs in with the Guilds intent only and verifies the exact guild. */
export async function connectGuild(
  token: string,
  guildId: string,
  options: { members?: boolean } = {},
): Promise<{ adapter: DiscordGuildAdapter; close: () => Promise<void> }> {
  // Server Members (privileged) only when a command must count role holders.
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      ...(options.members ? [GatewayIntentBits.GuildMembers] : []),
    ],
  });
  await client.login(token);
  try {
    const guild = await client.guilds.fetch(guildId);
    if (guild.id !== guildId) throw new Error("Guild ID mismatch");
    return {
      adapter: new DiscordGuildAdapter(guild),
      close: () => client.destroy(),
    };
  } catch (error) {
    await client.destroy();
    throw error;
  }
}
