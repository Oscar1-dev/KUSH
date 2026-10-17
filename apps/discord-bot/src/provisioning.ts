import { createHash } from "node:crypto";
import { PermissionFlagsBits as P } from "discord.js";
import {
  botManagedRoles,
  requiredBotPermissions,
  type Blueprint,
  type DesiredChannel,
  type DesiredRole,
  type Principal,
  type RoleKey,
} from "./blueprint.js";
import {
  channelPermissions,
  has,
  permissionNames,
  type EvaluatedOverwrite,
  type OverwriteKind,
  type PermissionGuild,
} from "./permissions.js";

// ---------------------------------------------------------- observed state

export interface ObservedRole {
  id: string;
  name: string;
  colour: number;
  permissions: bigint;
  hoist: boolean;
  /** Higher is more senior. Omitted in offline snapshots. */
  position?: number;
  /** Integration role owned by an installed application. */
  managed?: boolean;
}
export interface ObservedOverwrite {
  id: string;
  /** Defaults to "role" for older snapshots. */
  kind?: OverwriteKind;
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
  /** Also the @everyone role ID. */
  guildId: string;
  ownerId?: string;
  /** Approximate member count, when observed live. */
  memberCount?: number;
  /** Present when observed live: the bot's user and integration role. */
  bot?: { userId: string; roleId: string };
  roles: ObservedRole[];
  channels: ObservedChannel[];
}
export interface StableIds {
  roleIds?: Record<string, string>;
  channelIds?: Record<string, string>;
}

// -------------------------------------------------------------------- plan

export type ProvisionOperation =
  | {
      action: "create-role";
      key: RoleKey;
      desired: DesiredRole;
      /** Desired permissions limited to what the bot can grant. */
      permissions: bigint;
    }
  | {
      action: "update-role";
      id: string;
      key: RoleKey;
      desired: DesiredRole;
      changes: string[];
    }
  | { action: "position-roles"; keys: RoleKey[] }
  | { action: "update-everyone"; permissions: bigint; changes: string[] }
  | { action: "create-channel"; key: string; desired: DesiredChannel }
  | {
      action: "update-channel";
      id: string;
      key: string;
      desired: DesiredChannel;
      changes: string[];
      /** Members can currently see a channel the blueprint makes private. */
      exposure: boolean;
    }
  | { action: "restrict-unmanaged-channel"; id: string; name: string };

export interface Conflict {
  resource: "role" | "channel" | "guild";
  key: string;
  reason: string;
}

export interface UnmanagedChannel {
  id: string;
  name: string;
  type: number;
  visibleToMembers: boolean;
}

export interface ProvisionPlan {
  blueprintVersion: number;
  guildId: string;
  operations: ProvisionOperation[];
  /** Manual or blocked actions. No operations is not "clean" while conflicts remain. */
  conflicts: Conflict[];
  unmanaged: {
    roles: { id: string; name: string; managed: boolean }[];
    channels: UnmanagedChannel[];
  };
  resolved: {
    roleIds: Record<string, string>;
    channelIds: Record<string, string>;
  };
}

export interface PlanOptions {
  /** Propose an @everyone ViewChannel deny on unmanaged channels members can see. */
  restrictUnmanaged?: boolean;
}

const dynamicParents = ["tickets", "reports"];

const candidateIds = (
  map: Record<string, string> | undefined,
  key: string,
  legacyKeys: readonly string[] = [],
) =>
  [key, ...legacyKeys]
    .map((candidate) => map?.[candidate])
    .filter((id): id is string => typeof id === "string");

const unique = <T>(items: T[]) => (items.length === 1 ? items[0] : undefined);

const describeBits = (bits: bigint) => permissionNames(bits).join(", ");

