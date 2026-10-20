import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type EmbedBuilder,
} from "discord.js";
import { card, type Tone } from "../panels.js";
import type { BotReply } from "../runtime/command.js";

/**
 * KUSH Discord UI kit. Every bot surface is built from these few pieces so
 * the server reads as one product:
 *
 *  - `panel()`   pinned channel posts: an intro line, then titled sections
 *  - `notice()`  every reply to an action: success, error, warning, info,
 *                permission or pending, each with a fixed emoji and colour
 *  - `actions()` one row of buttons (custom IDs or links)
 *  - `steps()` / `bullets()` / `kv()` consistent text inside them
 *
 * Only standard Discord embeds, buttons, select menus and modals are used.
 */

export type NoticeKind =
  "success" | "error" | "warning" | "info" | "denied" | "pending";

const noticeStyle: Record<NoticeKind, { emoji: string; tone: Tone }> = {
  success: { emoji: "✅", tone: "success" },
  error: { emoji: "❌", tone: "danger" },
  warning: { emoji: "⚠️", tone: "warning" },
  info: { emoji: "💬", tone: "info" },
  denied: { emoji: "🔒", tone: "danger" },
  pending: { emoji: "⏳", tone: "info" },
};

/** A compact result card: what happened, and what to do next if anything. */
export function notice(
  kind: NoticeKind,
  title: string,
  body?: string,
  fields?: { name: string; value: string; inline?: boolean }[],
): EmbedBuilder {
  const style = noticeStyle[kind];
  return card({
    title,
    emoji: style.emoji,
    tone: style.tone,
    ...(body ? { description: body } : {}),
    ...(fields?.length ? { fields } : {}),
    footer: "KUSH",
  });
}

/** `notice()` wrapped as a reply, for `context.reply(...)` and friends. */
export const say = (
  kind: NoticeKind,
  title: string,
  body?: string,
  extra: Pick<BotReply, "components"> = {},
): BotReply => ({ embeds: [notice(kind, title, body)], ...extra });

export interface Section {
  heading: string;
  emoji?: string;
  body: string | readonly string[];
}

/** A pinned channel post: intro, then sections with bold headings. */
export function panel(input: {
  title: string;
  emoji: string;
  tone?: Tone;
  intro?: string;
  sections?: readonly Section[];
  fields?: { name: string; value: string; inline?: boolean }[];
  /** Main posts only (welcome, services, commissions, careers). */
  banner?: boolean;
  footer?: string;
}): EmbedBuilder {
  const blocks = [
    ...(input.intro ? [input.intro] : []),
    ...(input.sections ?? []).map(
      (section) =>
        `**${section.emoji ? `${section.emoji} ` : ""}${section.heading}**\n${
          typeof section.body === "string"
            ? section.body
            : section.body.join("\n")
        }`,
    ),
  ];
  return card({
    title: input.title,
    emoji: input.emoji,
    tone: input.tone ?? "brand",
    description: blocks.join("\n\n"),
    ...(input.fields ? { fields: input.fields } : {}),
    ...(input.banner ? { banner: true } : {}),
    ...(input.footer ? { footer: input.footer } : {}),
  });
}

export const steps = (items: readonly string[]) =>
  items.map((item, index) => `\`${index + 1}\` ${item}`).join("\n");

export const bullets = (items: readonly string[]) =>
  items.map((item) => `• ${item}`).join("\n");

/** Inline key/value fields (Discord shows three per row). */
export const kv = (pairs: Record<string, string | number>) =>
  Object.entries(pairs).map(([name, value]) => ({
    name,
    value: String(value) || "—",
    inline: true,
  }));

/** Slash command as a highlighted chip: `/ticket create`. */
export const cmd = (name: string) => `\`/${name}\``;

/** A channel mention, or its plain name when the ID isn't configured. */
export const channel = (ids: Record<string, string>, key: string) => {
  const id = ids[key];
  return id ? `<#${id}>` : `#${key.split(":").pop()}`;
};

const styles = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
} as const;

export type Action = {
  label: string;
  emoji?: string;
  style?: keyof typeof styles;
} & ({ id: string } | { url: string });

/** One row of up to five buttons. Links always render as link buttons. */
export function actions(...items: Action[]) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...items.slice(0, 5).map((item) => {
      const button = new ButtonBuilder().setLabel(item.label);
      if (item.emoji) button.setEmoji(item.emoji);
      return "url" in item
        ? button.setURL(item.url).setStyle(ButtonStyle.Link)
        : button
            .setCustomId(item.id)
            .setStyle(styles[item.style ?? "secondary"]);
    }),
  );
}
