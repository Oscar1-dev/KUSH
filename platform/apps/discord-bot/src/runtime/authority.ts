import { configuredRoleId, type RoleKey } from "../blueprint.js";

/**
 * Command authority levels. These gate bot commands only; the KUSH API
 * re-checks tenant membership, ownership and assignment on every call.
 */
export type Authority =
  | "everyone"
  | "member"
  | "support-staff"
  | "support-lead"
  /** Anyone who works tickets: support staff, support lead or moderators. */
  | "ticket-handler"
  /** Any staff role; the API then checks the exact KUSH permission. */
  | "staff"
  | "moderator"
  | "administrator"
  | "owner";

export interface Actor {
  userId: string;
  displayName: string;
  roles: ReadonlySet<RoleKey>;
  isGuildOwner: boolean;
}

const nonMemberRoles: readonly RoleKey[] = ["restricted", "kush-bot"];

/**
 * Administrators manage the server, not customer tickets: they do not
 * inherit support authority (least privilege, matches channel access).
 */
const grantedBy: Record<
  Exclude<Authority, "everyone" | "member">,
  RoleKey[]
> = {
  owner: ["owner"],
  administrator: ["owner", "administrator"],
  moderator: ["owner", "administrator", "moderator"],
  "support-lead": ["owner", "support-lead"],
  "support-staff": ["owner", "support-lead", "support-staff"],
  "ticket-handler": ["owner", "support-lead", "support-staff", "moderator"],
  staff: [
    "owner",
    "administrator",
    "developer",
    "support-lead",
    "support-staff",
    "moderator",
  ],
};

export function hasAuthority(actor: Actor, required: Authority): boolean {
  if (actor.isGuildOwner) return true;
  if (required === "everyone") return true;
  if (required === "member")
    return [...actor.roles].some((role) => !nonMemberRoles.includes(role));
  return grantedBy[required].some((role) => actor.roles.has(role));
}

export const isRestricted = (actor: Actor) =>
  !actor.isGuildOwner && actor.roles.has("restricted");

/** Maps Discord role IDs to blueprint keys using the stable ID config. */
export function roleKeysFor(
  discordRoleIds: Iterable<string>,
  configuredRoleIds: Record<string, string>,
  knownKeys: readonly RoleKey[],
): Set<RoleKey> {
  const byId = new Map<string, RoleKey>();
  for (const key of knownKeys) {
    const id = configuredRoleId(configuredRoleIds, key);
    if (id) byId.set(id, key);
  }
  const keys = new Set<RoleKey>();
  for (const id of discordRoleIds) {
    const key = byId.get(id);
    if (key) keys.add(key);
  }
  return keys;
}
