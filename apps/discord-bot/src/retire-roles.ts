import { createHash } from "node:crypto";
import { PermissionFlagsBits as P } from "discord.js";
import type { ObservedGuild } from "./provisioning.js";

/**
 * Deleting a Discord role cannot be undone, so it is planned separately from
 * the blueprint apply, reviewed, and then applied with the plan's hash.
 *
 * A role is only ever deleted by the bot when it is below the bot, carries
 * no Administrator, and either has no holders or is a leftover TEST role.
 * Everything else is reported as an owner action instead.
 */

export type RetiredRole =
  { configKey: string; reason: string } | { roleId: string; reason: string };

export interface RetirementItem {
  roleId: string;
  configKey: string | null;
  name: string;
  reason: string;
  holders: number;
  action: "delete" | "owner" | "already-gone";
  /** Why the bot won't delete it itself. */
  blocker?: string;
}

export function planRoleRetirement(
  retired: readonly RetiredRole[],
  observed: ObservedGuild,
  roleIds: Record<string, string>,
  holders: ReadonlyMap<string, number>,
): RetirementItem[] {
  const botPosition = observed.roles.find(
    (role) => role.id === observed.bot?.roleId,
  )?.position;
  return retired.map((entry): RetirementItem => {
    const configKey = "configKey" in entry ? entry.configKey : null;
    const roleId =
      "roleId" in entry ? entry.roleId : (roleIds[entry.configKey] ?? "");
    const role = observed.roles.find((item) => item.id === roleId);
    if (!role)
      return {
        roleId,
        configKey,
        name: configKey ?? roleId,
        reason: entry.reason,
        holders: 0,
        action: "already-gone",
      };
    const count = holders.get(role.id) ?? 0;
    const test = /^TEST\b/.test(entry.reason);
    const blocker = role.managed
      ? "integration role"
      : botPosition === undefined || (role.position ?? 0) >= botPosition
        ? "above the bot: delete it in Server Settings → Roles"
        : role.permissions & P.Administrator
          ? "carries Administrator: the owner should delete it"
          : count > 0 && !test
            ? `${count} member(s) hold it`
            : undefined;
    return {
      roleId: role.id,
      configKey,
      name: role.name,
      reason: entry.reason,
      holders: count,
      action: blocker ? "owner" : "delete",
      ...(blocker ? { blocker } : {}),
    };
  });
}

/** What the reviewer approves: exactly these deletions, in this state. */
export const retirementHash = (items: readonly RetirementItem[]) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        items
          .filter((item) => item.action === "delete")
          .map((item) => [item.roleId, item.name, item.holders]),
      ),
    )
    .digest("hex")
    .slice(0, 16);
