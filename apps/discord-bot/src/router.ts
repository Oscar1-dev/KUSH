import {
  ActionRowBuilder,
  type Interaction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { createComponentId, verifyComponentId } from "./component-id.js";
import {
  rolePanel,
  supportPanel,
  unavailablePanel,
  welcomePanel,
} from "./panels.js";

export interface TicketGateway {
  create(input: {
    discordUserId: string;
    guildId: string;
    interactionId: string;
    category: string;
    description: string;
  }): Promise<{ reference: string }>;
}
export interface LinkingGateway {
  complete(input: {
    code: string;
    discordUserId: string;
    guildId: string;
  }): Promise<void>;
}

export interface RouterDependencies {
  componentSecret: string;
  tickets: TicketGateway;
  linking: LinkingGateway;
  now?: () => number;
}

function ticketModal(userId: string, secret: string, now: number) {
  const id = createComponentId(
    { action: "ticket-create", subject: userId, expiresAt: now + 10 * 60_000 },
    secret,
  );
  const category = new TextInputBuilder()
    .setCustomId("category")
    .setLabel("Support category")
    .setPlaceholder(
      "Product, commission, order, billing, technical, partner or general",
    )
    .setStyle(TextInputStyle.Short)
    .setMaxLength(80)
    .setRequired(true);
  const description = new TextInputBuilder()
    .setCustomId("description")
    .setLabel("How can we help?")
    .setPlaceholder(
      "Include the relevant product or service and what happened.",
    )
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(10)
    .setMaxLength(2000)
    .setRequired(true);
  return new ModalBuilder()
    .setCustomId(id)
    .setTitle("Open KUSH support request")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(category),
      new ActionRowBuilder<TextInputBuilder>().addComponents(description),
    );
}

function linkingModal(userId: string, secret: string, now: number) {
  const id = createComponentId(
    { action: "account-link", subject: userId, expiresAt: now + 10 * 60_000 },
    secret,
  );
  const code = new TextInputBuilder()
    .setCustomId("code")
    .setLabel("16-character KUSH link code")
    .setPlaceholder("Generate this code in KUSH Developer first")
    .setStyle(TextInputStyle.Short)
    .setMinLength(16)
    .setMaxLength(16)
    .setRequired(true);
  return new ModalBuilder()
    .setCustomId(id)
    .setTitle("Link KUSH support account")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(code),
    );
}

export async function routeInteraction(
  interaction: Interaction,
  dependencies: RouterDependencies,
): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      if (
        ["help", "about", "services", "products", "status", "faq"].includes(
          interaction.commandName,
        )
      ) {
        await interaction.reply({ ...welcomePanel(), ephemeral: true });
        return;
      }
      if (interaction.commandName === "roles") {
        await interaction.reply({ ...rolePanel(), ephemeral: true });
        return;
      }
      if (interaction.commandName === "profile") {
        await interaction.showModal(
          linkingModal(
            interaction.user.id,
            dependencies.componentSecret,
            (dependencies.now ?? Date.now)(),
          ),
        );
        return;
      }
      if (
        interaction.commandName === "ticket" &&
        interaction.options.getSubcommand() === "open"
      ) {
        await interaction.showModal(
          ticketModal(
            interaction.user.id,
            dependencies.componentSecret,
            (dependencies.now ?? Date.now)(),
          ),
        );
        return;
      }
      await interaction.reply(unavailablePanel(interaction.commandName));
      return;
    }

    if (interaction.isButton() && interaction.customId === "ticket:open") {
      await interaction.showModal(
        ticketModal(
          interaction.user.id,
          dependencies.componentSecret,
          (dependencies.now ?? Date.now)(),
        ),
      );
      return;
    }

    if (interaction.isModalSubmit()) {
      const payload = verifyComponentId(
        interaction.customId,
        dependencies.componentSecret,
        (dependencies.now ?? Date.now)(),
      );
      if (
        !payload ||
        payload.subject !== interaction.user.id ||
        !interaction.guildId
      ) {
        await interaction.reply({
          content:
            "This form is invalid or expired. Open a fresh support form and try again.",
          ephemeral: true,
        });
        return;
      }
      if (payload.action === "account-link") {
        await interaction.deferReply({ ephemeral: true });
        await dependencies.linking.complete({
          code: interaction.fields
            .getTextInputValue("code")
            .trim()
            .toUpperCase(),
          discordUserId: interaction.user.id,
          guildId: interaction.guildId,
        });
        await interaction.editReply({
          content:
            "Your Discord identity is now linked to your KUSH support account.",
        });
        return;
      }
      if (payload.action !== "ticket-create") {
        await interaction.reply({
          content:
            "This form is invalid or expired. Open a fresh form and try again.",
          ephemeral: true,
        });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      const created = await dependencies.tickets.create({
        discordUserId: interaction.user.id,
        guildId: interaction.guildId,
        interactionId: interaction.id,
        category: interaction.fields.getTextInputValue("category").trim(),
        description: interaction.fields.getTextInputValue("description").trim(),
      });
      await interaction.editReply({
        content: `Support request ${created.reference} was created. Keep this reference for follow-up.`,
      });
    }
  } catch (error) {
    console.error("Discord interaction failed", {
      interactionId: interaction.id,
      kind: interaction.type,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    const response = {
      content:
        "KUSH could not complete that request. Nothing sensitive was published. Please try again later.",
      ephemeral: true,
    } as const;
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred)
        await interaction.followUp(response);
      else await interaction.reply(response);
    }
  }
}

export { supportPanel };
