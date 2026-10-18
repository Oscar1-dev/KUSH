import { welcomeCard } from "../moderation/mod-log.js";
import type { Guild, GuildMember, PartialGuildMember } from "discord.js";
import type { DiscordApiClient } from "../api-client.js";
import { embed } from "../panels.js";
import type { Logger } from "../runtime/logger.js";
import type { MemberGateway } from "./role-sync.js";

/** Bump when the rules text materially changes. */
export const RULES_VERSION = "2026-10-17";

/** discord.js implementation of the role-sync member surface. */
export class DiscordMemberGateway implements MemberGateway {
  constructor(private readonly guild: () => Guild) {}

  async #member(discordUserId: string) {
    return this.guild()
      .members.fetch(discordUserId)
      .catch(() => null);
  }

  async roles(discordUserId: string) {
    const member = await this.#member(discordUserId);
    return member ? new Set(member.roles.cache.keys()) : null;
  }

  async addRoles(discordUserId: string, roleIds: string[], reason: string) {
    const member = await this.#member(discordUserId);
    if (member) await member.roles.add(roleIds, reason);
  }

  async removeRoles(discordUserId: string, roleIds: string[], reason: string) {
    const member = await this.#member(discordUserId);
    if (member) await member.roles.remove(roleIds, reason);
  }

  async notify(discordUserId: string, message: string) {
    const member = await this.#member(discordUserId);
    if (member)
      await member.send({ content: message, allowedMentions: { parse: [] } });
  }
}

export interface MembershipDependencies {
  api: DiscordApiClient;
  log: Logger;
  rulesChannelId: string | undefined;
  welcomeChannelId?: string | undefined;
  supportChannelId?: string | undefined;
  /** Wakes the role-sync worker after an event, instead of waiting for the poll. */
  kick: () => void;
}

/**
 * New members are recorded but NOT given Member: in this server the rules
 * button is the screening step. Returning members who already accepted get
 * Member (and any customer roles) back through role sync.
 */
export async function onMemberJoin(
  member: GuildMember,
  {
    api,
    log,
    rulesChannelId,
    welcomeChannelId,
    supportChannelId,
    kick,
  }: MembershipDependencies,
) {
  if (member.user.bot) return;
  await api.presence(member.id, true);
  kick();
  // Public welcome card in #welcome (no personal data beyond the profile).
  const welcome = welcomeChannelId
    ? member.guild.channels.cache.get(welcomeChannelId)
    : undefined;
  if (welcome?.isSendable())
    await welcome
      .send({
        embeds: [
          welcomeCard(member, {
            rules: rulesChannelId,
            support: supportChannelId,
          }),
        ],
        allowedMentions: { parse: [] },
      })
      .catch(() =>
        log.info("welcome.post.failed", { discordUserId: member.id }),
      );
  // Discord's own membership screening is in progress; wait for it.
  if (member.pending) return;
  const desired = await api.desiredRoles(member.id).catch(() => null);
  if (desired?.member) return; // Returning member: sync restores access.
  await member
    .send({
      embeds: [
        embed(
          `Welcome to ${member.guild.name}`,
          [
            `To join the community, read the rules${rulesChannelId ? ` in <#${rulesChannelId}>` : ""} and press **I have read and accept the rules**.`,
            "You can open a private support ticket at any time without doing this — type `!ticket` in the server.",
          ].join("\n\n"),
        ),
      ],
      allowedMentions: { parse: [] },
    })
    .catch(() =>
      log.info("onboarding.dm.unavailable", { discordUserId: member.id }),
    );
}

/** Discord membership screening finished: treat it as accepting the rules. */
export async function onMemberUpdate(
  before: GuildMember | PartialGuildMember,
  after: GuildMember,
  { api, kick }: MembershipDependencies,
) {
  if (before.pending && !after.pending && !after.user.bot) {
    await api.acceptRules(after.id, `discord-screening:${RULES_VERSION}`);
    kick();
  }
}

export async function onMemberLeave(
  member: GuildMember | PartialGuildMember,
  { api }: MembershipDependencies,
) {
  if (member.user?.bot) return;
  await api.presence(member.id, false);
}

/**
 * Records members who already hold Member (granted before acceptance was
 * stored) as accepted, so leaving and rejoining restores their access.
 * Only fills gaps; never overwrites a real acceptance.
 */
export async function backfillAcceptances(
  guild: Guild,
  memberRoleId: string | undefined,
  { api, log }: Pick<MembershipDependencies, "api" | "log">,
) {
  if (!memberRoleId) return 0;
  const members = await guild.members.fetch();
  let recorded = 0;
  for (const member of members.values()) {
    if (member.user.bot || !member.roles.cache.has(memberRoleId)) continue;
    const desired = await api.desiredRoles(member.id).catch(() => null);
    if (desired && !desired.member) {
      await api.acceptRules(member.id, "pre-existing-member-role");
      recorded += 1;
    }
  }
  if (recorded) log.info("onboarding.backfilled", { recorded });
  return recorded;
}
