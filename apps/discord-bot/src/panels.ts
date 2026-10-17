import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from "discord.js";

export const kushColours = {
  green: 0x22c55e,
  purple: 0x7c3aed,
  obsidian: 0x111318,
  warning: 0xf59e0b,
} as const;

const embed = (title: string, description: string) =>
  new EmbedBuilder()
    .setColor(kushColours.green)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "KUSH · Software, development and creative services" });

export function welcomePanel() {
  return {
    embeds: [
      embed(
        "Welcome to KUSH",
        "The community and business hub for KUSH software, commissioned development, marketplace partners and customer support. Start with the rules and getting-started channels.",
      ),
    ],
    components: [],
  };
}

export function rulesPanel() {
  return {
    embeds: [
      embed(
        "Community rules",
        "Be respectful. Do not spam, impersonate staff, share malicious links, disclose private customer information or advertise without approval. KUSH provides digital software and creative services; prohibited goods and unlawful activity are not permitted.",
      ),
    ],
    components: [],
  };
}

export function supportPanel() {
  const button = new ButtonBuilder()
    .setCustomId("ticket:open")
    .setLabel("Open a support request")
    .setStyle(ButtonStyle.Primary);
  return {
    embeds: [
      embed(
        "KUSH support centre",
        "Open a private request for product support, commissions, orders, billing, technical problems, partnerships or general assistance. Your request is visible only to you and authorised staff.",
      ),
    ],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
  };
}

export function rolePanel() {
  const select = new StringSelectMenuBuilder()
    .setCustomId("roles:notifications")
    .setPlaceholder("Choose notification roles")
    .setMinValues(0)
    .setMaxValues(5)
    .addOptions(
      {
        label: "Product Updates",
        value: "product-updates",
        description: "Product releases and updates",
      },
      {
        label: "Announcements",
        value: "announcements",
        description: "Important KUSH announcements",
      },
      {
        label: "Development Updates",
        value: "development-updates",
        description: "Development progress",
      },
      {
        label: "Marketplace Updates",
        value: "marketplace-updates",
        description: "Approved marketplace news",
      },
      {
        label: "Community Events",
        value: "community-events",
        description: "Community event notices",
      },
    );
  return {
    embeds: [
      embed(
        "Notification roles",
        "Choose only the updates you want. These roles do not grant customer, seller, partner or staff access.",
      ),
    ],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    ],
  };
}

export function unavailablePanel(area: string) {
  return {
    embeds: [
      embed(
        `${area} unavailable`,
        "This workflow has not been connected to an authoritative KUSH backend yet. No request or record was created.",
      ).setColor(kushColours.warning),
    ],
    ephemeral: true,
  };
}
