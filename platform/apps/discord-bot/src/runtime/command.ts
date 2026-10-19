import { randomUUID } from "node:crypto";
import type { BaseMessageOptions } from "discord.js";
import { ApiError } from "../api-client.js";
import type { RuntimeConfig } from "../config.js";
import type { ObservedGuild } from "../provisioning.js";
import {
  hasAuthority,
  isRestricted,
  type Actor,
  type Authority,
} from "./authority.js";
import type { HealthMonitor } from "./health.js";
import type { Logger } from "./logger.js";
import { resolvePath, type Routable } from "./prefix.js";
import { SlidingWindowLimiter } from "./rate-limit.js";

export type BotReply = Pick<
  BaseMessageOptions,
  "content" | "embeds" | "components" | "files"
>;
export type PrivateDelivery = "dm" | "ephemeral" | "unavailable";

export interface AuditEvent {
  action: string;
  actorId: string;
  outcome: "ok" | "denied" | "error";
  detail?: Record<string, string | number | boolean>;
}

/** Everything a command needs, injected so handlers are testable. */
export interface BotServices {
  config: RuntimeConfig;
  componentSecret: string;
  health: HealthMonitor;
  log: Logger;
  now(): number;
  observeGuild(): Promise<ObservedGuild>;
  /** Wakes the role-sync worker (set once automation starts). */
  kickRoleSync?: () => void;
  /** Private staff-application channels (set once the bot is running). */
  applications?: import("../automation/applications.js").ApplicationChannels;
  /** Discord moderation actions (set once the bot is running). */
  moderation?: import("../moderation/commands.js").ModerationGateway;
  /** Private ticket channels (mapping, access sync, recovery). */
  tickets: import("../tickets/manager.js").TicketManager;
  /** Role IDs of a guild member, or null if they are not in the guild. */
  memberRoleIds(userId: string): Promise<string[] | null>;
  /** When the account was created and joined the server (referral checks). */
  memberDates?: (
    userId: string,
  ) => Promise<{ createdAt: Date; joinedAt: Date } | null>;
  audit(event: AuditEvent): void;
  /** Backend gateway (KUSH API). Typed loosely here; see api-client.ts. */
  api: import("../api-client.js").DiscordApiClient;
}

export interface CommandContext {
  source: "prefix" | "slash";
  actor: Actor;
  guildId: string;
  channelId: string;
  /** The Discord message or interaction ID: a stable key for retries. */
  invocationId?: string;
  args: string[];
  /** Prefix: visible in the channel. Slash: ephemeral. Never put private data here. */
  reply(message: BotReply): Promise<void>;
  /** Prefix: direct message. Slash: ephemeral. Use for anything account-specific. */
  replyPrivately(message: BotReply): Promise<PrivateDelivery>;
  services: BotServices;
  registry: readonly CommandDefinition[];
  /** Prefix only: deletes the invoking message (used for staff notes). */
  deleteTrigger?: () => Promise<void>;
}

export type CommandGroup =
  | "Community"
  | "Customers"
  | "Partners"
  | "Support staff"
  | "Moderation"
  | "Administration";

export interface SlashOption {
  name: string;
  description: string;
  required?: boolean;
  /**
   * How Discord asks for it. Values still reach the handler as text args,
   * so prefix and slash share one parser: a member becomes `<@id>` and a
   * ticket number becomes `#42`.
   */
  type?: "string" | "integer" | "user" | "ticket";
  choices?: readonly { name: string; value: string }[];
  minValue?: number;
  maxValue?: number;
}

export interface CommandDefinition extends Routable {
  summary: string;
  usage: string;
  group: CommandGroup;
  authority: Authority;
  /** Restricted members may still use this (help, rules, tickets for appeals). */
  allowRestricted?: boolean;
  /** Extra per-user cooldown for this command. */
  cooldownMs?: number;
  options?: SlashOption[];
  /** Set when the backing workflow is not connected yet; shown in !help. */
  unavailable?: string;
  run(context: CommandContext): Promise<void>;
}

