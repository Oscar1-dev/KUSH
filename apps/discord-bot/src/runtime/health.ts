import { createServer, type Server } from "node:http";

export type ComponentState = "unknown" | "ok" | "degraded" | "down";

export interface HealthSnapshot {
  status: ComponentState;
  startedAt: string;
  uptimeSeconds: number;
  gateway: {
    state: ComponentState;
    readyAt: string | null;
    reconnects: number;
    /** Most recent gateway close, to tell routine resumes from real faults. */
    lastDisconnect: { at: string; code: number } | null;
  };
  guild: { state: ComponentState; id: string };
  api: {
    state: ComponentState;
    checkedAt: string | null;
    detail: string | null;
  };
  prefixCommands: { enabled: boolean; reason: string | null };
  automation: {
    memberEvents: boolean;
    roleSync: {
      processed: number;
      failed: number;
      lastRunAt: string | null;
      lastError: string | null;
    } | null;
    notifications: {
      delivered: number;
      undeliverable: number;
      failed: number;
      lastRunAt: string | null;
      lastError: string | null;
    } | null;
  };
  commands: { succeeded: number; failed: number };
  lastError: string | null;
}

/**
 * Tracks what is actually known. Partial states are reported as degraded,
 * never as healthy. Contains no secrets, member data or message content.
 */
export class HealthMonitor {
  readonly #startedAt: number;
  #gateway: HealthSnapshot["gateway"] = {
    state: "unknown",
    readyAt: null,
    reconnects: 0,
    lastDisconnect: null,
  };
  #guild: ComponentState = "unknown";
  #api: HealthSnapshot["api"] = {
    state: "unknown",
    checkedAt: null,
    detail: null,
  };
  #prefix: HealthSnapshot["prefixCommands"] = {
    enabled: false,
    reason: "not started",
  };
  #commands = { succeeded: 0, failed: 0 };
  #memberEvents = false;
  #roleSync: (() => HealthSnapshot["automation"]["roleSync"]) | null = null;
  #notifications: (() => HealthSnapshot["automation"]["notifications"]) | null =
    null;
  #lastError: string | null = null;

  constructor(
    private readonly guildId: string,
    private readonly now: () => number = Date.now,
  ) {
    this.#startedAt = now();
  }

  gatewayReady() {
    this.#gateway = {
      ...this.#gateway,
      state: "ok",
      readyAt: new Date(this.now()).toISOString(),
    };
  }
  gatewayDisconnected(code?: number) {
    this.#gateway = {
      ...this.#gateway,
      state: "down",
      lastDisconnect:
        code === undefined
          ? this.#gateway.lastDisconnect
          : { at: new Date(this.now()).toISOString(), code },
    };
  }
  gatewayReconnecting() {
    this.#gateway = {
      ...this.#gateway,
      state: "degraded",
      reconnects: this.#gateway.reconnects + 1,
    };
  }
  guildAvailable(available: boolean) {
    this.#guild = available ? "ok" : "down";
  }
  apiChecked(ok: boolean, detail: string | null = null) {
    this.#api = {
      state: ok ? "ok" : "down",
      checkedAt: new Date(this.now()).toISOString(),
      detail,
    };
  }
  prefixCommands(enabled: boolean, reason: string | null = null) {
    this.#prefix = { enabled, reason };
  }
  memberEvents(enabled: boolean) {
    this.#memberEvents = enabled;
  }
  roleSync(stats: () => HealthSnapshot["automation"]["roleSync"]) {
    this.#roleSync = stats;
  }
  notifications(stats: () => HealthSnapshot["automation"]["notifications"]) {
    this.#notifications = stats;
  }
  recordCommand(succeeded: boolean) {
    if (succeeded) this.#commands.succeeded += 1;
    else this.#commands.failed += 1;
  }
  recordError(message: string) {
    this.#lastError = message.slice(0, 200);
  }

  snapshot(): HealthSnapshot {
    const parts = [this.#gateway.state, this.#guild, this.#api.state];
    const status: ComponentState = parts.every((part) => part === "ok")
      ? "ok"
      : parts.includes("down")
        ? parts.every((part) => part === "down")
          ? "down"
          : "degraded"
        : parts.includes("unknown")
          ? "unknown"
          : "degraded";
    return {
      status,
      startedAt: new Date(this.#startedAt).toISOString(),
      uptimeSeconds: Math.floor((this.now() - this.#startedAt) / 1000),
      gateway: { ...this.#gateway },
      guild: { state: this.#guild, id: this.guildId },
      api: { ...this.#api },
      prefixCommands: { ...this.#prefix },
      automation: {
        memberEvents: this.#memberEvents,
        roleSync: this.#roleSync ? { ...this.#roleSync()! } : null,
        notifications: this.#notifications
          ? { ...this.#notifications()! }
          : null,
      },
      commands: { ...this.#commands },
      lastError: this.#lastError,
    };
  }
}

/** Loopback-only JSON health endpoint for the supervisor and KUSH Developer. */
export function startHealthServer(
  monitor: HealthMonitor,
  port: number,
  host = "127.0.0.1",
): Promise<Server> {
  const server = createServer((request, response) => {
    if (request.method !== "GET" || request.url !== "/health") {
      response.writeHead(404).end();
      return;
    }
    const snapshot = monitor.snapshot();
    response
      .writeHead(snapshot.status === "ok" ? 200 : 503, {
        "content-type": "application/json",
        "cache-control": "no-store",
      })
      .end(JSON.stringify(snapshot));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}
