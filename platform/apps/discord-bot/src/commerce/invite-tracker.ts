import type { Guild, GuildMember } from "discord.js";
import type { DiscordApiClient } from "../api-client.js";
import type { Logger } from "../runtime/logger.js";

/**
 * Referral attribution from Discord invites. Discord doesn't say which
 * invite a member used, only each invite's use count, so the bot keeps a
 * snapshot and compares it on every join. Only an unambiguous change counts:
 *  - exactly one invite's uses went up by one → "exact"
 *  - nothing went up but exactly one single-use invite vanished → "probable"
 * Anything else (two joins at once, vanity URL, no permission) records no
 * inviter; members can still enter a referral code instead.
 * Reading invites needs the bot's Manage Server permission.
 */

export interface InviteState {
  uses: number;
  maxUses: number;
  inviterId: string | null;
}
export type InviteSnapshot = Map<string, InviteState>;

export interface Attribution {
  inviterId: string;
  code: string;
  confidence: "exact" | "probable";
}

export function attribute(
  before: InviteSnapshot,
  after: InviteSnapshot,
): Attribution | null {
  const increased = [...after].filter(
    ([code, state]) => state.uses > (before.get(code)?.uses ?? 0),
  );
  if (increased.length === 1) {
    const [code, state] = increased[0]!;
    const previous = before.get(code)?.uses ?? 0;
    return state.inviterId && state.uses - previous === 1
      ? { inviterId: state.inviterId, code, confidence: "exact" }
      : null;
  }
  if (increased.length > 1) return null;
  const vanished = [...before].filter(
    ([code, state]) =>
      !after.has(code) && state.maxUses > 0 && state.uses === state.maxUses - 1,
  );
  if (vanished.length === 1 && vanished[0]![1].inviterId)
    return {
      inviterId: vanished[0]![1].inviterId,
      code: vanished[0]![0],
      confidence: "probable",
    };
  return null;
}

export class InviteTracker {
  #snapshot: InviteSnapshot | null = null;
  #warned = false;
  /** Joins are handled one at a time so each diff sees one join. */
  #queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly api: DiscordApiClient,
    private readonly log: Logger,
  ) {}

  async #read(guild: Guild): Promise<InviteSnapshot | null> {
    try {
      const invites = await guild.invites.fetch();
      return new Map(
        [...invites.values()].map((invite) => [
          invite.code,
          {
            uses: invite.uses ?? 0,
            maxUses: invite.maxUses ?? 0,
            inviterId: invite.inviterId ?? null,
          },
        ]),
      );
    } catch (error) {
      if (!this.#warned)
        this.log.warn("referrals.invites.unavailable", {
          reason:
            error instanceof Error ? error.message : "missing Manage Server",
        });
      this.#warned = true;
      return null;
    }
  }

  /** Takes the starting snapshot (on ready, and after invite changes). */
  async refresh(guild: Guild) {
    this.#queue = this.#queue.then(async () => {
      this.#snapshot = await this.#read(guild);
    });
    await this.#queue;
  }

  joined(member: GuildMember) {
    this.#queue = this.#queue
      .then(() => this.#joined(member))
      .catch((error: unknown) =>
        this.log.error("referrals.join.failed", {
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
    return this.#queue;
  }

  async #joined(member: GuildMember) {
    if (member.user.bot) return;
    const after = await this.#read(member.guild);
    const found =
      this.#snapshot && after ? attribute(this.#snapshot, after) : null;
    if (after) this.#snapshot = after;
    const result = await this.api.referralJoin({
      invitedDiscordId: member.id,
      accountCreatedAt: member.user.createdAt.toISOString(),
      joinedAt: (member.joinedAt ?? new Date()).toISOString(),
      inviter: found
        ? {
            discordUserId: found.inviterId,
            inviteCode: found.code,
            confidence: found.confidence,
          }
        : null,
    });
    if (result.recorded)
      this.log.info("referrals.join.recorded", {
        confidence: found?.confidence ?? "none",
        status: result.status ?? "pending",
      });
  }

  async left(member: { id: string; user: { bot: boolean } | null }) {
    if (member.user?.bot) return;
    await this.api.referralLeave(member.id);
  }
}
