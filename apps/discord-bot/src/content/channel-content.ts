import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type EmbedBuilder,
} from "discord.js";
import {
  embed,
  kushColours,
  rulesText,
  PUBLIC_TICKET_BUTTON,
} from "../panels.js";
import { onboardingButton } from "../runtime/components.js";
import type { BotReply } from "../runtime/command.js";

/**
 * Official KUSH channel content. Each entry is one persistent bot message,
 * identified by a stable `id` so republishing edits it instead of posting a
 * duplicate. Every button here is handled in runtime/discord-bindings.ts.
 *
 * Content rules: describe only what exists. Features that are not live are
 * labelled "not available yet"; no prices, products, customers or
 * guarantees are invented.
 */
export interface ChannelMessage {
  id: string;
  /** v2 channel key; legacy keys let the content reach v1 channels too. */
  channelKey: string;
  legacyChannelKeys?: string[];
  pin: boolean;
  build(): BotReply;
}

/** Public persistent button: opens a commission ticket for the clicker. */
export const PUBLIC_COMMISSION_BUTTON = "ticket:open:commission";

const page = (...embeds: EmbedBuilder[]): BotReply => ({
  embeds,
  components: [],
});

const ticketRow = (label = "Open a private ticket") =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(PUBLIC_TICKET_BUTTON)
      .setLabel(label)
      .setStyle(ButtonStyle.Primary),
  );

const notYet = (feature: string) => `_${feature} — not available yet._`;

