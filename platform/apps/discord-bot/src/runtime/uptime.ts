import type { EmbedBuilder } from "discord.js";
import { card } from "../panels.js";

/**
 * Uptime alerts for #operational-alerts.
 *
 * Each service is probed on a timer. It is reported down only after
 * `threshold` failures in a row (one slow response is not an outage), and
 * reported back up with how long it was down. Alerts are sent on state
 * changes only, so a long outage produces two messages, not hundreds.
 */

export interface UptimeCheck {
  name: string;
  /** Resolves true when healthy; a throw counts as unhealthy. */
  probe(): Promise<boolean>;
}

interface State {
  up: boolean;
  failures: number;
  firstFailureAt: number | null;
  downSince: number | null;
}

export const downtime = (ms: number) => {
  const seconds = Math.max(1, Math.round(ms / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
};

export class UptimeWatcher {
  readonly #states = new Map<string, State>();

  constructor(
    private readonly checks: UptimeCheck[],
    private readonly post: (message: EmbedBuilder) => Promise<void>,
    private readonly now: () => number = Date.now,
    private readonly threshold = 2,
  ) {
    for (const check of checks)
      this.#states.set(check.name, {
        up: true,
        failures: 0,
        firstFailureAt: null,
        downSince: null,
      });
  }

  /** Current view, for !status-style summaries and tests. */
  get states(): ReadonlyMap<string, Readonly<State>> {
    return this.#states;
  }

  async tick() {
    await Promise.all(this.checks.map((check) => this.#run(check)));
  }

  async #run(check: UptimeCheck) {
    const state = this.#states.get(check.name)!;
    const healthy = await check.probe().catch(() => false);
    const at = this.now();
    if (healthy) {
      if (!state.up && state.downSince !== null)
        await this.#send(
          card({
            emoji: "🟢",
            title: `${check.name} is back up`,
            tone: "success",
            fields: [
              {
                name: "Downtime",
                value: downtime(at - state.downSince),
                inline: true,
              },
              {
                name: "Since",
                value: `<t:${Math.floor(state.downSince / 1_000)}:t>`,
                inline: true,
              },
            ],
            footer: "KUSH • Uptime",
            timestamp: true,
          }),
        );
      Object.assign(state, {
        up: true,
        failures: 0,
        firstFailureAt: null,
        downSince: null,
      });
      return;
    }
    state.failures += 1;
    state.firstFailureAt ??= at;
    if (state.up && state.failures >= this.threshold) {
      state.up = false;
      state.downSince = state.firstFailureAt;
      await this.#send(
        card({
          emoji: "🔴",
          title: `${check.name} is down`,
          tone: "danger",
          description:
            "Failed its health check several times in a row. I'll post again when it recovers.",
          fields: [
            {
              name: "First failure",
              value: `<t:${Math.floor(state.firstFailureAt / 1_000)}:T>`,
              inline: true,
            },
            {
              name: "Checks failed",
              value: String(state.failures),
              inline: true,
            },
          ],
          footer: "KUSH • Uptime",
          timestamp: true,
        }),
      );
    }
  }

  async #send(message: EmbedBuilder) {
    // An alert that can't be posted must never break the watcher.
    await this.post(message).catch(() => undefined);
  }
}
