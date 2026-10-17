import type { DesiredChannel, DesiredRole } from "./blueprint.js";

export interface ObservedRole {
  id: string;
  name: string;
  colour: number;
  permissions: bigint;
  hoist: boolean;
}
export interface ObservedOverwrite {
  id: string;
  allow: bigint;
  deny: bigint;
}
export interface ObservedChannel {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  topic?: string | null;
  overwrites?: ObservedOverwrite[];
}
export interface ObservedGuild {
  roles: ObservedRole[];
  channels: ObservedChannel[];
}
export type ProvisionOperation =
  | { action: "create-role"; key: string; desired: DesiredRole }
  | { action: "update-role"; id: string; key: string; desired: DesiredRole }
  | {
      action: "create-channel";
      key: string;
      desired: DesiredChannel;
      parentKey?: string;
    }
  | {
      action: "update-channel";
      id: string;
      key: string;
      desired: DesiredChannel;
      parentKey?: string;
    };

export interface StableIds {
  everyoneRoleId?: string;
  roleIds?: Record<string, string>;
  channelIds?: Record<string, string>;
}

export function planProvisioning(
  desired: { roles: DesiredRole[]; channels: DesiredChannel[] },
  observed: ObservedGuild,
  ids: StableIds = {},
): ProvisionOperation[] {
  const operations: ProvisionOperation[] = [];
  for (const wanted of desired.roles) {
    const current =
      observed.roles.find((item) => item.id === ids.roleIds?.[wanted.key]) ??
      observed.roles.find((item) => item.name === wanted.name);
    if (!current)
      operations.push({
        action: "create-role",
        key: wanted.key,
        desired: wanted,
      });
    else if (
      current.name !== wanted.name ||
      current.colour !== wanted.colour ||
      current.permissions !== wanted.permissions ||
      current.hoist !== Boolean(wanted.hoist)
    )
      operations.push({
        action: "update-role",
        id: current.id,
        key: wanted.key,
        desired: wanted,
      });
  }
  const resolvedParentId = (key?: string) =>
    key
      ? (ids.channelIds?.[key] ??
        observed.channels.find(
          (item) =>
            item.name ===
            desired.channels.find((channel) => channel.key === key)?.name,
        )?.id)
      : undefined;
  const resolvedRoleId = (principal: string) =>
    principal === "everyone"
      ? ids.everyoneRoleId
      : (ids.roleIds?.[principal] ??
        observed.roles.find(
          (role) =>
            role.name ===
            desired.roles.find((item) => item.key === principal)?.name,
        )?.id);
  const overwritesMatch = (
    wanted: DesiredChannel,
    current: ObservedChannel,
  ) => {
    const expected = wanted.overwrites
      .map((overwrite) => ({
        ...overwrite,
        id: resolvedRoleId(overwrite.principal),
      }))
      .filter((overwrite): overwrite is typeof overwrite & { id: string } =>
        Boolean(overwrite.id),
      );
    if (expected.length !== wanted.overwrites.length) return true;
    return (
      expected.length === (current.overwrites?.length ?? 0) &&
      expected.every((overwrite) =>
        current.overwrites?.some(
          (item) =>
            item.id === overwrite.id &&
            item.allow === overwrite.allow &&
            item.deny === overwrite.deny,
        ),
      )
    );
  };
  for (const wanted of desired.channels) {
    const current =
      observed.channels.find(
        (item) => item.id === ids.channelIds?.[wanted.key],
      ) ??
      observed.channels.find(
        (item) => item.name === wanted.name && item.type === wanted.type,
      );
    if (!current)
      operations.push({
        action: "create-channel",
        key: wanted.key,
        desired: wanted,
        parentKey: wanted.parentKey,
      });
    else if (
      current.name !== wanted.name ||
      current.type !== wanted.type ||
      (wanted.topic !== undefined && current.topic !== wanted.topic) ||
      (wanted.parentKey &&
        current.parentId !== resolvedParentId(wanted.parentKey)) ||
      !overwritesMatch(wanted, current)
    )
      operations.push({
        action: "update-channel",
        id: current.id,
        key: wanted.key,
        desired: wanted,
        parentKey: wanted.parentKey,
      });
  }
  return operations;
}

export function serialisePlan(operations: ProvisionOperation[]): unknown[] {
  return JSON.parse(
    JSON.stringify(operations, (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  ) as unknown[];
}