export function planProvisioning(
  desired: Blueprint,
  observed: ObservedGuild,
  ids: StableIds = {},
  options: PlanOptions = {},
): ProvisionPlan {
  const operations: ProvisionOperation[] = [];
  const conflicts: Conflict[] = [];
  const everyoneId = observed.guildId;
  const roleById = new Map(observed.roles.map((item) => [item.id, item]));
  const channelById = new Map(observed.channels.map((item) => [item.id, item]));

  // ---- resolve roles: stable ID (current or legacy key) → unique name.
  const roleIds: Record<string, string> = {};
  const claimedRoles = new Set<string>([everyoneId]);
  for (const wanted of desired.roles) {
    let current: ObservedRole | undefined;
    if (wanted.managed)
      current = observed.bot
        ? roleById.get(observed.bot.roleId)
        : unique(
            observed.roles.filter(
              (item) => item.managed && item.name === wanted.name,
            ),
          );
    else {
      const id = candidateIds(ids.roleIds, wanted.key, wanted.legacyKeys).find(
        (candidate) => roleById.has(candidate) && !claimedRoles.has(candidate),
      );
      current = id
        ? roleById.get(id)
        : unique(
            observed.roles.filter(
              (item) =>
                !item.managed &&
                item.name === wanted.name &&
                !claimedRoles.has(item.id),
            ),
          );
    }
    if (current) {
      claimedRoles.add(current.id);
      roleIds[wanted.key] = current.id;
    }
  }

  const botRole = roleIds["kush-bot"]
    ? roleById.get(roleIds["kush-bot"])
    : undefined;
  const botPermissions = botRole?.permissions ?? requiredBotPermissions;
  const botPosition = botRole?.position;
  const atOrAboveBot = (role: ObservedRole) =>
    botPosition !== undefined &&
    role.position !== undefined &&
    role.position >= botPosition;

  // ---- role definitions.
  for (const wanted of desired.roles) {
    const current = roleIds[wanted.key]
      ? roleById.get(roleIds[wanted.key]!)
      : undefined;
    if (!current) {
      if (wanted.managed) {
        conflicts.push({
          resource: "role",
          key: wanted.key,
          reason:
            "KUSH Bot integration role not found. Install the bot with the reviewed permission set.",
        });
        continue;
      }
      const permissions = wanted.permissions & botPermissions;
      operations.push({
        action: "create-role",
        key: wanted.key,
        desired: wanted,
        permissions,
      });
      if (permissions !== wanted.permissions)
        conflicts.push({
          resource: "role",
          key: wanted.key,
          reason: `Owner must grant ${describeBits(wanted.permissions & ~permissions)} manually; the bot cannot grant permissions it lacks.`,
        });
      continue;
    }
    if (wanted.managed) {
      if (current.permissions !== wanted.permissions) {
        const missing = wanted.permissions & ~current.permissions;
        const extra = current.permissions & ~wanted.permissions;
        const detail = [
          missing ? `missing ${describeBits(missing)}` : "",
          extra ? `unexpected ${describeBits(extra)}` : "",
        ].filter(Boolean);
        conflicts.push({
          resource: "role",
          key: wanted.key,
          reason: `Bot role permissions differ: ${detail.join("; ")}. Reinstall or edit the integration role.`,
        });
      }
      continue;
    }
    const changes: string[] = [];
    if (current.name !== wanted.name)
      changes.push(`name "${current.name}" → "${wanted.name}"`);
    if (current.colour !== wanted.colour) changes.push("colour");
    if (current.hoist !== wanted.hoist) changes.push("hoist");
    if (current.permissions !== wanted.permissions) {
      const missing = wanted.permissions & ~current.permissions;
      const extra = current.permissions & ~wanted.permissions;
      if (missing) changes.push(`grant ${describeBits(missing)}`);
      if (extra) changes.push(`revoke ${describeBits(extra)}`);
    }
    if (!changes.length) continue;
    if (atOrAboveBot(current) || wanted.permissions & ~botPermissions)
      conflicts.push({
        resource: "role",
        key: wanted.key,
        reason: `Owner must update this role manually (${changes.join("; ")}); it is above the bot or needs permissions the bot lacks.`,
      });
    else
      operations.push({
        action: "update-role",
        id: current.id,
        key: wanted.key,
        desired: wanted,
        changes,
      });
  }

  // ---- @everyone guild-level permissions (unverified visitors).
  const everyone = roleById.get(everyoneId);
  if (everyone && everyone.permissions !== desired.everyonePermissions) {
    const missing = desired.everyonePermissions & ~everyone.permissions;
    const extra = everyone.permissions & ~desired.everyonePermissions;
    const changes = [
      ...(missing ? [`grant ${describeBits(missing)}`] : []),
      ...(extra ? [`revoke ${describeBits(extra)}`] : []),
    ];
    if (desired.everyonePermissions & ~botPermissions)
      conflicts.push({
        resource: "role",
        key: "everyone",
        reason: `Owner must update @everyone manually (${changes.join("; ")}); the bot lacks some of these permissions.`,
      });
    else
      operations.push({
        action: "update-everyone",
        permissions: desired.everyonePermissions,
        changes,
      });
  }

  // ---- hierarchy. Array order is the required order, highest first.
  const order = desired.roles.map((item) => item.key);
  const nameOf = (key: RoleKey) =>
    desired.roles.find((item) => item.key === key)!.name;
  const positioned = order.filter(
    (key) => roleById.get(roleIds[key] ?? "")?.position !== undefined,
  );
  const position = (key: RoleKey) => roleById.get(roleIds[key]!)!.position!;
  let reorderBotManaged = operations.some(
    (operation) =>
      operation.action === "create-role" &&
      botManagedRoles.includes(operation.key),
  );
  const hierarchy = new Map<string, Conflict>();
  const requireAbove = (higher: RoleKey, lower: RoleKey) =>
    hierarchy.set(`${higher}>${lower}`, {
      resource: "role",
      key: higher,
      reason: `Move role "${nameOf(higher)}" above "${nameOf(lower)}" in Server Settings → Roles.`,
    });
  const botIndex = order.indexOf("kush-bot");
  if (positioned.includes("kush-bot"))
    positioned.forEach((key) => {
      const index = order.indexOf(key);
      if (index < botIndex && position(key) <= position("kush-bot"))
        requireAbove(key, "kush-bot");
      if (index > botIndex && position(key) >= position("kush-bot"))
        requireAbove("kush-bot", key);
    });
  for (let index = 1; index < positioned.length; index += 1) {
    const higher = positioned[index - 1]!;
    const lower = positioned[index]!;
    if (position(higher) > position(lower)) continue;
    if (botManagedRoles.includes(higher) && botManagedRoles.includes(lower))
      reorderBotManaged = true;
    else if (higher !== "kush-bot" && lower !== "kush-bot")
      requireAbove(higher, lower);
  }
  conflicts.push(...hierarchy.values());
  if (reorderBotManaged)
    operations.push({
      action: "position-roles",
      keys: order.filter((key) => botManagedRoles.includes(key)),
    });

  // ---- permission model of the observed guild (for exposure checks).
  const permissionGuild: PermissionGuild = {
    id: everyoneId,
    ownerId: observed.ownerId ?? "",
    rolePermissions: new Map(
      observed.roles.map((item) => [item.id, item.permissions]),
    ),
  };
  const memberPersona = {
    id: "kush-plan-member",
    roleIds: roleIds.member ? [roleIds.member] : [],
  };
  const toEvaluated = (overwrites: ObservedOverwrite[] = []) =>
    overwrites.map((item): EvaluatedOverwrite => ({
      ...item,
      kind: item.kind ?? "role",
    }));
  const visibleToMembers = (channel: {
    type: number;
    overwrites: EvaluatedOverwrite[];
  }) =>
    has(
      channelPermissions(permissionGuild, memberPersona, channel),
      P.ViewChannel,
    );
  const botCanManage = (channel: ObservedChannel) =>
    !observed.bot ||
    has(
      channelPermissions(
        permissionGuild,
        { id: observed.bot.userId, roleIds: [observed.bot.roleId] },
        { type: channel.type, overwrites: toEvaluated(channel.overwrites) },
      ),
      P.ViewChannel | P.ManageChannels | P.ManageRoles,
    );

  // ---- resolve channels.
  const channelIds: Record<string, string> = {};
  const claimedChannels = new Set<string>();
  for (const wanted of desired.channels) {
    const byId = candidateIds(
      ids.channelIds,
      wanted.key,
      wanted.legacyKeys,
    ).find(
      (candidate) =>
        channelById.has(candidate) && !claimedChannels.has(candidate),
    );
    const current = byId
      ? channelById.get(byId)
      : unique(
          observed.channels.filter(
            (item) =>
              item.name === wanted.name &&
              item.type === wanted.type &&
              !claimedChannels.has(item.id),
          ),
        );
    if (!current) continue;
    claimedChannels.add(current.id);
    channelIds[wanted.key] = current.id;
  }

  const principalId = (principal: Principal) =>
    principal === "everyone" ? everyoneId : roleIds[principal];
  const keyForRoleId = new Map(
    Object.entries(roleIds).map(([key, id]) => [id, key]),
  );
  keyForRoleId.set(everyoneId, "@everyone");
  const label = (kind: string, id: string) =>
    kind === "member" ? `member ${id}` : (keyForRoleId.get(id) ?? `role ${id}`);

  for (const wanted of desired.channels) {
    const id = channelIds[wanted.key];
    const current = id ? channelById.get(id) : undefined;
    if (!current) {
      operations.push({
        action: "create-channel",
        key: wanted.key,
        desired: wanted,
      });
      continue;
    }
    if (current.type !== wanted.type) {
      conflicts.push({
        resource: "channel",
        key: wanted.key,
        reason: `Mapped channel ${current.id} has type ${current.type}, expected ${wanted.type}; channel types cannot be converted.`,
      });
      continue;
    }

    const changes: string[] = [];
    if (current.name !== wanted.name)
      changes.push(`name "${current.name}" → "${wanted.name}"`);
    if (wanted.topic !== undefined && (current.topic ?? "") !== wanted.topic)
      changes.push("topic");
    if (wanted.parentKey) {
      const parentId = channelIds[wanted.parentKey];
      if (!parentId || current.parentId !== parentId) changes.push("parent");
    }

    // Unresolved principals are drift, never a match (regression: fail open).
    const expected = new Map<string, { allow: bigint; deny: bigint }>();
    const unresolved: Principal[] = [];
    for (const overwrite of wanted.overwrites) {
      const roleId = principalId(overwrite.principal);
      if (!roleId) unresolved.push(overwrite.principal);
      else expected.set(`role:${roleId}`, overwrite);
    }
    const actual = new Map(
      (current.overwrites ?? []).map((item) => [
        `${item.kind ?? "role"}:${item.id}`,
        item,
      ]),
    );
    if (unresolved.length)
      changes.push(`overwrites for unresolved roles: ${unresolved.join(", ")}`);
    for (const [key, value] of expected) {
      const [kind, roleId] = key.split(":") as [string, string];
      const found = actual.get(key);
      if (!found) changes.push(`missing overwrite for ${label(kind, roleId)}`);
      else if (found.allow !== value.allow || found.deny !== value.deny)
        changes.push(`overwrite for ${label(kind, roleId)} differs`);
    }
    for (const key of actual.keys())
      if (!expected.has(key)) {
        const [kind, roleId] = key.split(":") as [string, string];
        changes.push(`unexpected overwrite for ${label(kind, roleId)}`);
      }
    if (!changes.length) continue;

    const desiredEvaluated = [...expected].map(
      ([key, value]): EvaluatedOverwrite => ({
        id: key.slice("role:".length),
        kind: "role",
        allow: value.allow,
        deny: value.deny,
      }),
    );
    const exposure =
      visibleToMembers({
        type: current.type,
        overwrites: toEvaluated(current.overwrites),
      }) &&
      !visibleToMembers({ type: wanted.type, overwrites: desiredEvaluated });

    if (!botCanManage(current))
      conflicts.push({
        resource: "channel",
        key: wanted.key,
        reason: `${exposure ? "EXPOSED: members can view this private channel. " : ""}The bot cannot manage #${current.name}; the owner must apply: ${changes.join("; ")}.`,
      });
    else
      operations.push({
        action: "update-channel",
        id: current.id,
        key: wanted.key,
        desired: wanted,
        changes,
        exposure,
      });
  }

  // ---- unmanaged resources are reported, never deleted.
  const dynamicParentIds = new Set(
    dynamicParents.map((key) => channelIds[key]).filter(Boolean),
  );
  const unmanagedChannels = observed.channels
    .filter(
      (item) =>
        !claimedChannels.has(item.id) &&
        !(item.parentId && dynamicParentIds.has(item.parentId)),
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      visibleToMembers: visibleToMembers({
        type: item.type,
        overwrites: toEvaluated(item.overwrites),
      }),
    }));
  if (options.restrictUnmanaged)
    for (const item of unmanagedChannels)
      if (item.visibleToMembers)
        operations.push({
          action: "restrict-unmanaged-channel",
          id: item.id,
          name: item.name,
        });

  return {
    blueprintVersion: desired.version,
    guildId: observed.guildId,
    operations,
    conflicts,
    unmanaged: {
      roles: observed.roles
        .filter((item) => !claimedRoles.has(item.id))
        .map((item) => ({
          id: item.id,
          name: item.name,
          managed: Boolean(item.managed),
        })),
      channels: unmanagedChannels,
    },
    resolved: { roleIds, channelIds },
  };
}

