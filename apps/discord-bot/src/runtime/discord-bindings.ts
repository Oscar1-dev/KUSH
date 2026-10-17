import {
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type Interaction,
  type Message,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { isTransient, retryInBackground } from "./retry.js";
import { ApiError, requestUuid } from "../api-client.js";
import {
  HONEYPOT_CHANNEL_KEY,
  HoneypotTracker,
  handleHoneypotMessage,
} from "../moderation/honeypot.js";
import { roles as blueprintRoles } from "../blueprint.js";
import { ARGUMENTS_OPTION, slashOptions } from "../commands.js";
import { verifyComponentId } from "../component-id.js";
import { RULES_VERSION } from "../automation/membership.js";
import { PUBLIC_COMMISSION_BUTTON } from "../content/channel-content.js";
import { PUBLIC_TICKET_BUTTON } from "../panels.js";
import { ticketCategory } from "../tickets/categories.js";
import { roleKeysFor, type Actor } from "./authority.js";
import type { BotReply, BotServices, CommandRouter } from "./command.js";
import {
  ONBOARDING_ACCEPT,
  applicationModal,
  linkModal,
  ticketCategoryMenu,
  ticketModal,
} from "./components.js";
import { tokenise } from "./prefix.js";

export interface BindingDependencies {
  router: CommandRouter;
  services: BotServices;
  honeypot: HoneypotTracker;
}

const roleKeys = blueprintRoles.map((role) => role.key);

export function actorFromMember(
  member: Pick<GuildMember, "id" | "displayName"> & {
    roles: { cache: { keys(): Iterable<string> } };
    guild: { ownerId: string };
  },
  roleIds: Record<string, string>,
): Actor {
  return {
    userId: member.id,
    displayName: member.displayName,
    roles: roleKeysFor(member.roles.cache.keys(), roleIds, roleKeys),
    isGuildOwner: member.guild.ownerId === member.id,
  };
}

// Never let bot output ping anyone except the person it is replying to.
const mentionsFor = (userId: string) =>
  ({ parse: [], users: [userId] }) as const;

// ------------------------------------------------------------ prefix (!)

export async function handleMessage(
  message: Message,
  { router, services, honeypot }: BindingDependencies,
): Promise<void> {
  if (message.author.bot || message.webhookId || !message.inGuild()) return;
  if (message.guildId !== services.config.guildId) return;
  if (message.channelId === services.config.channelIds[HONEYPOT_CHANNEL_KEY]) {
    const member =
      message.member ?? (await message.guild.members.fetch(message.author.id));
    await handleHoneypotMessage(
      message,
      member,
      actorFromMember(member, services.config.roleIds),
      services,
      honeypot,
    );
    return;
  }
  const tokens = tokenise(message.content);
  if (!tokens) {
    // Application channels are recorded on the application, not a ticket.
    const recorded = await services.applications?.mirror({
      channelId: message.channelId,
      authorId: message.author.id,
      id: message.id,
      content: message.content,
      attachments: message.attachments.map((file) => file.name),
    });
    if (!recorded) await mirrorTicketMessage(message, services);
    return;
  }
  const resolved = router.resolve(tokens);
  if (!resolved) return; // Unknown `!word`: stay silent to avoid noise.

  const member =
    message.member ?? (await message.guild.members.fetch(message.author.id));
  const actor = actorFromMember(member, services.config.roleIds);
  await router.dispatch(resolved.command, {
    source: "prefix",
    actor,
    guildId: message.guildId,
    channelId: message.channelId,
    args: resolved.args,
    services,
    deleteTrigger: async () => {
      await message.delete();
    },
    reply: async (reply: BotReply) => {
      await message.reply({
        ...reply,
        allowedMentions: { ...mentionsFor(actor.userId), repliedUser: false },
        // The trigger may have been deleted (e.g. !note); still answer.
        failIfNotExists: false,
      });
    },
    replyPrivately: async (reply: BotReply) => {
      try {
        await message.author.send({ ...reply, allowedMentions: { parse: [] } });
        return "dm";
      } catch {
        return "unavailable";
      }
    },
  });
}

// ------------------------------------------------- ticket message mirror

const unrecordedWarned = new Set<string>();

/**
 * Persists a message typed in a private ticket channel as a ticket reply,
 * authored by the matching KUSH identity. The backend decides whether the
 * author may reply; refusals are explained once per member and channel.
 */
export async function mirrorTicketMessage(
  message: Message<true>,
  services: BotServices,
): Promise<void> {
  if (!services.tickets.channels.has(message.channelId)) return;
  const content = [
    message.content,
    ...message.attachments.map((file) => `[attachment: ${file.name}]`),
  ]
    .join("\n")
    .trim();
  if (!content) return;
  const actor = { discordUserId: message.author.id };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const ticket = await services.api.ticketByChannel(
        actor,
        message.channelId,
      );
      await services.api.message(actor, ticket.id, {
        requestId: requestUuid(`message:${message.id}`),
        expectedVersion: ticket.version,
        kind: "reply",
        content: content.slice(0, 10_000),
      });
      return;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && attempt === 0)
        continue;
      const key = `${message.channelId}:${message.author.id}`;
      if (
        error instanceof ApiError &&
        [403, 404].includes(error.status) &&
        !unrecordedWarned.has(key)
      ) {
        unrecordedWarned.add(key);
        await message
          .reply({
            content:
              "This message was not added to the ticket record: your Discord account is not linked to a KUSH staff account with access to this ticket.",
            allowedMentions: { parse: [], repliedUser: false },
          })
          .catch(() => undefined);
      }
      services.log.warn("ticket.mirror.failed", {
        channelId: message.channelId,
        status: error instanceof ApiError ? error.status : "error",
      });
      // The request ID is derived from the Discord message, so retrying an
      // API outage can never record the message twice.
      if (isTransient(error))
        retryInBackground(
          async () => {
            const ticket = await services.api.ticketByChannel(
              actor,
              message.channelId,
            );
            await services.api.message(actor, ticket.id, {
              requestId: requestUuid(`message:${message.id}`),
              expectedVersion: ticket.version,
              kind: "reply",
              content: content.slice(0, 10_000),
            });
            services.log.info("ticket.mirror.recovered", {
              channelId: message.channelId,
            });
          },
          (final) =>
            services.log.error("ticket.mirror.lost", {
              channelId: message.channelId,
              messageId: message.id,
              status: final instanceof ApiError ? final.status : "error",
            }),
        );
      return;
    }
  }
}

