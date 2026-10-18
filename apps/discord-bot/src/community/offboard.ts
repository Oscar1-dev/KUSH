import { configuredRoleId, staffRoles, type RoleKey } from "../blueprint.js";
import type { ModerationGateway } from "../moderation/commands.js";
import { card } from "../panels.js";

/**
 * The Discord half of offboarding, shared by `!offboard` and the website
 * (via the outbox), so both paths do exactly the same thing: remove every
 * staff role, tell the person, and log it in #bot-log. The API side
 * (record, hand work back to the queue) has already happened.
 */
export async function offboardInDiscord(
  gateway: ModerationGateway,
  config: {
    roleIds: Record<string, string>;
    channelIds: Record<string, string>;
  },
  input: {
    discordUserId: string;
    reason: string;
    byDiscordUserId: string | null;
    via: "discord" | "website";
    record: { ticketsUnassigned: number; commissionsUnassigned: number } | null;
  },
): Promise<{ removed: RoleKey[]; notified: boolean; present: boolean }> {
  const member = await gateway.member(input.discordUserId);
  const held = member
    ? staffRoles.filter((key) => {
        const id = configuredRoleId(config.roleIds, key);
        return id !== undefined && member.roleIds.includes(id);
      })
    : [];
  if (held.length)
    await gateway.removeRoles(
      input.discordUserId,
      held.map((key) => configuredRoleId(config.roleIds, key)!),
      `Offboarded (${input.via}): ${input.reason}`.slice(0, 500),
    );

  const notified = member
    ? await gateway
        .notify(
          input.discordUserId,
          card({
            emoji: "👋",
            title: "You've been offboarded from the KUSH team",
            tone: "info",
            description: [
              "Your staff roles and staff dashboard access have been removed.",
              "",
              "Your signed agreements (including any NDA) remain in effect.",
              "Thank you for your work with KUSH.",
            ].join("\n"),
            timestamp: true,
          }),
        )
        .catch(() => false)
    : false;

  const logChannel = config.channelIds["staff:bot-log"];
  if (logChannel)
    await gateway
      .post(
        logChannel,
        card({
          emoji: "📤",
          title: "Staff offboarded",
          tone: "warning",
          fields: [
            {
              name: "Member",
              value: `<@${input.discordUserId}>\n\`${input.discordUserId}\``,
              inline: true,
            },
            {
              name: "By",
              value: input.byDiscordUserId
                ? `<@${input.byDiscordUserId}>`
                : "KUSH",
              inline: true,
            },
            {
              name: "Roles removed",
              value: held.length ? held.join(", ") : "None held",
              inline: true,
            },
            {
              name: "Work handed back",
              value: input.record
                ? `${input.record.ticketsUnassigned} ticket(s), ${input.record.commissionsUnassigned} commission(s) returned to the queue`
                : "⚠️ Not recorded on the website; check the API logs",
            },
            { name: "Reason", value: input.reason.slice(0, 1_000) },
          ],
          footer: `KUSH • Team • via ${input.via}`,
          timestamp: true,
        }),
      )
      .catch(() => null);

  return { removed: held, notified, present: Boolean(member) };
}