/** Maps expected API refusals to safe, actionable text; null for real faults. */
export function friendlyApiError(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 404 || error.status === 403)
    return "That ticket or action is not available to you. If you are staff, check that your Discord account is linked to your KUSH staff account.";
  if (error.status === 401)
    return "KUSH could not authenticate the bot. Staff have been notified in the logs.";
  if ([400, 409, 429].includes(error.status)) return error.message;
  return null;
}

/** A user-facing failure; its message is safe to show. */
export class CommandError extends Error {}

export const usageError = (command: CommandDefinition) =>
  new CommandError(`Usage: \`${command.usage}\``);

export class CommandRouter {
  readonly #perUser: SlidingWindowLimiter;
  readonly #perCommand = new Map<string, SlidingWindowLimiter>();

  constructor(
    readonly commands: readonly CommandDefinition[],
    private readonly now: () => number = Date.now,
  ) {
    this.#perUser = new SlidingWindowLimiter(5, 10_000, now);
  }

  resolve(tokens: readonly string[]) {
    return resolvePath(tokens, this.commands);
  }

  visibleTo(actor: Actor): CommandDefinition[] {
    return this.commands.filter(
      (command) =>
        hasAuthority(actor, command.authority) &&
        (!isRestricted(actor) || command.allowRestricted),
    );
  }

  async dispatch(
    command: CommandDefinition,
    context: Omit<CommandContext, "registry">,
  ): Promise<"ok" | "denied" | "limited" | "error"> {
    const full: CommandContext = { ...context, registry: this.commands };
    const name = `!${command.path.join(" ")}`;
    const { actor, services } = full;
    const privileged = !["everyone", "member"].includes(command.authority);

    if (isRestricted(actor) && !command.allowRestricted) {
      await full.reply({
        content: `Your account is restricted, so ${name} is unavailable. Open a ticket with !ticket if you want to appeal.`,
      });
      return "denied";
    }
    if (!hasAuthority(actor, command.authority)) {
      if (privileged)
        services.audit({
          action: name,
          actorId: actor.userId,
          outcome: "denied",
        });
      await full.reply({ content: `You do not have access to ${name}.` });
      return "denied";
    }

    const userLimit = this.#perUser.take(actor.userId);
    const cooldown = command.cooldownMs
      ? this.#limiterFor(command).take(actor.userId)
      : { allowed: true, retryAfterMs: 0 };
    if (!userLimit.allowed || !cooldown.allowed) {
      if (this.#perUser.shouldWarn(actor.userId)) {
        const seconds = Math.ceil(
          Math.max(userLimit.retryAfterMs, cooldown.retryAfterMs) / 1000,
        );
        await full.reply({
          content: `Slow down — try again in ${seconds}s.`,
        });
      }
      return "limited";
    }

    try {
      await command.run(full);
      services.health.recordCommand(true);
      if (privileged)
        services.audit({ action: name, actorId: actor.userId, outcome: "ok" });
      return "ok";
    } catch (error) {
      if (error instanceof CommandError) {
        await full.reply({ content: error.message });
        return "error";
      }
      const friendly = friendlyApiError(error);
      if (friendly) {
        await full.reply({ content: friendly });
        return "error";
      }
      const incident = randomUUID().slice(0, 8);
      services.health.recordCommand(false);
      services.log.error("command.failed", {
        command: name,
        incident,
        actorId: actor.userId,
        error: error instanceof Error ? error.message : "unknown",
      });
      if (privileged)
        services.audit({
          action: name,
          actorId: actor.userId,
          outcome: "error",
          detail: { incident },
        });
      await full
        .reply({
          content: `KUSH could not complete ${name}. Nothing private was posted. Reference: ${incident}.`,
        })
        .catch(() => undefined);
      return "error";
    }
  }

  sweep(): void {
    this.#perUser.sweep();
    for (const limiter of this.#perCommand.values()) limiter.sweep();
  }

  #limiterFor(command: CommandDefinition) {
    const key = command.path.join(" ");
    let limiter = this.#perCommand.get(key);
    if (!limiter) {
      limiter = new SlidingWindowLimiter(1, command.cooldownMs!, this.now);
      this.#perCommand.set(key, limiter);
    }
    return limiter;
  }
}