// ----------------------------------------------------------- interactions

const ephemeral = (reply: BotReply) => ({
  ...reply,
  flags: MessageFlags.Ephemeral as const,
  allowedMentions: { parse: [] },
});

async function respond(
  interaction:
    | ChatInputCommandInteraction
    | ButtonInteraction
    | StringSelectMenuInteraction
    | ModalSubmitInteraction,
  reply: BotReply,
) {
  if (interaction.deferred) await interaction.editReply(reply);
  else if (interaction.replied) await interaction.followUp(ephemeral(reply));
  else await interaction.reply(ephemeral(reply));
}

async function handleSlash(
  interaction: ChatInputCommandInteraction,
  { router, services }: BindingDependencies,
) {
  const sub = interaction.options.getSubcommand(false);
  const path = sub ? [interaction.commandName, sub] : [interaction.commandName];
  const command = router.commands.find(
    (item) => item.path.join(" ") === path.join(" "),
  );
  if (!command || !interaction.inCachedGuild()) {
    await respond(interaction, {
      content: "That command is not available here.",
    });
    return;
  }
  const options = slashOptions(command);
  const args =
    options.length === 1 && options[0]!.name === ARGUMENTS_OPTION
      ? (tokenise(
          `!${interaction.options.getString(ARGUMENTS_OPTION) ?? ""}`.trimEnd(),
        ) ?? [])
      : options
          .map((option) => interaction.options.getString(option.name))
          .filter((value): value is string => Boolean(value));
  const actor = actorFromMember(interaction.member, services.config.roleIds);
  await router.dispatch(command, {
    source: "slash",
    actor,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    args,
    services,
    reply: (reply) => respond(interaction, reply),
    replyPrivately: async (reply) => {
      await respond(interaction, reply);
      return "ephemeral";
    },
  });
}