// ------------------------------------------------------------------- apply

export interface RoleInput {
  name: string;
  colour: number;
  permissions: bigint;
  hoist: boolean;
}
export interface ResolvedOverwrite {
  id: string;
  kind: OverwriteKind;
  allow: bigint;
  deny: bigint;
}
export interface ChannelInput {
  name: string;
  type: number;
  parentId: string | null;
  topic?: string;
  overwrites: ResolvedOverwrite[];
}

/** Minimal mutation surface. Implemented by discord-adapter.ts and test fakes. */
export interface GuildAdapter {
  observe(): Promise<ObservedGuild>;
  createRole(input: RoleInput, reason: string): Promise<string>;
  updateRole(id: string, input: RoleInput, reason: string): Promise<void>;
  setEveryonePermissions(permissions: bigint, reason: string): Promise<void>;
  setRolePositions(
    positions: { id: string; position: number }[],
    reason: string,
  ): Promise<void>;
  createChannel(input: ChannelInput, reason: string): Promise<string>;
  updateChannel(id: string, input: ChannelInput, reason: string): Promise<void>;
  /** Adds or replaces one role overwrite, leaving the others untouched. */
  setRoleOverwrite(
    channelId: string,
    roleId: string,
    allow: bigint,
    deny: bigint,
    reason: string,
  ): Promise<void>;
}

