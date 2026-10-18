import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

/**
 * The staff NDA in Discord. The full text is attached as a file; the
 * applicant signs either here (modal) or on the website. Button IDs are not
 * user-bound: the API only accepts a signature from the agreement's owner
 * (their verified Discord link), so the button can stay in the channel.
 */

export const NDA_SIGN_PREFIX = "nda:sign:";
export const NDA_SUBMIT_PREFIX = "nda:submit:";
export const ACCEPT_PHRASE = "I ACCEPT";

/** Shown with the button; the API records the full acceptance statement. */
export const DISCORD_ACCEPTANCE =
  "I have read and understood the Non-Disclosure Agreement and agree to its terms. I intend my electronic signature to constitute my signature on this agreement.";

export function ndaPrompt(input: {
  agreementId: string;
  title: string;
  version: string;
  body: string;
  websiteUrl: string;
  discordUserId: string;
}) {
  const file = new AttachmentBuilder(Buffer.from(input.body, "utf8"), {
    name: `kush-staff-nda-${input.version}.txt`,
    description: `${input.title} (${input.version})`,
  });
  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle("📜 Your KUSH Staff NDA")
    .setDescription(
      [
        `<@${input.discordUserId}>, you've been **conditionally accepted**. 🎉`,
        "",
        "Before your role is confirmed, please **read the attached agreement in full**.",
        "",
        "**Sign it whichever way suits you:**",
        "✍️ **In Discord**: press *Sign in Discord* and fill in the form.",
        "🌐 **On the website**: sign in with this Discord account.",
        "",
        "Either way it's the same record: you can download a PDF copy from your KUSH account afterwards.",
        "",
        `> ${DISCORD_ACCEPTANCE}`,
      ].join("\n"),
    )
    .addFields(
      { name: "📄 Agreement", value: `${input.title}`, inline: true },
      { name: "🏷️ Version", value: input.version, inline: true },
    )
    .setFooter({
      text: "Draft pending professional legal review · Signing never grants a role by itself",
    });
  // Discord refuses link buttons to local addresses; until the website is
  // public, only the Discord option is offered as a button.
  const publicSite =
    /^https:\/\//.test(input.websiteUrl) &&
    !/localhost|127\.0\.0\.1/.test(input.websiteUrl);
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${NDA_SIGN_PREFIX}${input.agreementId}`)
      .setLabel("Sign in Discord")
      .setEmoji("✍️")
      .setStyle(ButtonStyle.Success),
    ...(publicSite
      ? [
          new ButtonBuilder()
            .setURL(input.websiteUrl)
            .setLabel("Sign on the website")
            .setEmoji("🌐")
            .setStyle(ButtonStyle.Link),
        ]
      : []),
  );
  return { embeds: [embed], components: [buttons], files: [file] };
}

export function ndaModal(agreementId: string) {
  const field = (id: string, label: string, placeholder: string, max: number) =>
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId(id)
        .setLabel(label)
        .setPlaceholder(placeholder)
        .setStyle(TextInputStyle.Short)
        .setMinLength(2)
        .setMaxLength(max)
        .setRequired(true),
    );
  return new ModalBuilder()
    .setCustomId(`${NDA_SUBMIT_PREFIX}${agreementId}`)
    .setTitle("Sign the KUSH Staff NDA")
    .addComponents(
      field("legalName", "Full legal name", "As on your ID", 120),
      field("email", "Email address", "you@example.com", 254),
      field(
        "signature",
        "Signature: type your full legal name again",
        "Must match exactly",
        120,
      ),
      field(
        "confirmation",
        `Type ${ACCEPT_PHRASE} to agree to the NDA`,
        ACCEPT_PHRASE,
        20,
      ),
    );
}
