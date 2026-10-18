import { ApiError } from "../api-client.js";
import { offboardInDiscord } from "./offboard.js";
import { configuredRoleId, staffRoles } from "../blueprint.js";
import { card } from "../panels.js";
import {
  CommandError,
  type CommandContext,
  type CommandDefinition,
} from "../runtime/command.js";

/**
 * Vouches (verified customers review KUSH) and staff offboarding.
 * Both reuse the moderation gateway for Discord access.
 */

const MENTION = /^<@!?(\d{17,20})>$|^(\d{17,20})$/;
const userIdFrom = (token: string | undefined) => {
  const match = token ? MENTION.exec(token) : null;
  return match ? (match[1] ?? match[2]!) : null;
};

const discord = (context: CommandContext) => {
  const found = context.services.moderation;
  if (!found)
    throw new CommandError("The bot is still starting up. Try again shortly.");
  return found;
};

export const stars = (rating: number) =>
  "★".repeat(rating) + "☆".repeat(5 - rating);

export const vouchCard = (input: {
  number: number;
  authorId: string;
  rating: number;
  body: string;
}) =>
  card({
    emoji: "⭐",
    title: `Vouch #${input.number}`,
    tone:
      input.rating >= 4 ? "success" : input.rating === 3 ? "info" : "warning",
    description: [
      `**${stars(input.rating)}**`,
      "",
      `> ${input.body.replaceAll("\n", "\n> ")}`,
    ].join("\n"),
    fields: [
      { name: "From", value: `<@${input.authorId}>`, inline: true },
      { name: "Status", value: "✅ Verified customer", inline: true },
    ],
    footer: "KUSH • Leave yours with !vouch",
    timestamp: true,
  });