export interface ApplyResult {
  applied: string[];
  mapping: {
    roleIds: Record<string, string>;
    channelIds: Record<string, string>;
  };
}

/** Carries the partial mapping so it can be persisted before a fresh dry-run. */
export class ApplyError extends Error {
  constructor(
    message: string,
    readonly partial: ApplyResult,
  ) {
    super(message);
  }
}

const applyReason = "KUSH blueprint v2 (reviewed apply)";

const roleInput = (desired: DesiredRole): RoleInput => ({
  name: desired.name,
  colour: desired.colour,
  permissions: desired.permissions,
  hoist: desired.hoist,
});

/** Applies a reviewed plan in dependency order, stopping at the first error. */
export async function applyPlan(
  plan: ProvisionPlan,
  adapter: GuildAdapter,
): Promise<ApplyResult> {
  const roleIds = { ...plan.resolved.roleIds };
  const channelIds = { ...plan.resolved.channelIds };
  const applied: string[] = [];
  const result = (): ApplyResult => ({
    applied,
    mapping: { roleIds, channelIds },
  });

  const resolveOverwrites = (wanted: DesiredChannel): ResolvedOverwrite[] =>
    wanted.overwrites.map((overwrite) => {
      const id =
        overwrite.principal === "everyone"
          ? plan.guildId
          : roleIds[overwrite.principal];
      if (!id)
        throw new Error(
          `role ${overwrite.principal} is unresolved; refusing a partial overwrite set`,
        );
      return { id, kind: "role", allow: overwrite.allow, deny: overwrite.deny };
    });
  const channelInput = (wanted: DesiredChannel): ChannelInput => {
    const parentId = wanted.parentKey ? channelIds[wanted.parentKey] : null;
    if (wanted.parentKey && !parentId)
      throw new Error(`parent ${wanted.parentKey} is unresolved`);
    return {
      name: wanted.name,
      type: wanted.type,
      parentId: parentId ?? null,
      ...(wanted.topic !== undefined ? { topic: wanted.topic } : {}),
      overwrites: resolveOverwrites(wanted),
    };
  };
  const step = async (label: string, work: () => Promise<void>) => {
    try {
      await work();
      applied.push(label);
    } catch (error) {
      throw new ApplyError(
        `${label} failed: ${error instanceof Error ? error.message : "unknown error"}`,
        result(),
      );
    }
  };
  const ofKind = <A extends ProvisionOperation["action"]>(action: A) =>
    plan.operations.filter(
      (item): item is Extract<ProvisionOperation, { action: A }> =>
        item.action === action,
    );

  for (const operation of ofKind("create-role"))
    await step(`create role ${operation.key}`, async () => {
      roleIds[operation.key] = await adapter.createRole(
        { ...roleInput(operation.desired), permissions: operation.permissions },
        applyReason,
      );
    });
  for (const operation of ofKind("update-role"))
    await step(`update role ${operation.key}`, () =>
      adapter.updateRole(
        operation.id,
        roleInput(operation.desired),
        applyReason,
      ),
    );
  for (const operation of ofKind("update-everyone"))
    await step("update @everyone permissions", () =>
      adapter.setEveryonePermissions(operation.permissions, applyReason),
    );
  for (const operation of ofKind("position-roles"))
    await step("position bot-managed roles", async () => {
      const live = await adapter.observe();
      const botPosition = live.roles.find(
        (item) => item.id === live.bot?.roleId,
      )?.position;
      if (botPosition === undefined)
        throw new Error("bot role position is unknown");
      const below = operation.keys
        .map((key) => live.roles.find((item) => item.id === roleIds[key]))
        .filter(
          (item): item is ObservedRole =>
            item?.position !== undefined && item.position < botPosition,
        );
      await adapter.setRolePositions(
        below.map((item, index) => ({
          id: item.id,
          position: botPosition - 1 - index,
        })),
        applyReason,
      );
    });

  // Blueprint order lists each category before its children.
  for (const operation of ofKind("create-channel"))
    await step(`create channel ${operation.key}`, async () => {
      channelIds[operation.key] = await adapter.createChannel(
        channelInput(operation.desired),
        applyReason,
      );
    });
  for (const operation of ofKind("update-channel"))
    await step(`update channel ${operation.key}`, () =>
      adapter.updateChannel(
        operation.id,
        channelInput(operation.desired),
        applyReason,
      ),
    );
  for (const operation of ofKind("restrict-unmanaged-channel"))
    await step(`restrict unmanaged #${operation.name}`, () =>
      adapter.setRoleOverwrite(
        operation.id,
        plan.guildId,
        0n,
        P.ViewChannel,
        "KUSH: restrict unmanaged channel visible to members (reviewed)",
      ),
    );
  return result();
}