export const channelContent: ChannelMessage[] = [
  // ------------------------------------------------------------ information
  {
    id: "welcome.main",
    channelKey: "information:welcome",
    legacyChannelKeys: ["01-start-here:welcome"],
    pin: true,
    build: () =>
      page(
        embed(
          "Welcome to KUSH",
          [
            "KUSH is an independent software studio: websites, custom software and creative services, with support for everything we build.",
            "",
            "**Start here**",
            "1. Read the rules and press **I have read and accept the rules** to join the community.",
            "2. See getting-started for how this server works.",
            "3. Need help? Open a private ticket in create-ticket or type `!ticket`.",
            "",
            "Type `!help` at any time to see the commands available to you.",
          ].join("\n"),
        ),
      ),
  },
  {
    id: "rules.main",
    channelKey: "information:rules",
    legacyChannelKeys: ["01-start-here:rules"],
    pin: true,
    build: () => ({
      embeds: [
        embed("Community rules", rulesText),
        embed(
          "Joining the community",
          "Press the button below to confirm you accept the rules. You will receive the **Member** role and can then take part in the community channels. Opening a support ticket does not require this.",
        ),
      ],
      components: [onboardingButton()],
    }),
  },
  {
    id: "getting-started.main",
    channelKey: "information:getting-started",
    legacyChannelKeys: ["01-start-here:getting-started"],
    pin: true,
    build: () =>
      page(
        embed(
          "Getting started",
          [
            "**Support** — `!ticket` (or the button in create-ticket) opens a private channel that only you and authorised staff can see. No account or purchase is needed.",
            "**Your tickets** — `!tickets` lists them privately. Inside a ticket: `!close <reason>`, `!reopen`, `!transcript` (sent to you privately).",
            "**Linking your KUSH account** — `!account` links Discord to an existing KUSH account using a one-time code.",
            "**Commands** — `!help` shows only the commands you can use. Every `!` command also has a `/` version whose replies are private.",
            "**Private replies** — account details are sent by direct message. If your DMs are closed, use the `/` version instead.",
            "",
            `Products, downloads and setup guides: ${notYet("they will appear here once KUSH publishes verified products")}`,
          ].join("\n\n"),
        ),
      ),
  },
  {
    id: "status.main",
    channelKey: "information:status",
    legacyChannelKeys: ["01-start-here:status"],
    pin: true,
    build: () =>
      page(
        embed(
          "Service status",
          "Incidents and planned maintenance are announced in this channel. For the current state of the KUSH bot and services, type `!status`.",
        ),
      ),
  },
  {
    id: "honeypot.warning",
    channelKey: "information:do-not-post",
    pin: true,
    build: () =>
      page(
        embed(
          "Do not post here",
          "This channel exists to catch spam and compromised accounts. **Any message posted here is removed automatically** and flagged to moderators for review. A single accidental post is not punished — you will simply be told it was removed. Repeated posting in a short time leads to a temporary mute while staff look into it.",
        ).setColor(kushColours.warning),
      ),
  },

  // ------------------------------------------------------------- community
  {
    id: "introductions.guide",
    channelKey: "community:introductions",
    legacyChannelKeys: ["02-community:introductions"],
    pin: true,
    build: () =>
      page(
        embed(
          "Introduce yourself",
          "Tell everyone who you are and what you build or create. Please do not share personal contact details, and keep promotion to showcases.",
        ),
      ),
  },
  {
    id: "showcases.guide",
    channelKey: "community:showcases",
    legacyChannelKeys: ["02-community:showcase"],
    pin: true,
    build: () =>
      page(
        embed(
          "Showcases",
          "Share work you have made. Post only work you have the right to share, credit collaborators, and never post malicious or pirated files.",
        ),
      ),
  },
  {
    id: "suggestions.guide",
    channelKey: "community:suggestions",
    legacyChannelKeys: ["02-community:suggestions"],
    pin: true,
    build: () =>
      page(
        embed(
          "Suggestions",
          "Suggest improvements to KUSH or this community, one idea per message. Suggestions are read by the team; they are not commitments or roadmap promises.",
        ),
      ),
  },

  // ------------------------------------------------------------ KUSH studio
  {
    id: "services.main",
    channelKey: "studio:services",
    legacyChannelKeys: ["04-services-&-commissions:our-services"],
    pin: true,
    build: () =>
      page(
        embed(
          "KUSH services",
          [
            "**Website development** — websites and web applications.",
            "**Custom software** — tools and applications built around a specific workflow.",
            "**Creative services** — digital creative work.",
            "**Discord setup and support systems** — structured servers with tested permissions, private tickets and staff tools.",
            "",
            "Every project starts with a private conversation about scope. Pricing, timelines and ownership are agreed in writing before any work begins; nothing posted in Discord is a quote or a contract.",
            "",
            "To start, see commission-enquiries or type `!ticket` and choose **Commission enquiry**.",
          ].join("\n"),
        ),
      ),
  },
  {
    id: "commission-enquiries.main",
    channelKey: "studio:commission-enquiries",
    legacyChannelKeys: ["04-services-&-commissions:request-a-commission"],
    pin: true,
    build: () => ({
      embeds: [
        embed(
          "Request a commission",
          [
            "Press the button to open a **private commission enquiry**. Describe what you need, any deadline, and examples of what you like.",
            "",
            "KUSH will reply in your private channel. An enquiry is not an agreement: price, scope, delivery dates and ownership are confirmed in writing before work starts.",
          ].join("\n"),
        ),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(PUBLIC_COMMISSION_BUTTON)
            .setLabel("Start a commission enquiry")
            .setStyle(ButtonStyle.Primary),
        ),
      ],
    }),
  },

  // -------------------------------------------------------------- products
  {
    id: "products.main",
    channelKey: "products:products",
    legacyChannelKeys: ["03-kush-products:product-catalogue"],
    pin: true,
    build: () =>
      page(
        embed(
          "KUSH products",
          "KUSH has not published any public products yet. When it does, each product will be listed here with its version, platform and support details. Releases and changelogs will appear in releases.",
        ),
      ),
  },
  {
    id: "downloads.main",
    channelKey: "products:downloads",
    pin: true,
    build: () =>
      page(
        embed(
          "Downloads",
          [
            "Downloads are delivered privately to verified customers, and only for the products they own. Download links are never posted in public channels — do not trust links shared by other members.",
            "",
            `\`!downloads\`: ${notYet("product entitlements are being connected")}`,
          ].join("\n"),
        ),
      ),
  },
  {
    id: "setup-guides.main",
    channelKey: "products:setup-guides",
    pin: true,
    build: () =>
      page(
        embed(
          "Setup guides",
          [
            "Setup guides are provided for the products you own. For installation help right now, open a ticket and choose **Installation help**.",
            "",
            `\`!guide <product>\`: ${notYet("guides will be published with each product")}`,
          ].join("\n"),
        ),
      ),
  },
  {
    id: "known-issues.main",
    channelKey: "products:known-issues",
    legacyChannelKeys: ["03-kush-products:known-issues"],
    pin: true,
    build: () =>
      page(
        embed(
          "Known issues",
          "Confirmed issues and workarounds are posted here by KUSH staff. To report a new problem, open a ticket and choose **Product bug** — please do not post private details publicly.",
        ),
      ),
  },
  {
    id: "beta.main",
    channelKey: "products:beta-programme",
    legacyChannelKeys: ["03-kush-products:beta-programme"],
    pin: true,
    build: () =>
      page(
        embed(
          "Beta programme",
          "Welcome, beta testers. Pre-release builds may be unstable; please report problems with clear steps to reproduce and keep beta material confidential unless told otherwise.",
        ),
      ),
  },

  // --------------------------------------------------------------- support
  {
    id: "create-ticket.panel",
    channelKey: "support:create-ticket",
    legacyChannelKeys: ["06-support:open-a-ticket"],
    pin: true,
    build: () => ({
      embeds: [
        embed(
          "KUSH support",
          [
            "Open a **private ticket** for general support, purchases, installation, technical issues, bugs, billing, commissions, partnerships or anything else. Only you and authorised staff can see it — no account or purchase needed.",
            "",
            "To report a member, choose **Member report**: reports are handled by moderators only.",
          ].join("\n"),
        ),
      ],
      components: [ticketRow()],
    }),
  },
  {
    id: "faq.main",
    channelKey: "support:faq",
    legacyChannelKeys: ["06-support:support-faq"],
    pin: true,
    build: () =>
      page(
        embed(
          "Frequently asked questions",
          [
            "**How do I get help?** Type `!ticket` or use the button in create-ticket.",
            "**Who can see my ticket?** Only you and the KUSH staff handling it. Member reports are seen only by moderators.",
            "**Can I get a copy of my ticket?** Yes — type `!transcript` inside it and it is sent to you privately.",
            "**How do I request a commission?** Use commission-enquiries. Nothing is agreed until price and scope are confirmed in writing.",
            "**Where are downloads?** They are delivered privately to verified customers. Never trust download links posted by other members.",
            "**Can I become a seller or reseller?** Partner applications are not open yet; see partner-information.",
          ].join("\n\n"),
        ),
      ),
  },

  // ---------------------------------------------------------- partnerships
  {
    id: "partner-information.main",
    channelKey: "partnerships:partner-information",
    legacyChannelKeys: ["05-marketplace-&-partners:partner-information"],
    pin: true,
    build: () =>
      page(
        embed(
          "Partner programmes",
          [
            "KUSH plans three programmes:",
            "**Approved sellers** — list their own digital products through KUSH.",
            "**Verified resellers** — resell KUSH products under a written agreement.",
            "**Creative partners** — collaborate on commissioned work by invitation.",
            "",
            `Applications: ${notYet("the application process opens once agreements are finalised")} To express interest now, open a ticket and choose **Partnership enquiry**.`,
            "",
            "No payments, payouts or agreements are made in Discord.",
          ].join("\n"),
        ),
      ),
  },
  ...(
    [
      ["reseller-programme", "Verified reseller resources"],
      ["seller-programme", "Approved seller resources"],
      ["creative-partners", "Creative partner resources"],
    ] as const
  ).map(([name, title]): ChannelMessage => ({
    id: `${name}.main`,
    channelKey: `partnerships:${name}`,
    pin: true,
    build: () =>
      page(
        embed(
          title,
          "This private channel is for programme members and KUSH. Programme terms are in your written agreement; questions about payments or contracts should go through a ticket, never a public channel.",
        ),
      ),
  })),

  // ------------------------------------------------------------------ staff
  {
    id: "staff-chat.guide",
    channelKey: "staff:staff-chat",
    legacyChannelKeys: ["08-staff-operations:staff-chat"],
    pin: true,
    build: () =>
      page(
        embed(
          "Staff guide",
          [
            "**Privacy** — customer details stay inside tickets and the KUSH backend. Never paste personal data, credentials or ticket content here.",
            "**Tickets** — `!tickets` (your tickets and the queue), `!claim <n>`, `!priority <level>`, `/note` (internal, never visible to customers), `!close <reason>`, `!transcript`. Support Lead: `!assign @staff`.",
            "**Linking** — staff commands act through your KUSH staff account; link it with `!account`.",
            "**Reports** — member reports go to moderators only.",
          ].join("\n\n"),
        ),
      ),
  },
  {
    id: "ticket-queue.guide",
    channelKey: "staff:ticket-queue",
    legacyChannelKeys: ["08-staff-operations:ticket-management"],
    pin: true,
    build: () =>
      page(
        embed(
          "Ticket queue",
          "New tickets are announced here as summaries only — never the customer's description. Claim with `!claim <number>`; the ticket channel then opens for you. Use `!tickets` for the full unclaimed list.",
        ),
      ),
  },
  {
    id: "moderation-log.guide",
    channelKey: "staff:moderation-log",
    legacyChannelKeys: ["08-staff-operations:moderation-log"],
    pin: true,
    build: () =>
      page(
        embed(
          "Moderation log",
          "Automatic moderation actions (including honeypot timeouts) and new member reports are recorded here. Review honeypot timeouts promptly and remove any that were mistakes.",
        ),
      ),
  },
  {
    id: "bot-log.guide",
    channelKey: "staff:bot-log",
    legacyChannelKeys: ["08-staff-operations:bot-log"],
    pin: true,
    build: () =>
      page(
        embed(
          "Bot log",
          "Audit events from the KUSH bot: privileged commands (allowed, denied or failed), account links, ticket creation and onboarding. Message content is never logged here.",
        ),
      ),
  },
];
