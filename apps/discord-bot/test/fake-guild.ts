import type {
  ChannelInput,
  GuildAdapter,
  ObservedChannel,
  ObservedGuild,
  ObservedRole,
  RoleInput,
} from "../src/provisioning.js";

/**
 * In-memory guild that behaves like Discord for provisioning purposes:
 * new roles are created at position 1 (just above @everyone), positions are
 * explicit, and every mutation is recorded.
 */
export class FakeGuild implements GuildAdapter {
  readonly calls: string[] = [];
  #next = 1000;
  failOn?: (call: string) => boolean;

  constructor(public state: ObservedGuild) {}

  static fresh(botPermissions: bigint): FakeGuild {
    return new FakeGuild({
      guildId: "guild",
      ownerId: "owner-user",
      bot: { userId: "bot-user", roleId: "bot-role" },
      roles: [
        {
          id: "guild",
          name: "@everyone",
          colour: 0,
          permissions: 0n,
          hoist: false,
          position: 0,
        },
        {
          id: "bot-role",
          name: "KUSH Bot",
          colour: 0,
          permissions: botPermissions,
          hoist: false,
          position: 1,
          managed: true,
        },
      ],
      channels: [],
    });
  }

  #record(call: string) {
    if (this.failOn?.(call)) throw new Error(`simulated failure: ${call}`);
    this.calls.push(call);
  }

  async observe(): Promise<ObservedGuild> {
    return structuredClone(this.state);
  }

  async createRole(input: RoleInput): Promise<string> {
    this.#record(`createRole ${input.name}`);
    const id = `role-${this.#next++}`;
    for (const role of this.state.roles)
      if ((role.position ?? 0) >= 1) role.position = (role.position ?? 0) + 1;
    this.state.roles.push({ id, ...input, position: 1 });
    return id;
  }

  async updateRole(id: string, input: RoleInput): Promise<void> {
    this.#record(`updateRole ${input.name}`);
    Object.assign(this.#role(id), input);
  }

  async setRolePositions(
    positions: { id: string; position: number }[],
  ): Promise<void> {
    this.#record(`setRolePositions ${positions.length}`);
    for (const { id, position } of positions)
      this.#role(id).position = position;
  }

  async createChannel(input: ChannelInput): Promise<string> {
    this.#record(`createChannel ${input.name}`);
    const id = `channel-${this.#next++}`;
    this.state.channels.push(this.#channel(id, input));
    return id;
  }

  async updateChannel(id: string, input: ChannelInput): Promise<void> {
    this.#record(`updateChannel ${input.name}`);
    const index = this.state.channels.findIndex((item) => item.id === id);
    this.state.channels[index] = this.#channel(id, input);
  }

  async setRoleOverwrite(
    channelId: string,
    roleId: string,
    allow: bigint,
    deny: bigint,
  ): Promise<void> {
    this.#record(`setRoleOverwrite ${channelId}`);
    const channel = this.state.channels.find((item) => item.id === channelId)!;
    channel.overwrites = [
      ...(channel.overwrites ?? []).filter((item) => item.id !== roleId),
      { id: roleId, kind: "role", allow, deny },
    ];
  }

  role(name: string): ObservedRole {
    return this.state.roles.find((item) => item.name === name)!;
  }

  #role(id: string): ObservedRole {
    const role = this.state.roles.find((item) => item.id === id);
    if (!role) throw new Error(`unknown role ${id}`);
    return role;
  }

  #channel(id: string, input: ChannelInput): ObservedChannel {
    return {
      id,
      name: input.name,
      type: input.type,
      parentId: input.parentId,
      topic: input.topic ?? null,
      overwrites: input.overwrites.map((item) => ({ ...item })),
    };
  }
}