export function serialisePlan(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  ) as unknown;
}

// ---------------------------------------------------------------- lockdown

export interface LockdownTarget {
  id: string;
  name: string;
  reason: "private-in-blueprint" | "legacy-sensitive";
}

/** Bits the bot keeps on locked channels so it can finish the v2 apply. */
export const lockdownBotAllow =
  P.ViewChannel | P.ReadMessageHistory | P.SendMessages | P.ManageChannels;

/**
 * Smallest safe correction for exposed sensitive channels: every channel the
 * blueprint makes private, plus every unmanaged channel under a legacy staff
 * or management category, that members can currently see.
 */
export function planLockdown(
  desired: Blueprint,
  observed: ObservedGuild,
  ids: StableIds,
  legacySensitivePrefixes: readonly string[] = ["08-", "09-"],
  sensitiveAreas: readonly string[] = ["staff", "owner"],
): LockdownTarget[] {
  const plan = planProvisioning(desired, observed, ids);
  const byId = new Map(observed.channels.map((item) => [item.id, item]));
  const targets = new Map<string, LockdownTarget>();
  for (const operation of plan.operations)
    if (
      operation.action === "update-channel" &&
      operation.exposure &&
      sensitiveAreas.includes(operation.key.split(":")[0]!)
    )
      targets.set(operation.id, {
        id: operation.id,
        name: byId.get(operation.id)?.name ?? operation.key,
        reason: "private-in-blueprint",
      });
  const sensitiveParents = new Set(
    Object.entries(ids.channelIds ?? {})
      .filter(
        ([key]) =>
          !key.includes(":") &&
          legacySensitivePrefixes.some((prefix) => key.startsWith(prefix)),
      )
      .map(([, id]) => id),
  );
  for (const item of plan.unmanaged.channels) {
    const channel = byId.get(item.id);
    if (
      item.visibleToMembers &&
      channel &&
      (sensitiveParents.has(channel.id) ||
        (channel.parentId !== null && sensitiveParents.has(channel.parentId)))
    )
      targets.set(item.id, {
        id: item.id,
        name: item.name,
        reason: "legacy-sensitive",
      });
  }
  return [...targets.values()];
}

