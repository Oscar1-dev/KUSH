import {
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from "discord.js";
import type { Authority } from "./runtime/authority.js";
import type { CommandDefinition, SlashOption } from "./runtime/command.js";
import { commands } from "./runtime/registry.js";

/**
 * Slash-command fallbacks generated from the `!` command registry, so both
 * entry points share one definition. Replies to slash commands are
 * ephemeral, which makes them the private fallback when DMs are closed.
 */

export const ARGUMENTS_OPTION = "arguments";

/** Options a command takes in slash form. */
export function slashOptions(command: CommandDefinition): SlashOption[] {
  if (command.options) return command.options;
  return /[<@]/.test(command.usage)
    ? [{ name: ARGUMENTS_OPTION, description: "Command arguments" }]
    : [];
}

// Visibility hint only; every handler re-checks authority itself.
const defaultPermission: Partial<Record<Authority, bigint>> = {
  administrator: PermissionFlagsBits.ManageGuild,
  moderator: PermissionFlagsBits.ModerateMembers,
  owner: PermissionFlagsBits.Administrator,
};

const describe = (text: string) => text.slice(0, 100);

const addOptions = (
  builder: SlashCommandBuilder | SlashCommandSubcommandBuilder,
  options: SlashOption[],
) => {
  for (const option of options) {
    if (option.type === "user")
      builder.addUserOption((item) =>
        item
          .setName(option.name)
          .setDescription(describe(option.description))
          .setRequired(Boolean(option.required)),
      );
    else if (option.type === "integer" || option.type === "ticket")
      builder.addIntegerOption((item) => {
        item
          .setName(option.name)
          .setDescription(describe(option.description))
          .setRequired(Boolean(option.required));
        if (option.type === "ticket") item.setMinValue(1);
        if (option.minValue !== undefined) item.setMinValue(option.minValue);
        if (option.maxValue !== undefined) item.setMaxValue(option.maxValue);
        return item;
      });
    else
      builder.addStringOption((item) => {
        item
          .setName(option.name)
          .setDescription(describe(option.description))
          .setRequired(Boolean(option.required))
          .setMaxLength(1_000);
        if (option.choices?.length) item.addChoices(...option.choices);
        return item;
      });
  }
};

export function buildSlashCommands(registry: readonly CommandDefinition[]) {
  const roots = new Map<string, CommandDefinition[]>();
  for (const command of registry)
    roots.set(command.path[0]!, [
      ...(roots.get(command.path[0]!) ?? []),
      command,
    ]);

  return [...roots].map(([root, members]) => {
    const builder = new SlashCommandBuilder()
      .setName(root)
      .setContexts(InteractionContextType.Guild);
    const strictest = members
      .map((member) => defaultPermission[member.authority])
      .find((permission) => permission !== undefined);
    if (
      strictest !== undefined &&
      members.every(
        (member) => defaultPermission[member.authority] !== undefined,
      )
    )
      builder.setDefaultMemberPermissions(strictest);

    const single = members.find((member) => member.path.length === 1);
    const nested = members.filter((member) => member.path.length === 2);
    if (nested.length && !single) {
      builder.setDescription(describe(`KUSH ${root} commands`));
      for (const member of nested)
        builder.addSubcommand((sub) => {
          sub.setName(member.path[1]!).setDescription(describe(member.summary));
          addOptions(sub, slashOptions(member));
          return sub;
        });
    } else {
      // A root that is itself a command (e.g. /guide); nested forms such as
      // `!setup guide` are reached through their own root.
      builder.setDescription(describe(single!.summary));
      addOptions(builder, slashOptions(single!));
    }
    return builder;
  });
}

export const commandBuilders = buildSlashCommands(commands);
export const commandJson = commandBuilders.map((command) => command.toJSON());
