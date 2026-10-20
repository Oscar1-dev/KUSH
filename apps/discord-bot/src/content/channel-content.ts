import {
  PUBLIC_COMMISSION_BUTTON,
  rulesText,
  ticketCategoryGrid,
} from "../panels.js";
import { ticketCategories } from "../tickets/categories.js";
import { onboardingButton } from "../runtime/components.js";
import type { BotReply } from "../runtime/command.js";
import {
  actions,
  bullets,
  cmd,
  panel,
  steps,
  type Section,
} from "../ui/kit.js";
import { navigatorMenu, rolesPanel } from "../ui/navigation.js";

export { PUBLIC_COMMISSION_BUTTON } from "../panels.js";

/**
 * Official KUSH channel content. Each entry is one persistent bot message,
 * identified by a stable `id` so republishing edits it instead of posting a
 * duplicate. Every button and menu here is handled in
 * runtime/discord-bindings.ts.
 *
 * Content rules: describe only what exists. Features that are not live are
 * labelled "not available yet"; no prices, products, customers or
 * guarantees are invented (live prices come from `/products`).
 */
export interface ChannelMessage {
  id: string;
  /** v2 channel key; legacy keys let the content reach v1 channels too. */
  channelKey: string;
  legacyChannelKeys?: string[];
  pin: boolean;
  build(): BotReply;
}

const notYet = (feature: string) => `_${feature}: not available yet._`;
const one = (...embeds: ReturnType<typeof panel>[]): BotReply => ({
  embeds,
  components: [],
});
/** Website links only once the site is public (KUSH_PUBLIC_SITE_URL). */
const site = (path: string) => {
  const base = process.env.KUSH_PUBLIC_SITE_URL?.replace(/\/$/, "");
  return base ? `${base}${path}` : null;
};

/** The eight KUSH services, as in the API catalogue (prices live there). */
const services: Section[] = [
  {
    emoji: "🌐",
    heading: "Websites & Portfolios",
    body: "Portfolio, business and advanced websites, landing pages and redesigns.",
  },
  {
    emoji: "📊",
    heading: "Web Apps & Dashboards",
    body: "Custom web applications, dashboards and customer portals.",
  },
  {
    emoji: "🤖",
    heading: "Discord Bots & Servers",
    body: "Server setups with tested permissions, bots, tickets and staff tools.",
  },
  {
    emoji: "🖥️",
    heading: "Desktop Software & Tools",
    body: "Windows utilities, scripts and bespoke applications.",
  },
  {
    emoji: "🎮",
    heading: "Gaming & Rust Servers",
    body: "Rust configurations, plugins and maps, plus game community tools.",
  },
  {
    emoji: "🔧",
    heading: "Technical Support & Setup",
    body: "Troubleshooting, domains, DNS and getting systems working together.",
  },
  {
    emoji: "🎨",
    heading: "Design & Creative",
    body: "UI/UX, video editing and GFX; branding and motion with partners.",
  },
  {
    emoji: "⚙️",
    heading: "Automation & APIs",
    body: "Automations, integrations and back-end workflows.",
  },
];

