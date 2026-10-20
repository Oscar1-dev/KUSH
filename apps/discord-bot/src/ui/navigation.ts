import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { selfAssignableRoles, type RoleKey } from "../blueprint.js";
import { PUBLIC_COMMISSION_BUTTON, PUBLIC_TICKET_BUTTON } from "../panels.js";
import type { BotReply } from "../runtime/command.js";
import {
  actions,
  bullets,
  channel,
  cmd,
  notice,
  panel,
  type Action,
} from "./kit.js";

/**
 * Server navigation. A persistent "Find your way" menu in #welcome answers
 * privately with the right channels and a button to act, and #roles lets
 * members opt in to notification pings themselves. Both are public
 * components: the person who clicks is the person acted for.
 */

export const NAV_MENU = "nav:menu";
export const ROLE_TOGGLE_PREFIX = "roles:toggle:";

type Destination =
  | "services"
  | "commission"
  | "help"
  | "products"
  | "account"
  | "community"
  | "partners"
  | "roles";

const destinations: {
  value: Destination;
  label: string;
  emoji: string;
  description: string;
}[] = [
  {
    value: "services",
    label: "Services & prices",
    emoji: "🛠️",
    description: "What KUSH builds and what it costs",
  },
  {
    value: "commission",
    label: "Start a commission",
    emoji: "✏️",
    description: "Get a written quote for your project",
  },
  {
    value: "help",
    label: "Get help",
    emoji: "🛟",
    description: "Open a private support ticket",
  },
  {
    value: "products",
    label: "Products & orders",
    emoji: "📦",
    description: "Buy, download and track orders",
  },
  {
    value: "account",
    label: "My KUSH account",
    emoji: "🔗",
    description: "Link Discord, credit and referrals",
  },
  {
    value: "community",
    label: "Community",
    emoji: "💬",
    description: "Chat, share work and give feedback",
  },
  {
    value: "partners",
    label: "Partners & careers",
    emoji: "🤝",
    description: "Sell, resell or join the team",
  },
  {
    value: "roles",
    label: "Notification roles",
    emoji: "🔔",
    description: "Choose which updates ping you",
  },
];

export const navigatorMenu = () =>
  new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(NAV_MENU)
      .setPlaceholder("🧭  Find your way around KUSH…")
      .addOptions(destinations),
  );

const isDestination = (value: string): value is Destination =>
  destinations.some((item) => item.value === value);

/** The private answer to a navigator choice. */
export function navigatorAnswer(
  choice: string,
  ids: Record<string, string>,
  /** Signed, user-scoped "link account" button (made by the caller). */
  linkAccount?: BotReply["components"],
): BotReply {
  if (!isDestination(choice))
    return { embeds: [notice("warning", "Pick an option from the menu")] };
  const at = (key: string) => channel(ids, key);
  const reply = (
    title: string,
    emoji: string,
    lines: string[],
    buttons: Action[] = [],
  ): BotReply => ({
    embeds: [panel({ title, emoji, tone: "info", intro: lines.join("\n") })],
    components: buttons.length ? [actions(...buttons)] : [],
  });
  switch (choice) {
    case "services":
      return reply(
        "Services & prices",
        "🛠️",
        [
          `Everything KUSH offers is in ${at("studio:services")}, with how quotes work in ${at("studio:pricing-and-quotes")}.`,
          "",
          `Type ${cmd("products")} for live prices and ready-made products.`,
        ],
        [
          {
            id: PUBLIC_COMMISSION_BUTTON,
            label: "Start a commission",
            emoji: "✏️",
            style: "primary",
          },
        ],
      );
    case "commission":
      return reply(
        "Start a commission",
        "✏️",
        [
          "Pick a service, describe what you need, and the team replies in a private channel with a written quote.",
          "Nothing is charged until you've accepted that quote.",
          "",
          `More detail: ${at("studio:commission-information")}`,
        ],
        [
          {
            id: PUBLIC_COMMISSION_BUTTON,
            label: "Start now",
            emoji: "✏️",
            style: "primary",
          },
        ],
      );
    case "help":
      return reply(
        "Get help",
        "🛟",
        [
          `Open a private ticket: only you and the right KUSH team can see it. Quick answers first? Try ${at("support:faq")}.`,
        ],
        [
          {
            id: PUBLIC_TICKET_BUTTON,
            label: "Open a ticket",
            emoji: "🎫",
            style: "primary",
          },
        ],
      );
    case "products":
      return reply("Products & orders", "📦", [
        bullets([
          `${cmd("products")} see what's for sale, ${cmd("buy")} to check out securely with Stripe`,
          `${cmd("orders")} and ${cmd("order")} for your orders and receipts`,
          `Downloads arrive privately: ${at("products:downloads")}`,
          `Release notes: ${at("products:releases")}`,
        ]),
      ]);
    case "account":
      return {
        ...reply("My KUSH account", "🔗", [
          "Link Discord to your KUSH account so orders, commissions and tickets follow you between here and the website.",
          "",
          bullets([
            `${cmd("credit")} your store credit`,
            `${cmd("referrals")} your referral code and rewards`,
            `${cmd("commission status")} where your commissions are up to`,
          ]),
        ]),
        ...(linkAccount ? { components: linkAccount } : {}),
      };
    case "community":
      return reply("Community", "💬", [
        bullets([
          `Chat: ${at("community:general")} · say hi in ${at("community:introductions")}`,
          `Show your work: ${at("community:showcases")}`,
          `Ideas and feedback: ${at("community:suggestions")} · ${at("community:feedback")}`,
          `Reviews from customers: ${at("community:vouches")}`,
        ]),
      ]);
    case "partners":
      return reply("Partners & careers", "🤝", [
        bullets([
          `Seller, reseller and creative programmes: ${at("partnerships:partner-information")}`,
          `Join the KUSH team: ${at("partnerships:applications")}`,
        ]),
      ]);
    case "roles":
      return reply("Notification roles", "🔔", [
        `Choose what pings you in ${at("information:roles")}. You can change it any time.`,
      ]);
  }
}

