import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { onboardingButton } from "./runtime/components.js";

export const kushColours = {
  green: 0xa7fa43, // KUSH lime (matches the website)
  purple: 0x7c3aed, // KUSH violet
  blue: 0x3b82f6,
  obsidian: 0x111318,
  warning: 0xf59e0b,
  danger: 0xef4444,
  success: 0x22c55e,
} as const;

export type Tone =
  "brand" | "info" | "success" | "warning" | "danger" | "staff";
const toneColour: Record<Tone, number> = {
  brand: kushColours.purple,
  info: kushColours.blue,
  success: kushColours.success,
  warning: kushColours.warning,
  danger: kushColours.danger,
  staff: kushColours.green,
};

/**
 * House style for every official post: an emoji heading and a colour per
 * kind of message. Unlisted titles fall back to the brand style.
 */
const titleStyle: Record<string, { emoji: string; tone: Tone }> = {
  "Welcome to KUSH": { emoji: "👋", tone: "brand" },
  "Community rules": { emoji: "📜", tone: "warning" },
  "Joining the community": { emoji: "✅", tone: "success" },
  "Getting started": { emoji: "🚀", tone: "brand" },
  "Service status": { emoji: "🟢", tone: "success" },
  "Do not post here": { emoji: "⚠️", tone: "danger" },
  "Introduce yourself": { emoji: "🙋", tone: "brand" },
  Showcases: { emoji: "🎨", tone: "brand" },
  Suggestions: { emoji: "💡", tone: "info" },
  "KUSH services": { emoji: "🛠️", tone: "brand" },
  "Request a commission": { emoji: "✏️", tone: "brand" },
  "KUSH products": { emoji: "📦", tone: "info" },
  Downloads: { emoji: "⬇️", tone: "info" },
  "Setup guides": { emoji: "🧭", tone: "info" },
  "Known issues": { emoji: "🐞", tone: "warning" },
  "Beta programme": { emoji: "🧪", tone: "info" },
  "KUSH support": { emoji: "🛟", tone: "info" },
  "Frequently asked questions": { emoji: "❓", tone: "info" },
  "Join the KUSH team": { emoji: "🧑‍💼", tone: "brand" },
  "Partner programmes": { emoji: "🤝", tone: "brand" },
  "Staff guide": { emoji: "🛡️", tone: "staff" },
  "Ticket queue": { emoji: "🎫", tone: "staff" },
  "Moderation log": { emoji: "🚨", tone: "staff" },
  "Bot log": { emoji: "🤖", tone: "staff" },
};

export const FOOTER = "KUSH • Software, development & creative services";

/** A house-style embed. `title` may already include an emoji. */
export const card = (input: {
  title: string;
  description?: string;
  tone?: Tone;
  emoji?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: string;
  thumbnail?: string | null;
  timestamp?: boolean;
}) => {
  const built = new EmbedBuilder()
    .setColor(toneColour[input.tone ?? "brand"])
    .setTitle(
      `${input.emoji ? `${input.emoji} ` : ""}${input.title}`.slice(0, 256),
    )
    .setFooter({ text: input.footer ?? FOOTER });
  if (input.description) built.setDescription(input.description.slice(0, 4096));
  if (input.fields?.length) built.addFields(input.fields.slice(0, 25));
  if (input.thumbnail) built.setThumbnail(input.thumbnail);
  if (input.timestamp) built.setTimestamp(new Date());
  return built;
};

export const embed = (title: string, description: string) => {
  const style = titleStyle[title];
  return card({
    title,
    description,
    emoji: style?.emoji,
    tone: style?.tone ?? "brand",
  });
};

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

/** Public ticket buttons: `ticket:open:<category>` opens that form. */
export const ticketButtonId = (key: string) => `ticket:open:${key}`;

const buttonStyle = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
} as const;

/** The coloured category grid for #create-ticket (max 5 per row). */
export function ticketCategoryGrid(
  categories: readonly {
    key: string;
    label: string;
    emoji: string;
    style: keyof typeof buttonStyle;
  }[],
) {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < categories.length; i += 4)
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...categories
          .slice(i, i + 4)
          .map((c) =>
            new ButtonBuilder()
              .setCustomId(ticketButtonId(c.key))
              .setLabel(c.label)
              .setEmoji(c.emoji)
              .setStyle(buttonStyle[c.style]),
          ),
      ),
    );
  return rows;
}

/**
 * Website-to-Discord notification text as a house-style card. A leading
 * user mention stays outside the card (mentions inside embeds don't
 * notify); the first line becomes the heading.
 */
export function notificationMessage(content: string) {
  const mention = /^(<@\d{17,20}>)\s*/.exec(content);
  const body = mention ? content.slice(mention[0].length) : content;
  const [first, ...rest] = body.split("\n");
  const urls = /(https?:\/\/\S+)/g;
  return {
    ...(mention ? { content: mention[1] } : {}),
    embeds: [
      card({
        title:
          first!.replace(/\*\*/g, "").replace(urls, "").trim().slice(0, 240) ||
          "KUSH update",
        description:
          [first!.match(urls)?.join(" "), ...rest].filter(Boolean).join("\n") ||
          undefined,
        tone: "brand",
        timestamp: true,
      }),
    ],
  };
}
