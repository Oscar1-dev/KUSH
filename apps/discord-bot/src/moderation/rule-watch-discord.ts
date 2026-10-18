import {
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type GuildMember,
  type Message,
} from "discord.js";
import { configuredRoleId } from "../blueprint.js";
import { card } from "../panels.js";
import { hasAuthority, type Actor } from "../runtime/authority.js";
import type { BotServices } from "../runtime/command.js";
import {
  detect,
  parseRuleWatchButton,
  reportMessage,
  type RuleWatchTracker,
} from "./rule-watch.js";

const TIMEOUT_MS = 10 * 60_000;

/**
 * Scans a member's message in a public channel and reports findings to
 * #moderation-log. Staff, private channels (tickets, applications, staff
 * areas) and bots are never scanned.
 */
export async function watchMessage(
  message: Message<true>,
  member: GuildMember,
  actor: Actor,
  services: BotServices,
  tracker: RuleWatchTracker,
) {
  if (hasAuthority(actor, "ticket-handler") || hasAuthority(actor, "moderator"))
    return;
  if (actor.roles.has("developer") || actor.roles.has("kush-bot")) return;
  const everyone = message.guild.roles.everyone;
  if (
    !message.channel
      .permissionsFor(everyone)
      ?.has(PermissionFlagsBits.ViewChannel)
  )
    return;
  const reportChannelId = services.config.channelIds["staff:moderation-log"];
  if (!reportChannelId) return;

  const findings = detect(
    {
      content: message.content,
      userMentions: message.mentions.users.size,
      roleMentions: message.mentions.roles.size,
      everyone: /@(?:everyone|here)\b/.test(message.content),
      displayName: member.displayName,
    },
    (process.env.KUSH_DISCORD_INVITE_CODES ?? "")
      .split(",")
      .map((code) => code.trim().toLowerCase())
      .filter(Boolean),
  );
  // Invites to KUSH itself are fine: resolve the invite and drop the
  // finding when it points at this server (or can't be resolved: expired).
  const inviteAt = findings.findIndex((finding) => finding.key === "invite");
  if (inviteAt >= 0) {
    const code = /(?:invite|\.gg|\.me)\/([a-z0-9-]{2,32})/i.exec(
      message.content,
    )?.[1];
    const invite = code
      ? await message.client.fetchInvite(code).catch(() => null)
      : null;
    if (invite?.guild?.id === message.guildId) findings.splice(inviteAt, 1);
  }
  const flood = tracker.flood(message.author.id, message.content);
  if (flood) findings.push(flood);
  const fresh = findings.filter((finding) =>
    tracker.shouldReport(message.author.id, finding.key),
  );
  if (!fresh.length) return;

  const report = reportMessage({
    findings: fresh,
    userId: message.author.id,
    channelId: message.channelId,
    messageId: message.id,
    guildId: message.guildId,
    excerpt: message.content,
  });
  const channel = message.guild.channels.cache.get(reportChannelId);
  if (!channel?.isSendable()) return;
  // Ping moderators only for high-severity reports, to keep pings meaningful.
  const moderatorRole = configuredRoleId(services.config.roleIds, "moderator");
  const ping =
    fresh.some((finding) => finding.severity === "high") && moderatorRole;
  await channel.send({
    ...(ping ? { content: `<@&${moderatorRole}>` } : {}),
    ...report,
    allowedMentions: { parse: [], roles: ping ? [moderatorRole] : [] },
  });
  services.log.info("rulewatch.reported", {
    rules: fresh.map((finding) => finding.key).join(","),
    channelId: message.channelId,
  });
}

/** Handles the report buttons. Returns false if the button isn't ours. */
export async function handleRuleWatchButton(
  interaction: ButtonInteraction,
  actor: Actor,
  services: BotServices,
): Promise<boolean> {
  const parsed = parseRuleWatchButton(interaction.customId);
  if (!parsed) return false;
  if (!hasAuthority(actor, "moderator")) {
    await interaction.reply({
      content: "Only moderators can act on rule-watch reports.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  const guild = interaction.guild!;
  const reason = `Rule ${parsed.rule} (rule watch report)`;
  let outcome: string;
  try {
    if (parsed.action === "delete") {
      const channel = guild.channels.cache.get(parsed.channelId);
      if (channel?.isTextBased())
        await channel.messages
          .delete(parsed.messageId)
          .catch((error: unknown) => {
            // 10008: already deleted.
            if ((error as { code?: number }).code !== 10008) throw error;
          });
      outcome = "🗑️ Message deleted";
    } else if (parsed.action === "warn" || parsed.action === "timeout") {
      if (parsed.action === "timeout") {
        const member = await guild.members.fetch(parsed.userId);
        await member.timeout(TIMEOUT_MS, `${actor.displayName}: ${reason}`);
      }
      const recorded = await services.api
        .recordCase({
          kind: parsed.action,
          targetId: parsed.userId,
          moderatorId: actor.userId,
          reason,
          ...(parsed.action === "timeout"
            ? { durationSeconds: TIMEOUT_MS / 1_000 }
            : {}),
          source: "bot",
        })
        .catch(() => null);
      await services.moderation
        ?.notify(
          parsed.userId,
          card({
            emoji: parsed.action === "timeout" ? "🔇" : "⚠️",
            title:
              parsed.action === "timeout"
                ? "You were timed out in KUSH for 10 minutes"
                : "You received a warning in KUSH",
            tone: "warning",
            description: `**Reason:** breaking server rule ${parsed.rule}. Please re-read the rules.\n\nIf you think this was a mistake, open a ticket and a staff member will review it.`,
            timestamp: true,
          }),
        )
        .catch(() => false);
      outcome = `${parsed.action === "timeout" ? "🔇 Timed out 10 min" : "⚠️ Warned"}${recorded ? ` · Case #${recorded.number}` : ""}`;
    } else outcome = "✅ Dismissed (no action needed)";
  } catch (error) {
    await interaction.reply({
      content: `Couldn't do that: ${error instanceof Error ? error.message : "unknown error"}. The member may have left or rank above the bot.`,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  // Record who handled it. Delete leaves warn/timeout available (staff
  // often do both); any other action closes the report.
  const [original] = interaction.message.embeds;
  const updated = EmbedBuilder.from(original!).addFields({
    name: "Handled",
    value: `${outcome} by <@${actor.userId}> <t:${Math.floor(Date.now() / 1_000)}:R>`,
  });
  if (parsed.action === "dismiss") updated.setColor(0x6b7280);
  const rows = interaction.message.components.map((row) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      ("components" in row ? row.components : []).map((component) =>
        ButtonBuilder.from(component as never).setDisabled(
          parsed.action !== "delete" ||
            ("customId" in component &&
              /^rw:(delete|dismiss):/.test(String(component.customId))) ||
            Boolean("disabled" in component && component.disabled),
        ),
      ),
    ),
  );
  await interaction.update({ embeds: [updated], components: rows });
  return true;
}