/** Verifies a signed component and that the clicker is its subject. */
function scoped(
  interaction:
    ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
  services: BotServices,
): { action: string; data: string } | null {
  const payload = verifyComponentId(
    interaction.customId,
    services.componentSecret,
    services.now(),
  );
  if (!payload || payload.subject !== interaction.user.id) return null;
  const [action, ...rest] = payload.action.split(":");
  return { action: action!, data: rest.join(":") };
}

const signerFor = (services: BotServices) => ({
  secret: services.componentSecret,
  now: services.now(),
});

const friendlyApiError = (error: unknown): string | null => {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 404 || error.status === 403)
    return "Your Discord account is not linked to a KUSH account with access yet. Type `!account` to link it, then try again.";
  if (error.status === 409)
    return "That request conflicts with a newer change. Please start again.";
  if (error.status === 429)
    return "Too many attempts. Please wait a few minutes and try again.";
  if (error.status === 400)
    return `KUSH rejected the request: ${error.message}`;
  return null;
};

async function handleComponent(
  interaction:
    ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
  { services }: BindingDependencies,
) {
  const userId = interaction.user.id;
  const guildId = interaction.guildId;
  if (!guildId || guildId !== services.config.guildId) return;

  // Public persistent panel buttons: the clicker is the actor.
  if (interaction.isButton()) {
    if (interaction.customId === PUBLIC_TICKET_BUTTON) {
      await respond(interaction, {
        content: "Choose the category that fits best.",
        components: [ticketCategoryMenu(signerFor(services), userId)],
      });
      return;
    }
    const publicApply = /^partner:apply:(seller|reseller)$/.exec(
      interaction.customId,
    )?.[1];
    if (publicApply) {
      await interaction.showModal(
        applicationModal(
          signerFor(services),
          userId,
          publicApply as "seller" | "reseller",
        ),
      );
      return;
    }
    if (interaction.customId === PUBLIC_COMMISSION_BUTTON) {
      const category = ticketCategory("commission")!;
      await interaction.showModal(
        ticketModal(signerFor(services), userId, category.key, category.label),
      );
      return;
    }
    if (interaction.customId === ONBOARDING_ACCEPT) {
      await acceptRules(interaction, services);
      return;
    }
  }

  const verified = scoped(interaction, services);
  if (!verified) {
    await respond(interaction, {
      content:
        "This control has expired or belongs to someone else. Type the command again to get your own.",
    });
    return;
  }

  switch (verified.action) {
    case "ticket-start":
      await respond(interaction, {
        content: "Choose the category that fits best.",
        components: [ticketCategoryMenu(signerFor(services), userId)],
      });
      return;
    case "ticket-category": {
      if (!interaction.isStringSelectMenu()) return;
      const category = ticketCategory(interaction.values[0] ?? "");
      if (!category) return;
      await interaction.showModal(
        ticketModal(signerFor(services), userId, category.key, category.label),
      );
      return;
    }
    case "link-modal":
      if (interaction.isButton()) {
        await interaction.showModal(linkModal(signerFor(services), userId));
        return;
      }
      if (interaction.isModalSubmit()) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await services.api.complete({
          code: interaction.fields
            .getTextInputValue("code")
            .trim()
            .toUpperCase(),
          discordUserId: userId,
          guildId,
        });
        services.audit({
          action: "account.link",
          actorId: userId,
          outcome: "ok",
        });
        await respond(interaction, {
          content: "Your Discord account is now linked to your KUSH account.",
        });
      }
      return;
    case "apply-modal": {
      const programme = verified.data === "reseller" ? "reseller" : "seller";
      if (interaction.isButton()) {
        await interaction.showModal(
          applicationModal(signerFor(services), userId, programme),
        );
        return;
      }
      if (!interaction.isModalSubmit()) return;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const url = interaction.fields.getTextInputValue("url").trim();
      if (url && !/^https:\/\/\S+$/i.test(url)) {
        await respond(interaction, {
          content: "The URL must start with https:// — please apply again.",
        });
        return;
      }
      const created = await services.api.submitApplication({
        discordUserId: userId,
        guildId,
        interactionId: interaction.id,
        programme,
        title: interaction.fields.getTextInputValue("title").trim(),
        details: interaction.fields.getTextInputValue("details").trim(),
        url: url || null,
      });
      services.audit({
        action: `partner.apply.${programme}`,
        actorId: userId,
        outcome: "ok",
      });
      await respond(interaction, {
        content: `Your ${programme} application was received (status: ${created.status}). KUSH will review it privately; applying does not create an agreement.`,
      });
      return;
    }
    case "ticket-modal": {
      if (!interaction.isModalSubmit()) return;
      const category = ticketCategory(verified.data);
      if (!category) return;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const created = await services.api.create({
        discordUserId: userId,
        guildId,
        interactionId: interaction.id,
        category: category.key,
        description: interaction.fields.getTextInputValue("description").trim(),
      });
      const channelId = await services.tickets.open({
        ticket: created.ticket,
        queue: created.queue,
        creatorId: userId,
        existingChannelId: created.channel?.channel_id ?? null,
      });
      services.audit({
        action: `ticket.created.${created.queue}`,
        actorId: userId,
        outcome: "ok",
        detail: { ticket: created.ticket.number },
      });
      await respond(interaction, {
        content: `Ticket ${created.reference} (${category.label}) is open in <#${channelId}>. Only you and authorised ${created.queue === "reports" ? "moderators" : "staff"} can see it.`,
      });
      return;
    }
    default:
      await respond(interaction, {
        content: "This control is no longer supported.",
      });
  }
}