export const channelContent: ChannelMessage[] = [
  // ------------------------------------------------------------ information
  {
    id: "welcome.main",
    channelKey: "information:welcome",
    legacyChannelKeys: ["01-start-here:welcome"],
    pin: true,
    build: () => ({
      embeds: [
        panel({
          title: "Welcome to KUSH",
          emoji: "👋",
          banner: true,
          intro:
            "KUSH builds websites, software, Discord systems and creative work, and supports everything it builds. This server is where you find us, get help and meet the community.",
          sections: [
            {
              heading: "Start here",
              emoji: "🚀",
              body: steps([
                "Read #rules and press **I have read and accept the rules** to join in.",
                "Use the menu below to find what you're after.",
                `Stuck? ${cmd("ticket create")} opens a private ticket, no account needed.`,
              ]),
            },
            {
              heading: "Good to know",
              emoji: "🔐",
              body: bullets([
                "KUSH staff will never ask for your password or payment details in Discord.",
                "Payments only happen on Stripe's secure checkout, from links the bot sends you privately.",
                `Slash commands reply privately; type ${cmd("help")} to see yours.`,
              ]),
            },
          ],
        }),
      ],
      components: [navigatorMenu()],
    }),
  },
  {
    id: "rules.main",
    channelKey: "information:rules",
    legacyChannelKeys: ["01-start-here:rules"],
    pin: true,
    build: () => ({
      embeds: [
        panel({
          title: "Community rules",
          emoji: "📜",
          tone: "warning",
          intro: rulesText,
        }),
        panel({
          title: "Joining the community",
          emoji: "✅",
          tone: "success",
          intro:
            "Press the button to confirm you accept the rules. You'll get the **Member** role and can take part in the community channels. You don't need this to open a support ticket.",
        }),
      ],
      components: [onboardingButton()],
    }),
  },
  {
    id: "roles.main",
    channelKey: "information:roles",
    legacyChannelKeys: ["archive:roles"],
    pin: true,
    build: rolesPanel,
  },
  {
    id: "getting-started.main",
    channelKey: "information:getting-started",
    legacyChannelKeys: ["01-start-here:getting-started"],
    pin: true,
    build: () =>
      one(
        panel({
          title: "Getting started",
          emoji: "🧭",
          intro:
            "Slash commands reply privately (only you see them). The same commands also work with `!` if you prefer.",
          sections: [
            {
              heading: "Get help",
              emoji: "🛟",
              body: bullets([
                `${cmd("ticket create")} opens a private ticket. Inside it: ${cmd("ticket close")}, ${cmd("ticket transcript")}`,
                `${cmd("tickets")} lists your tickets`,
              ]),
            },
            {
              heading: "Work with KUSH",
              emoji: "✏️",
              body: bullets([
                `${cmd("commission create")} requests a commission; ${cmd("commission status")} tracks it`,
                `${cmd("products")} shows live prices; ${cmd("buy")} checks out with Stripe`,
                `${cmd("orders")} and ${cmd("order")} show your orders and receipts`,
              ]),
            },
            {
              heading: "Your account",
              emoji: "🔗",
              body: bullets([
                `${cmd("account")} links Discord to your KUSH account with a one-time code`,
                `${cmd("credit")} store credit · ${cmd("referrals")} your referral code and rewards`,
                `${cmd("downloads")} and ${cmd("licenses")} for products you own`,
              ]),
            },
          ],
        }),
      ),
  },
  {
    id: "status.main",
    channelKey: "information:status",
    legacyChannelKeys: ["01-start-here:status"],
    pin: true,
    build: () =>
      one(
        panel({
          title: "Service status",
          emoji: "🟢",
          tone: "success",
          intro: `Incidents and planned maintenance are announced here. For a live check of the bot and KUSH services, type ${cmd("status")}.`,
        }),
      ),
  },
  {
    id: "honeypot.warning",
    channelKey: "information:do-not-post",
    pin: true,
    build: () =>
      one(
        panel({
          title: "Do not post here",
          emoji: "⚠️",
          tone: "danger",
          intro:
            "This channel catches spam and compromised accounts. **Anything posted here is removed automatically** and flagged to moderators. One accidental post isn't punished; you'll just be told it was removed. Repeated posting quickly leads to a temporary mute while staff take a look.",
        }),
      ),
  },

  // ------------------------------------------------------------- community
  {
    id: "introductions.guide",
    channelKey: "community:introductions",
    legacyChannelKeys: ["02-community:introductions"],
    pin: true,
    build: () =>
      one(
        panel({
          title: "Introduce yourself",
          emoji: "🙋",
          intro:
            "Tell everyone who you are and what you build or create. Keep personal contact details private, and keep promotion to #showcases.",
        }),
      ),
  },
  {
    id: "showcases.guide",
    channelKey: "community:showcases",
    legacyChannelKeys: ["02-community:showcase"],
    pin: true,
    build: () =>
      one(
        panel({
          title: "Showcases",
          emoji: "🎨",
          intro:
            "Share work you've made. Only post work you have the right to share, credit collaborators, and never post malicious or pirated files.",
        }),
      ),
  },
  {
    id: "vouches.guide",
    channelKey: "community:vouches",
    pin: true,
    build: () =>
      one(
        panel({
          title: "Vouches",
          emoji: "⭐",
          intro:
            "Reviews from verified KUSH customers. Every vouch here also appears on the KUSH website.",
          sections: [
            {
              heading: "Leave yours",
              body: "Type `!vouch <1-5> <your review>`, e.g. `!vouch 5 Fast, friendly and exactly what I asked for.`",
            },
            {
              heading: "The rules",
              body: bullets([
                "Only members with the **Customer** role can vouch (link your Discord on the website after buying).",
                "One vouch per day. Fake, abusive or spam vouches are removed.",
              ]),
            },
          ],
        }),
      ),
  },
  {
    id: "suggestions.guide",
    channelKey: "community:suggestions",
    legacyChannelKeys: ["02-community:suggestions"],
    pin: true,
    build: () =>
      one(
        panel({
          title: "Suggestions",
          emoji: "💡",
          tone: "info",
          intro:
            "Suggest improvements to KUSH or this community, one idea per message. The team reads every one; they aren't roadmap promises.",
        }),
      ),
  },

  // ------------------------------------------------------------ KUSH studio
  {
    id: "services.main",
    channelKey: "studio:services",
    legacyChannelKeys: ["04-services-&-commissions:our-services"],
    pin: true,
    build: () => {
      const pricing = site("/pricing");
      return {
        embeds: [
          panel({
            title: "KUSH services",
            emoji: "🛠️",
            banner: true,
            intro: `Eight things, done properly. Live prices: ${cmd("products")}${pricing ? " or the pricing page" : ""}.`,
            sections: services,
            footer:
              "Every project gets a written quote before any work or payment.",
          }),
        ],
        components: [
          actions(
            {
              id: PUBLIC_COMMISSION_BUTTON,
              label: "Start a commission",
              emoji: "✏️",
              style: "primary",
            },
            ...(pricing
              ? [{ url: pricing, label: "See prices", emoji: "💷" }]
              : []),
          ),
        ],
      };
    },
  },
  {
    id: "commission-enquiries.main",
    channelKey: "studio:commission-enquiries",
    legacyChannelKeys: ["04-services-&-commissions:request-a-commission"],
    pin: true,
    build: () => ({
      embeds: [
        panel({
          title: "Request a commission",
          emoji: "✏️",
          banner: true,
          intro: "Tell us what you need. It takes a couple of minutes.",
          sections: [
            {
              heading: "How it works",
              body: steps([
                "Press **Start a commission** and pick the service.",
                "Describe the project: what it's for, any deadline, examples you like.",
                "The team replies in a private channel with a written quote: price, what you get, revisions and timeline.",
                "Accept it and pay securely with Stripe. Work starts once it's paid.",
              ]),
            },
            {
              heading: "Good to know",
              body: bullets([
                "Asking costs nothing, and nothing is charged until you accept a quote.",
                `Track progress any time with ${cmd("commission status")}, here or on the website.`,
              ]),
            },
          ],
        }),
      ],
      components: [
        actions({
          id: PUBLIC_COMMISSION_BUTTON,
          label: "Start a commission",
          emoji: "✏️",
          style: "primary",
        }),
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
      one(
        panel({
          title: "KUSH products",
          emoji: "📦",
          tone: "info",
          intro: `Ready-made products you can buy. ${cmd("products")} lists them with live prices; ${cmd("buy")} opens Stripe's secure checkout, privately.`,
          sections: [
            {
              heading: "After you buy",
              body: bullets([
                `Your order and receipt: ${cmd("orders")}`,
                `Downloads arrive privately: ${cmd("downloads")}`,
                "Release notes are posted in #releases.",
              ]),
            },
          ],
        }),
      ),
  },
  {
    id: "downloads.main",
    channelKey: "products:downloads",
    pin: true,
    build: () =>
      one(
        panel({
          title: "Downloads",
          emoji: "⬇️",
          tone: "info",
          intro: `Downloads are delivered privately, and only for products you own: type ${cmd("downloads")}. Links expire after a few minutes and are checked against your account.`,
          sections: [
            {
              heading: "Stay safe",
              body: "Download links are never posted in public channels. Don't trust links shared by other members.",
            },
          ],
        }),
      ),
  },
  {
    id: "setup-guides.main",
    channelKey: "products:setup-guides",
    pin: true,
    build: () =>
      one(
        panel({
          title: "Setup guides",
          emoji: "🧭",
          tone: "info",
          intro: `For installation help right now, open a ticket and choose **Installation help**.\n\n\`!guide <product>\`: ${notYet("guides will be published with each product")}`,
        }),
      ),
  },
  {
    id: "known-issues.main",
    channelKey: "products:known-issues",
    legacyChannelKeys: ["03-kush-products:known-issues"],
    pin: true,
    build: () =>
      one(
        panel({
          title: "Known issues",
          emoji: "🐞",
          tone: "warning",
          intro:
            "Confirmed issues and workarounds are posted here by the team. To report a new problem, open a ticket and choose **Product bug**. Please don't post private details publicly.",
        }),
      ),
  },
  {
    id: "beta.main",
    channelKey: "products:beta-programme",
    legacyChannelKeys: ["03-kush-products:beta-programme"],
    pin: true,
    build: () =>
      one(
        panel({
          title: "Beta programme",
          emoji: "🧪",
          tone: "info",
          intro:
            "Welcome, beta testers. Pre-release builds can be unstable: report problems with clear steps to reproduce, and keep beta material confidential unless told otherwise.",
        }),
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
        panel({
          title: "Create a ticket",
          emoji: "🎫",
          tone: "info",
          banner: true,
          intro:
            "**Pick the category that fits best.** A private channel opens that only you and the right KUSH team can see. No account or purchase needed.",
          sections: [
            {
              heading: "Who sees what",
              body: bullets([
                "🔒 **Billing** is handled confidentially by managers.",
                "🚩 **Member reports** go to moderators only.",
              ]),
            },
            {
              heading: "Afterwards",
              body: "Follow and reply to your tickets here or on the KUSH website; it's the same conversation.",
            },
          ],
        }),
      ],
      components: ticketCategoryGrid(ticketCategories),
    }),
  },
  {
    id: "faq.main",
    channelKey: "support:faq",
    legacyChannelKeys: ["06-support:support-faq"],
    pin: true,
    build: () =>
      one(
        panel({
          title: "Frequently asked questions",
          emoji: "❓",
          tone: "info",
          sections: [
            {
              heading: "How do I get help?",
              body: `${cmd("ticket create")}, or a button in #create-ticket.`,
            },
            {
              heading: "Who can see my ticket?",
              body: "Only you and the KUSH staff handling it. Member reports are seen only by moderators.",
            },
            {
              heading: "Can I keep a copy?",
              body: `Yes: ${cmd("ticket transcript")} inside the ticket sends it to you privately.`,
            },
            {
              heading: "How do commissions work?",
              body: `${cmd("commission create")}. You get a written quote first, and pay only once you've accepted it.`,
            },
            {
              heading: "Is paying safe?",
              body: "Payments happen on Stripe's checkout; KUSH never sees your card. Nobody from KUSH will ask for card details in Discord.",
            },
            {
              heading: "Where are my downloads?",
              body: `${cmd("downloads")} sends them privately. Never trust download links from other members.`,
            },
          ],
        }),
      ),
  },

  // ------------------------------------------------------ staff careers
  {
    id: "applications.main",
    channelKey: "partnerships:applications",
    pin: true,
    build: () => {
      const careers = site("/careers");
      return {
        embeds: [
          panel({
            title: "Join the KUSH team",
            emoji: "🧑‍💼",
            banner: true,
            intro:
              "We're looking for people who care about doing things properly.",
            sections: [
              {
                heading: "Roles we hire for",
                body: bullets([
                  "**Ticket Staff**: help customers through tickets on the website and in Discord",
                  "**Moderator**: keep this server welcoming and handle member reports",
                  "**Developer**: build websites and software for commissions (portfolio needed)",
                  "**Staff Manager**: scope projects, prepare quotes and coordinate the team",
                ]),
              },
              {
                heading: "How it works",
                body: steps([
                  "Apply with your Discord account on the website.",
                  "A private channel opens here between you and the recruitment team.",
                  "If you're conditionally accepted, senior roles sign the KUSH staff NDA, here or on the website.",
                  "An administrator confirms your role and switches your access on.",
                ]),
              },
              {
                heading: "Safety",
                body: "Nobody gets a staff role automatically, and KUSH will never ask for your password.",
              },
            ],
          }),
        ],
        components: careers
          ? [
              actions({
                url: careers,
                label: "Apply on the website",
                emoji: "📝",
              }),
            ]
          : [],
      };
    },
  },

  // ---------------------------------------------------------- partnerships
  {
    id: "partner-information.main",
    channelKey: "partnerships:partner-information",
    legacyChannelKeys: ["05-marketplace-&-partners:partner-information"],
    pin: true,
    build: () =>
      one(
        panel({
          title: "Partner programmes",
          emoji: "🤝",
          intro: "Three ways to work with KUSH beyond commissions:",
          sections: [
            {
              heading: "Verified Seller",
              body: "List your own digital products through KUSH (the marketplace opens later).",
            },
            {
              heading: "Reseller",
              body: "Resell KUSH products under a written reseller agreement.",
            },
            {
              heading: "Creative Team",
              body: "Collaborate on commissioned creative work, by invitation.",
            },
            {
              heading: "Interested?",
              body: `${notYet("Self-service partner applications")} Open a ticket and choose **Partnership enquiry**. No payments, payouts or agreements are made in Discord.`,
            },
          ],
        }),
      ),
  },
  ...(
    [
      ["reseller-programme", "Reseller resources", "Reseller"],
      ["seller-programme", "Verified Seller resources", "Verified Seller"],
      ["creative-partners", "Creative Team resources", "Creative Team"],
    ] as const
  ).map(([name, title, role]): ChannelMessage => ({
    id: `${name}.main`,
    channelKey: `partnerships:${name}`,
    pin: true,
    build: () =>
      one(
        panel({
          title,
          emoji: "🤝",
          intro: `This private channel is for the **${role}** programme and KUSH. Terms are in your written agreement; questions about payments or contracts go through a ticket, never a public channel.`,
        }),
      ),
  })),

  // ------------------------------------------------------------------ staff
  {
    id: "staff-chat.guide",
    channelKey: "staff:staff-chat",
    legacyChannelKeys: ["08-staff-operations:staff-chat"],
    pin: true,
    build: () => {
      const dashboard = site("/staff");
      return {
        embeds: [
          panel({
            title: "Staff guide",
            emoji: "🛡️",
            tone: "staff",
            intro:
              "Discord and the staff website are one system: both call the same KUSH backend, which checks your live Discord roles on every action.",
            sections: [
              {
                heading: "Privacy",
                emoji: "🔒",
                body: "Customer details stay in tickets and the backend. Never paste personal data, credentials or ticket content here.",
              },
              {
                heading: "Tickets",
                emoji: "🎫",
                body: bullets([
                  `${cmd("tickets")} yours and the queue · ${cmd("ticket claim")} · ${cmd("ticket add")} @member`,
                  `${cmd("note")} internal note · ${cmd("priority")} · ${cmd("ticket close")} · ${cmd("ticket transcript")}`,
                  `Staff Manager: ${cmd("assign")} @staff`,
                ]),
              },
              {
                heading: "Commissions",
                emoji: "✏️",
                body: bullets([
                  `${cmd("staff commissions")} yours (or everyone's) · ${cmd("commission status")} in a ticket`,
                  `${cmd("commission quote")} · ${cmd("commission assign")} · ${cmd("commission update")} · ${cmd("commission complete")}`,
                ]),
              },
              {
                heading: "Customers & business",
                emoji: "📊",
                body: bullets([
                  `${cmd("staff customer")} @member · ${cmd("staff role")} grant or revoke a programme role`,
                  `${cmd("staff orders")} · ${cmd("staff stats")} · ${cmd("product create")} / \`edit\` / \`archive\``,
                  "Refunds, payments and credit changes are website-only (they need 2FA).",
                ]),
              },
            ],
          }),
        ],
        components: dashboard
          ? [
              actions({
                url: dashboard,
                label: "Open the staff dashboard",
                emoji: "🧰",
              }),
            ]
          : [],
      };
    },
  },
  {
    id: "ticket-queue.guide",
    channelKey: "staff:ticket-queue",
    legacyChannelKeys: ["08-staff-operations:ticket-management"],
    pin: true,
    build: () =>
      one(
        panel({
          title: "Ticket queue",
          emoji: "🎫",
          tone: "staff",
          intro: `New tickets are announced here as summaries only, never the customer's description. Claim with ${cmd("ticket claim")}; the ticket channel then opens for you. ${cmd("tickets")} shows the full unclaimed list.`,
        }),
      ),
  },
  {
    id: "moderation-log.guide",
    channelKey: "staff:moderation-log",
    legacyChannelKeys: ["08-staff-operations:moderation-log"],
    pin: true,
    build: () =>
      one(
        panel({
          title: "Moderation log",
          emoji: "🚨",
          tone: "staff",
          intro:
            "Automatic moderation (including honeypot timeouts), recorded cases and new member reports land here. Review honeypot timeouts promptly and lift any that were mistakes. Cases are also on the staff website under Moderation.",
        }),
      ),
  },
  {
    id: "bot-log.guide",
    channelKey: "staff:bot-log",
    legacyChannelKeys: ["08-staff-operations:bot-log"],
    pin: true,
    build: () =>
      one(
        panel({
          title: "Bot log",
          emoji: "🤖",
          tone: "staff",
          intro:
            "Audit events from the KUSH bot: privileged commands (allowed, denied or failed), account links, tickets and onboarding. Message content is never logged here.",
        }),
      ),
  },
];
