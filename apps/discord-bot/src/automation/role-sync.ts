import type { DesiredRoles, RoleSyncJob } from "../api-client.js";
import type { Logger } from "../runtime/logger.js";

export interface SyncRoleIds {
  member?: string;
  verifiedCustomer?: string;
  restricted?: string;
}

/**
 * Discord role changes needed to match the backend's desired roles.
 *
 * Only roles this system owns are ever touched: Member (add only),
 * Verified Customer and product roles. Everything else a member holds —
 * staff, partner, beta, notification roles — is left exactly as it is.
 *
 * - Member is never removed: members may hold it from before acceptance was
 *   recorded, and taking it away is a moderation decision, not a sync one.
 * - Restricted members are not given customer or product roles (restriction
 *   strips them); roles they no longer qualify for are still removed.
 */
export function computeRoleChanges(
  current: ReadonlySet<string>,
  desired: DesiredRoles,
  ids: SyncRoleIds,
): { add: string[]; remove: string[] } {
  const restricted = Boolean(ids.restricted && current.has(ids.restricted));
  const wanted = new Set<string>();
  if (desired.member && ids.member) wanted.add(ids.member);
  if (!restricted) {
    if (desired.verifiedCustomer && ids.verifiedCustomer)
      wanted.add(ids.verifiedCustomer);
    for (const id of desired.productRoleIds) wanted.add(id);
  }
  const removable = new Set<string>(desired.managedProductRoleIds);
  if (ids.verifiedCustomer) removable.add(ids.verifiedCustomer);

  const add = [...wanted].filter((id) => !current.has(id)).sort();
  const remove = [...current]
    .filter((id) => removable.has(id) && !wanted.has(id))
    .sort();
  return { add, remove };
}

/** What the worker needs from Discord, so it can be tested with a fake. */
export interface MemberGateway {
  /** Current role IDs, or null when the member is not in the guild. */
  roles(discordUserId: string): Promise<Set<string> | null>;
  addRoles(
    discordUserId: string,
    roleIds: string[],
    reason: string,
  ): Promise<void>;
  removeRoles(
    discordUserId: string,
    roleIds: string[],
    reason: string,
  ): Promise<void>;
  notify(discordUserId: string, message: string): Promise<void>;
}

export interface RoleSyncApi {
  roleSyncJobs(): Promise<RoleSyncJob[]>;
  finishRoleSyncJob(
    jobId: string,
    outcome: { ok: true } | { ok: false; error: string },
  ): Promise<void>;
  desiredRoles(discordUserId: string): Promise<DesiredRoles>;
}

export interface SyncStats {
  processed: number;
  failed: number;
  lastRunAt: string | null;
  lastError: string | null;
}

/**
 * Drains the backend's role-sync queue. Each job is idempotent (it applies
 * the difference to the current state), so retries and restarts are safe.
 */
export class RoleSyncWorker {
  readonly stats: SyncStats = {
    processed: 0,
    failed: 0,
    lastRunAt: null,
    lastError: null,
  };
  #running = false;

  constructor(
    private readonly api: RoleSyncApi,
    private readonly members: MemberGateway,
    private readonly ids: () => SyncRoleIds,
    private readonly log: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Processes due jobs once. Overlapping calls are skipped, not queued. */
  async tick(): Promise<number> {
    if (this.#running) return 0;
    this.#running = true;
    try {
      const jobs = await this.api.roleSyncJobs();
      for (const job of jobs) await this.#process(job);
      this.stats.lastRunAt = this.now().toISOString();
      return jobs.length;
    } finally {
      this.#running = false;
    }
  }

  async #process(job: RoleSyncJob) {
    try {
      const current = await this.members.roles(job.discordUserId);
      // Not in the guild: nothing to apply. Rejoining queues a fresh job.
      if (current) {
        const desired = await this.api.desiredRoles(job.discordUserId);
        const changes = computeRoleChanges(current, desired, this.ids());
        const reason = `KUSH role sync (${job.reason})`.slice(0, 100);
        if (changes.remove.length)
          await this.members.removeRoles(
            job.discordUserId,
            changes.remove,
            reason,
          );
        if (changes.add.length)
          await this.members.addRoles(job.discordUserId, changes.add, reason);
        const gainedProducts = changes.add.filter((id) =>
          desired.productRoleIds.includes(id),
        );
        if (gainedProducts.length && job.reason.includes("purchase"))
          await this.members
            .notify(
              job.discordUserId,
              "Your KUSH purchase is now linked to your Discord account and your product access has been updated. Use `!licenses` to see what you own.",
            )
            .catch(() => undefined);
        if (changes.add.length || changes.remove.length)
          this.log.info("roles.synced", {
            discordUserId: job.discordUserId,
            added: changes.add.length,
            removed: changes.remove.length,
            reason: job.reason,
          });
      }
      await this.api.finishRoleSyncJob(job.id, { ok: true });
      this.stats.processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      this.stats.failed += 1;
      this.stats.lastError = message.slice(0, 200);
      this.log.warn("roles.sync.failed", {
        discordUserId: job.discordUserId,
        error: message,
      });
      await this.api
        .finishRoleSyncJob(job.id, { ok: false, error: message })
        .catch(() => undefined);
    }
  }
}
