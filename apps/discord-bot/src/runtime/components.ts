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
  | "apply-modal"
  | "commission-service"
  | "commission-modal";

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

/** The services a commission can be for (the API's intake categories). */
export interface CommissionChoice {
  category: string;
  label: string;
  hint: string | null;
}

export const fallbackCommissionChoices: CommissionChoice[] = [
  { category: "websites", label: "Websites", hint: null },
  { category: "web-apps", label: "Web apps", hint: null },
  { category: "discord", label: "Discord bots & servers", hint: null },
  { category: "software", label: "Software & tools", hint: null },
  { category: "gaming", label: "Gaming & Rust", hint: null },
  { category: "technical", label: "Technical help", hint: null },
  { category: "creative", label: "Creative & design", hint: null },
  { category: "automation", label: "Automation", hint: null },
];

export const commissionServiceMenu = (
  signer: Signer,
  userId: string,
  choices: readonly CommissionChoice[],
) =>
  row(
    new StringSelectMenuBuilder()
      .setCustomId(scopedId(signer, "commission-service", userId))
      .setPlaceholder("What should KUSH build for you?")
      .addOptions(
        choices.slice(0, 25).map((choice) => ({
          label: choice.label.slice(0, 100),
          value: choice.category,
          ...(choice.hint ? { description: choice.hint.slice(0, 100) } : {}),
        })),
      ),
  );

export const commissionModal = (
  signer: Signer,
  userId: string,
  category: string,
  label: string,
) =>
  new ModalBuilder()
    .setCustomId(scopedId(signer, "commission-modal", userId, category))
    .setTitle(`Commission: ${label}`.slice(0, 45))
    .addComponents(
      row(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("Project name")
          .setPlaceholder("e.g. Booking site for my barbershop")
          .setStyle(TextInputStyle.Short)
          .setMinLength(3)
          .setMaxLength(200)
          .setRequired(true),
      ),
      row(
        new TextInputBuilder()
          .setCustomId("details")
          .setLabel("What do you need?")
          .setPlaceholder(
            "Pages or features, who it's for, anything it must work with.",
          )
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(20)
          .setMaxLength(4000)
          .setRequired(true),
      ),
      row(
        new TextInputBuilder()
          .setCustomId("budget")
          .setLabel("Rough budget (optional)")
          .setPlaceholder("e.g. around £100")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(120)
          .setRequired(false),
      ),
      row(
        new TextInputBuilder()
          .setCustomId("timeframe")
          .setLabel("When do you need it? (optional)")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(200)
          .setRequired(false),
      ),
      row(
        new TextInputBuilder()
          .setCustomId("references")
          .setLabel("Examples or links you like (optional)")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(2000)
          .setRequired(false),
      ),
    );

/** Opens Stripe Checkout in the browser; KUSH never sees card details. */
export const payButton = (url: string, label = "Pay securely with Stripe") =>
  row(
    new ButtonBuilder().setURL(url).setLabel(label).setStyle(ButtonStyle.Link),
  );
