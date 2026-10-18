import { describe, expect, it } from "vitest";
import { ChannelType, PermissionFlagsBits as P } from "discord.js";
import {
  ALL_PERMISSIONS,
  channelPermissions,
  type EvaluatedOverwrite,
  type PermissionGuild,
} from "../src/permissions.js";

const guild: PermissionGuild = {
  id: "guild",
  ownerId: "owner-user",
  rolePermissions: new Map([
    ["guild", P.ViewChannel | P.ReadMessageHistory],
    ["member", P.SendMessages | P.AttachFiles | P.EmbedLinks],
    ["admin", P.Administrator],
    ["muted", 0n],
    ["helper", 0n],
  ]),
};
const text = (overwrites: EvaluatedOverwrite[]) => ({
  type: ChannelType.GuildText,
  overwrites,
});
const role = (id: string, allow: bigint, deny: bigint): EvaluatedOverwrite => ({
  id,
  kind: "role",
  allow,
  deny,
});

describe("Discord effective-permission evaluator", () => {
  it("grants everything to the guild owner and Administrator holders", () => {
    const hidden = text([role("guild", 0n, P.ViewChannel)]);
    expect(
      channelPermissions(guild, { id: "owner-user", roleIds: [] }, hidden),
    ).toBe(ALL_PERMISSIONS);
    expect(
      channelPermissions(guild, { id: "u", roleIds: ["admin"] }, hidden),
    ).toBe(ALL_PERMISSIONS);
  });

  it("applies @everyone overwrite to the combined base", () => {
    const readOnly = text([role("guild", 0n, P.SendMessages)]);
    const result = channelPermissions(
      guild,
      { id: "u", roleIds: ["member"] },
      readOnly,
    );
    expect(result & P.SendMessages).toBe(0n);
    expect(result & P.ViewChannel).toBe(P.ViewChannel);
  });

  it("lets one role's allow beat another role's deny (Discord semantics)", () => {
    const channel = text([
      role("muted", 0n, P.SendMessages),
      role("helper", P.SendMessages, 0n),
    ]);
    expect(
      channelPermissions(
        guild,
        { id: "u", roleIds: ["member", "muted", "helper"] },
        channel,
      ) & P.SendMessages,
    ).toBe(P.SendMessages);
    expect(
      channelPermissions(
        guild,
        { id: "u", roleIds: ["member", "muted"] },
        channel,
      ) & P.SendMessages,
    ).toBe(0n);
  });

  it("applies member overwrites last", () => {
    const channel: { type: ChannelType; overwrites: EvaluatedOverwrite[] } =
      text([
        role("guild", 0n, P.ViewChannel),
        { id: "u", kind: "member", allow: P.ViewChannel, deny: 0n },
      ]);
    expect(
      channelPermissions(guild, { id: "u", roleIds: [] }, channel) &
        P.ViewChannel,
    ).toBe(P.ViewChannel);
    expect(channelPermissions(guild, { id: "x", roleIds: [] }, channel)).toBe(
      0n,
    );
  });

  it("drops every permission without ViewChannel and send-dependent ones without SendMessages", () => {
    expect(
      channelPermissions(
        guild,
        { id: "u", roleIds: ["member"] },
        text([role("guild", 0n, P.ViewChannel)]),
      ),
    ).toBe(0n);
    const noSend = channelPermissions(
      guild,
      { id: "u", roleIds: ["member"] },
      text([role("member", 0n, P.SendMessages)]),
    );
    expect(noSend & (P.AttachFiles | P.EmbedLinks)).toBe(0n);
  });

  it("reduces timed-out members to view and history only", () => {
    const result = channelPermissions(
      guild,
      { id: "u", roleIds: ["member"], communicationDisabledUntil: 2_000 },
      text([]),
      1_000,
    );
    expect(result).toBe(P.ViewChannel | P.ReadMessageHistory);
    expect(
      channelPermissions(
        guild,
        { id: "u", roleIds: ["member"], communicationDisabledUntil: 500 },
        text([]),
        1_000,
      ) & P.SendMessages,
    ).toBe(P.SendMessages);
  });

  it("removes voice actions without Connect", () => {
    const result = channelPermissions(
      {
        ...guild,
        rolePermissions: new Map([["guild", P.ViewChannel | P.Speak]]),
      },
      { id: "u", roleIds: [] },
      { type: ChannelType.GuildVoice, overwrites: [] },
    );
    expect(result & P.Speak).toBe(0n);
  });
});
