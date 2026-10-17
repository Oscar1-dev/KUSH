import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { createComponentId } from "../component-id.js";
import { ticketCategories } from "../tickets/categories.js";

/** Signed, user-scoped, expiring component actions. */
export type ScopedAction =
  | "ticket-start"
  | "ticket-category"
  | "ticket-modal"
  | "link-modal"
  | "apply-modal";

const TEN_MINUTES = 10 * 60_000;

export interface Signer {
  secret: string;
  now: number;
}

/** `subject` binds the component to one Discord user; `data` is an optional parameter. */
export const scopedId = (
  signer: Signer,
  action: ScopedAction,
  userId: string,
  data = "",
) =>
  createComponentId(
    {
      action: data ? `${action}:${data}` : action,
      subject: userId,
      expiresAt: signer.now + TEN_MINUTES,
    },
    signer.secret,
  );

export const ONBOARDING_ACCEPT = "onboarding:accept";

const row = <
  T extends ButtonBuilder | StringSelectMenuBuilder | TextInputBuilder,
>(
  ...items: T[]
) => new ActionRowBuilder<T>().addComponents(...items);

export const ticketButton = (signer: Signer, userId: string) =>
  row(
    new ButtonBuilder()
      .setCustomId(scopedId(signer, "ticket-start", userId))
      .setLabel("Open a private ticket")
      .setStyle(ButtonStyle.Primary),
  );

export const linkButton = (signer: Signer, userId: string) =>
  row(
    new ButtonBuilder()
      .setCustomId(scopedId(signer, "link-modal", userId))
      .setLabel("Enter KUSH link code")
      .setStyle(ButtonStyle.Primary),
  );

export const applyButtons = (
  signer: Signer,
  userId: string,
  programmes: readonly ("seller" | "reseller")[],
) =>
  row(
    ...programmes.map((programme) =>
      new ButtonBuilder()
        .setCustomId(scopedId(signer, "apply-modal", userId, programme))
        .setLabel(`Apply: ${programme}`)
        .setStyle(ButtonStyle.Secondary),
    ),
  );

export const ticketCategoryMenu = (signer: Signer, userId: string) =>
  row(
    new StringSelectMenuBuilder()
      .setCustomId(scopedId(signer, "ticket-category", userId))
      .setPlaceholder("What do you need help with?")
      .addOptions(
        ticketCategories.map((category) => ({
          label: category.label,
          value: category.key,
        })),
      ),
  );

export const ticketModal = (
  signer: Signer,
  userId: string,
  categoryKey: string,
  categoryLabel: string,
) =>
  new ModalBuilder()
    .setCustomId(scopedId(signer, "ticket-modal", userId, categoryKey))
    .setTitle(`Ticket: ${categoryLabel}`.slice(0, 45))
    .addComponents(
      row(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Describe the issue or request")
          .setPlaceholder(
            "Product or service, what happened, and what you expected.",
          )
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(10)
          .setMaxLength(2000)
          .setRequired(true),
      ),
    );

export const linkModal = (signer: Signer, userId: string) =>
  new ModalBuilder()
    .setCustomId(scopedId(signer, "link-modal", userId))
    .setTitle("Link your KUSH account")
    .addComponents(
      row(
        new TextInputBuilder()
          .setCustomId("code")
          .setLabel("16-character KUSH link code")
          .setPlaceholder("Generate this in your KUSH account first")
          .setStyle(TextInputStyle.Short)
          .setMinLength(16)
          .setMaxLength(16)
          .setRequired(true),
      ),
    );

export const applicationModal = (
  signer: Signer,
  userId: string,
  programme: "seller" | "reseller",
) =>
  new ModalBuilder()
    .setCustomId(scopedId(signer, "apply-modal", userId, programme))
    .setTitle(`KUSH ${programme} application`)
    .addComponents(
      row(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("Business or trading name")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(200)
          .setRequired(true),
      ),
      row(
        new TextInputBuilder()
          .setCustomId("details")
          .setLabel(
            programme === "seller"
              ? "What would you sell? (digital products only)"
              : "Where and how would you resell KUSH products?",
          )
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(20)
          .setMaxLength(4000)
          .setRequired(true),
      ),
      row(
        new TextInputBuilder()
          .setCustomId("url")
          .setLabel("Website or portfolio URL (optional)")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(2000)
          .setRequired(false),
      ),
    );

export const onboardingButton = () =>
  row(
    new ButtonBuilder()
      .setCustomId(ONBOARDING_ACCEPT)
      .setLabel("I have read and accept the rules")
      .setStyle(ButtonStyle.Success),
  );