// ------------------------------------------------------------------ roles

const notifyCopy: Record<
  string,
  { label: string; emoji: string; text: string }
> = {
  "notify-announcements": {
    label: "Announcements",
    emoji: "📣",
    text: "Big news from KUSH",
  },
  "notify-products": {
    label: "Product Updates",
    emoji: "📦",
    text: "New products and releases",
  },
  "notify-development": {
    label: "Development Updates",
    emoji: "🧪",
    text: "Behind-the-scenes progress",
  },
  "notify-events": {
    label: "Community Events",
    emoji: "🎉",
    text: "Events, giveaways and polls",
  },
};

export const roleToggleId = (key: RoleKey) => `${ROLE_TOGGLE_PREFIX}${key}`;

/** The key from a toggle button, only if it's an allowed opt-in role. */
export function toggledRole(customId: string): RoleKey | null {
  if (!customId.startsWith(ROLE_TOGGLE_PREFIX)) return null;
  const key = customId.slice(ROLE_TOGGLE_PREFIX.length) as RoleKey;
  return selfAssignableRoles.includes(key) ? key : null;
}

export function rolesPanel(): BotReply {
  return {
    embeds: [
      panel({
        title: "Roles",
        emoji: "🏷️",
        intro: "What the coloured names mean, and how people get them.",
        sections: [
          {
            heading: "Team",
            emoji: "🛡️",
            body: bullets([
              "**Owner** · **Administrator** run KUSH",
              "**Staff Manager** runs the team, quotes and commissions",
              "**Developer** builds the work · **Ticket Staff** answers tickets",
              "**Moderator** keeps the community friendly",
            ]),
          },
          {
            heading: "Partners",
            emoji: "🤝",
            body: bullets([
              "**Creative Team** · **Verified Seller** · **Reseller**: approved partner programmes",
            ]),
          },
          {
            heading: "Community",
            emoji: "💬",
            body: bullets([
              "**Customer** has bought from KUSH · **Beta Tester** tries things early",
              "**Member** accepted the rules · **Restricted** is limited while staff review",
            ]),
          },
          {
            heading: "Notifications",
            emoji: "🔔",
            body: [
              "Pick what pings you. Press again to turn it off.",
              ...selfAssignableRoles.map((key) => {
                const copy = notifyCopy[key]!;
                return `${copy.emoji} **${copy.label}**: ${copy.text}`;
              }),
            ],
          },
        ],
      }),
    ],
    components: [
      actions(
        ...selfAssignableRoles.map((key) => ({
          id: roleToggleId(key),
          label: notifyCopy[key]!.label,
          emoji: notifyCopy[key]!.emoji,
        })),
      ),
    ],
  };
}

export const notifyLabel = (key: RoleKey) => notifyCopy[key]?.label ?? key;
