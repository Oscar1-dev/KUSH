import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { onboardingButton } from "./runtime/components.js";

export const kushColours = {
  green: 0x22c55e,
  purple: 0x7c3aed,
  obsidian: 0x111318,
  warning: 0xf59e0b,
} as const;

export const embed = (title: string, description: string) =>
  new EmbedBuilder()
    .setColor(kushColours.green)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "KUSH · Software, development and creative services" });

/** Public persistent button IDs (not user-scoped; the clicker is the actor). */
export const PUBLIC_TICKET_BUTTON = "ticket:open";
export const publicApplyButton = (programme: "seller" | "reseller") =>
  `partner:apply:${programme}`;

export function welcomePanel() {
  return {
    embeds: [
      embed(
        "Welcome to KUSH",
        "The community and support hub for KUSH software, commissioned development and creative services. Read #rules and accept them to join the community, then see #getting-started. Type `!help` for commands.",
      ),
    ],
    components: [],
  };
}

export const rulesText = [
  "1. Be respectful. No harassment, hate speech or personal attacks.",
  "2. No spam, unsolicited advertising or self-promotion outside the channels that allow it.",
  "3. Do not impersonate KUSH staff or other members.",
  "4. Never share malicious links, pirated software, licence keys or other people's private information.",
  "5. Keep support requests in private tickets, not public channels.",
  "6. KUSH provides digital software and creative services; unlawful goods and activity are not permitted.",
  "Breaking the rules can lead to restriction, a timeout or removal.",
].join("\n");

export function rulesPanel(withAcceptButton = false) {
  return {
    embeds: [embed("Community rules", rulesText)],
    components: withAcceptButton ? [onboardingButton()] : [],
  };
}

export function supportPanel() {
  return {
    embeds: [
      embed(
        "KUSH support",
        "Open a private ticket for product support, purchases, installation, technical problems, bugs, billing, commissions, partnerships or anything else. Only you and authorised staff can see it. You can also type `!ticket`.",
      ),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(PUBLIC_TICKET_BUTTON)
          .setLabel("Open a private ticket")
          .setStyle(ButtonStyle.Primary),
      ),
    ],
  };
}

export function partnerPanel() {
  return {
    embeds: [
      embed(
        "KUSH partner programmes",
        [
          "**Approved sellers** list their own digital products through KUSH once the marketplace opens.",
          "**Verified resellers** resell KUSH products under an agreed reseller agreement.",
          "**Creative partners** collaborate on commissioned creative work by invitation.",
          "",
          "Applications are private and reviewed by KUSH. Applying does not create an agreement, and no payments or payouts are handled in Discord. You need a linked KUSH account (`!account`) to apply.",
        ].join("\n"),
      ),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...(["seller", "reseller"] as const).map((programme) =>
          new ButtonBuilder()
            .setCustomId(publicApplyButton(programme))
            .setLabel(`Apply as ${programme}`)
            .setStyle(ButtonStyle.Secondary),
        ),
      ),
    ],
  };
}

export function unavailablePanel(area: string, reason?: string) {
  return {
    embeds: [
      embed(
        `${area} unavailable`,
        reason ??
          "This workflow has not been connected to the KUSH backend yet. No request or record was created.",
      ).setColor(kushColours.warning),
    ],
  };
}