export const communityCommands: CommandDefinition[] = [
  {
    path: ["vouch"],
    group: "Customers",
    authority: "member",
    // No cooldown here: the API allows one vouch per day, and a cooldown
    // would also lock people out after a typo.
    summary: "Review KUSH (verified customers)",
    usage: "!vouch <1-5> <your review>",
    options: [
      {
        name: "arguments",
        description: "Rating 1-5, then your review",
        required: true,
      },
    ],
    run: async (context) => {
      // Only people who actually bought from KUSH can vouch.
      if (!context.actor.roles.has("verified-customer"))
        throw new CommandError(
          "Vouches are for verified customers. Link your Discord on the KUSH website after a purchase and you'll get the Verified Customer role.",
        );
      const [ratingToken, ...rest] = context.args;
      const rating = Number(ratingToken);
      const body = rest.join(" ").trim();
      if (!Number.isInteger(rating) || rating < 1 || rating > 5)
        throw new CommandError(
          "Usage: `!vouch <1-5> <your review>`, e.g. `!vouch 5 Fast and friendly!`",
        );
      if (body.length < 10 || body.length > 600)
        throw new CommandError("Your review should be 10 to 600 characters.");
      const channelId = context.services.config.channelIds["community:vouches"];
      if (!channelId)
        throw new CommandError("The vouches channel isn't set up yet.");
      const vouch = await context.services.api.vouch({
        discordUserId: context.actor.userId,
        authorName: (context.actor.displayName || "KUSH customer").slice(0, 64),
        rating,
        body,
      });
      const messageId = await discord(context)
        .post(
          channelId,
          vouchCard({
            number: vouch.number,
            authorId: context.actor.userId,
            rating,
            body,
          }),
        )
        .catch(() => null);
      if (messageId)
        await context.services.api
          .setVouchMessage(vouch.number, messageId)
          .catch(() => undefined);
      await context.deleteTrigger?.().catch(() => undefined);
      await context.reply({
        content: `⭐ Thanks for your vouch (#${vouch.number})! It's in <#${channelId}> and on the KUSH website.`,
      });
    },
  },
  {
    path: ["unvouch"],
    group: "Moderation",
    authority: "moderator",
    summary: "Remove a vouch (spam, abuse or fake)",
    usage: "!unvouch <number>",
    options: [
      { name: "arguments", description: "Vouch number", required: true },
    ],
    run: async (context) => {
      const number = Number(context.args[0]?.replace(/^#/, ""));
      if (!Number.isInteger(number) || number < 1)
        throw new CommandError("Usage: `!unvouch <number>`");
      const result = await context.services.api
        .hideVouch(number, context.actor.userId)
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 404)
            throw new CommandError(`There is no vouch #${number}.`);
          throw error;
        });
      const channelId = context.services.config.channelIds["community:vouches"];
      if (result.messageId && channelId)
        await discord(context).deleteMessage(channelId, result.messageId);
      await context.reply({
        content: `🗑️ Vouch #${number} removed from Discord and the website.`,
      });
    },
  },
  {
    path: ["offboard"],
    group: "Administration",
    authority: "administrator",
    summary: "Remove someone from the KUSH team",
    usage: "!offboard @staff <reason>",
    options: [
      {
        name: "arguments",
        description: "@staff then the reason",
        required: true,
      },
    ],
    run: async (context) => {
      const targetId = userIdFrom(context.args[0]);
      const reason = context.args.slice(1).join(" ").trim().slice(0, 1_000);
      if (!targetId || !reason)
        throw new CommandError("Usage: `!offboard @staff <reason>`");
      if (targetId === context.actor.userId)
        throw new CommandError("You can't offboard yourself.");
      const gateway = discord(context);
      const member = await gateway.member(targetId);
      if (!member) throw new CommandError("That user isn't in the server.");
      if (member.isOwner)
        throw new CommandError("The owner can't be offboarded.");
      const roleIds = context.services.config.roleIds;
      const held = staffRoles.filter((key) => {
        const id = configuredRoleId(roleIds, key);
        return id !== undefined && member.roleIds.includes(id);
      });
      if (!held.length)
        throw new CommandError("That member doesn't hold any KUSH staff role.");
      // Only the owner removes administrators.
      if (held.includes("administrator") && !context.actor.isGuildOwner)
        throw new CommandError(
          "Only the server owner can offboard an administrator.",
        );

      // Record first (hands open work back), then the shared Discord half.
      const record = await context.services.api
        .offboard(targetId, reason, context.actor.userId)
        .catch((error: unknown) => {
          context.services.log.error("offboard.record.failed", {
            error: error instanceof Error ? error.message : "unknown",
          });
          return null;
        });
      const { notified } = await offboardInDiscord(
        gateway,
        context.services.config,
        {
          discordUserId: targetId,
          reason,
          byDiscordUserId: context.actor.userId,
          via: "discord",
          record,
        },
      );
      await context.reply({
        content: `📤 <@${targetId}> offboarded (${held.join(", ")} removed).${notified ? " They were told by DM." : " Their DMs are closed."}${record && !record.recorded ? " They had no website staff record." : ""}`,
      });
    },
  },
  {
    path: ["report"],
    group: "Community",
    authority: "member",
    allowRestricted: true,
    summary: "Privately report a member or message to the moderators",
    usage: "!report <@member | user ID | message link> <what happened>",
    options: [
      {
        name: "arguments",
        description: "Who or which message, then what happened",
        required: true,
      },
    ],
    run: async (context) => {
      // Reports are private: remove the public trigger message first.
      await context.deleteTrigger?.().catch(() => undefined);
      const [subject, ...rest] = context.args;
      const details = rest.join(" ").trim();
      const user = userIdFrom(subject);
      const link =
        subject &&
        /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/\d+\/\d+\/\d+$/.test(
          subject,
        )
          ? subject
          : null;
      if ((!user && !link) || details.length < 5)
        throw new CommandError(
          "Usage: `!report <@member | user ID | message link> <what happened>`. Reports go only to moderators.",
        );
      const created = await context.services.api.create({
        discordUserId: context.actor.userId,
        guildId: context.guildId,
        interactionId: `report:${context.actor.userId}:${context.services.now()}`,
        category: "member-report",
        description: [
          user
            ? `Reported member: <@${user}> (${user})`
            : `Reported message: ${link}`,
          `Reported from: <#${context.channelId}>`,
          "",
          details.slice(0, 1_800),
        ].join("\n"),
      });
      const channelId = await context.services.tickets.open({
        ticket: created.ticket,
        queue: created.queue,
        creatorId: context.actor.userId,
        existingChannelId: created.channel?.channel_id ?? null,
      });
      await context.replyPrivately({
        content: `🚩 Thanks, your report (${created.reference}) is with the moderators in <#${channelId}>. Only you and the moderators can see it.`,
      });
      if (context.source === "prefix")
        await context.reply({
          content: "🚩 Report sent privately to the moderators.",
        });
    },
  },
  {
    path: ["downloads"],
    group: "Customers",
    authority: "member",
    summary: "What you own, and where to download it (sent privately)",
    usage: "!downloads",
    run: async (context) => {
      const site = process.env.KUSH_PUBLIC_SITE_URL;
      const where = site
        ? `${site}/account/downloads`
        : "your KUSH account → Downloads";
      const owned = await context.services.api.memberEntitlements(
        context.actor.userId,
      );
      if (!owned.linked) {
        await context.replyPrivately({
          content:
            "Your Discord isn't linked to a KUSH account yet. Type `!account` to link it, then try again.",
        });
        return;
      }
      const active = owned.entitlements.filter(
        (item) => item.status === "active",
      );
      // Files are only served from the website: links there are signed,
      // expire in minutes, and re-check that you still own the product.
      await context.replyPrivately({
        embeds: [
          card({
            emoji: "⬇️",
            title: "Your downloads",
            tone: active.length ? "success" : "info",
            description: active.length
              ? [
                  ...active.map(
                    (item) =>
                      `• **${item.productName}**${item.expiresAt ? ` (until <t:${Math.floor(Date.parse(item.expiresAt) / 1_000)}:d>)` : ""}`,
                  ),
                  "",
                  `Download them from ${where}. Links there are signed and expire after a few minutes, for your security.`,
                ].join("\n")
              : `You don't own any KUSH products yet. Anything you buy shows up here and in ${where}.`,
            timestamp: true,
          }),
        ],
      });
      if (context.source === "prefix")
        await context.reply({
          content: "I've sent your downloads to you privately.",
        });
    },
  },
];