async function acceptRules(
  interaction: ButtonInteraction,
  services: BotServices,
) {
  const memberRoleId = services.config.roleIds.member;
  if (!memberRoleId || !interaction.inCachedGuild()) {
    await respond(interaction, {
      content: "Membership is not configured yet. Please try again later.",
    });
    return;
  }
  if (interaction.member.roles.cache.has(memberRoleId)) {
    await respond(interaction, {
      content: "You have already accepted the rules.",
    });
    return;
  }
  // The database is the source of truth: record acceptance first, so a
  // later rejoin restores Member automatically.
  await services.api.acceptRules(interaction.user.id, RULES_VERSION);
  await interaction.member.roles.add(
    memberRoleId,
    "Accepted the community rules",
  );
  services.kickRoleSync?.();
  services.audit({
    action: "onboarding.accept",
    actorId: interaction.user.id,
    outcome: "ok",
  });
  await respond(interaction, {
    content: "Welcome! You can now take part in the community channels.",
  });
}

export async function handleInteraction(
  interaction: Interaction,
  dependencies: BindingDependencies,
): Promise<void> {
  try {
    if (interaction.isChatInputCommand())
      await handleSlash(interaction, dependencies);
    else if (
      interaction.isButton() ||
      interaction.isStringSelectMenu() ||
      interaction.isModalSubmit()
    )
      await handleComponent(interaction, dependencies);
  } catch (error) {
    const friendly = friendlyApiError(error);
    if (!friendly)
      dependencies.services.log.error("interaction.failed", {
        interactionId: interaction.id,
        type: interaction.type,
        error: error instanceof Error ? error.message : "unknown",
      });
    if (interaction.isRepliable())
      await respond(interaction as ButtonInteraction, {
        content:
          friendly ??
          "KUSH could not complete that request. Nothing private was posted. Please try again later.",
      }).catch(() => undefined);
  }
}