/** Applies a lockdown: @everyone loses ViewChannel, the bot keeps access. */
export async function applyLockdown(
  targets: readonly LockdownTarget[],
  observed: ObservedGuild,
  adapter: GuildAdapter,
): Promise<string[]> {
  if (!observed.bot) throw new Error("Bot role unknown; observe live first");
  const done: string[] = [];
  for (const target of targets) {
    const channel = observed.channels.find((item) => item.id === target.id);
    const everyone = channel?.overwrites?.find(
      (item) => item.id === observed.guildId,
    );
    const bot = channel?.overwrites?.find(
      (item) => item.id === observed.bot!.roleId,
    );
    const reason = "KUSH security lockdown: restrict sensitive channel";
    await adapter.setRoleOverwrite(
      target.id,
      observed.bot.roleId,
      (bot?.allow ?? 0n) | lockdownBotAllow,
      (bot?.deny ?? 0n) & ~lockdownBotAllow,
      reason,
    );
    await adapter.setRoleOverwrite(
      target.id,
      observed.guildId,
      (everyone?.allow ?? 0n) & ~P.ViewChannel,
      (everyone?.deny ?? 0n) | P.ViewChannel,
      reason,
    );
    done.push(target.name);
  }
  return done;
}

/** Hash of the operations only, so a reviewed dry-run can gate a live apply. */
export function planHash(plan: ProvisionPlan): string {
  return createHash("sha256")
    .update(JSON.stringify(serialisePlan(plan.operations)))
    .digest("hex")
    .slice(0, 16);
}

const toBigInt = (value: unknown) =>
  typeof value === "bigint"
    ? value
    : BigInt(
        typeof value === "number" || typeof value === "string" ? value : 0,
      );

/** Restores bigint fields of a JSON snapshot written by `cli.ts inspect`. */
export function reviveObservedGuild(raw: unknown): ObservedGuild {
  const value = raw as ObservedGuild;
  if (typeof value?.guildId !== "string")
    throw new Error("Snapshot must include guildId (the @everyone role ID)");
  return {
    ...value,
    roles: value.roles.map((role) => ({
      ...role,
      permissions: toBigInt(role.permissions),
    })),
    channels: value.channels.map((channel) => ({
      ...channel,
      overwrites: (channel.overwrites ?? []).map((overwrite) => ({
        ...overwrite,
        allow: toBigInt(overwrite.allow),
        deny: toBigInt(overwrite.deny),
      })),
    })),
  };
}
