import { describe, expect, it } from "vitest";
import {
  NotificationWorker,
  type NotificationApi,
  type NotificationGateway,
  type NotificationJob,
  type SendResult,
} from "../src/automation/notifications.js";
import { createLogger } from "../src/runtime/logger.js";

class FakeApi implements NotificationApi {
  jobs: NotificationJob[] = [];
  finished: { id: string; ok: boolean; error?: string }[] = [];
  async notificationJobs() {
    const due = this.jobs;
    this.jobs = [];
    return due;
  }
  async finishNotificationJob(
    id: string,
    outcome: { ok: true } | { ok: false; error: string },
  ) {
    this.finished.push({
      id,
      ok: outcome.ok,
      ...(outcome.ok ? {} : { error: outcome.error }),
    });
  }
}

class FakeGateway implements NotificationGateway {
  sent: { to: string; content: string }[] = [];
  result: SendResult = "sent";
  fail: Error | null = null;
  async sendToChannel(channelId: string, content: string) {
    if (this.fail) throw this.fail;
    this.sent.push({ to: `channel:${channelId}`, content });
    return this.result;
  }
  async createApplicationChannel(input: { applicationId: string }) {
    if (this.fail) throw this.fail;
    this.sent.push({ to: `create:${input.applicationId}`, content: "" });
    return this.result;
  }
  member = true;
  async createTicketChannel(delivery: { ticketId: string }) {
    if (this.fail) throw this.fail;
    if (!this.member) return "absent" as const;
    this.sent.push({ to: `ticket:${delivery.ticketId}`, content: "" });
    return this.result;
  }
  async grantRole(userId: string, roleId: string) {
    if (this.fail) throw this.fail;
    this.sent.push({ to: `grant:${userId}:${roleId}`, content: "" });
    return this.result;
  }
  async sendDm(userId: string, content: string) {
    if (this.fail) throw this.fail;
    this.sent.push({ to: `dm:${userId}`, content });
    return this.result;
  }
}

const setup = () => {
  const api = new FakeApi();
  const gateway = new FakeGateway();
  const worker = new NotificationWorker(
    api,
    gateway,
    () => ({ "staff:ticket-queue": "111111111111111111" }),
    createLogger(() => undefined),
  );
  return { api, gateway, worker };
};

describe("notification worker", () => {
  it("delivers each target and confirms the job", async () => {
    const { api, gateway, worker } = setup();
    api.jobs = [
      {
        id: "a",
        kind: "ticket.created",
        delivery: {
          target: "channel",
          channelKey: "staff:ticket-queue",
          content: "new",
        },
      },
      {
        id: "b",
        kind: "ticket.message",
        delivery: {
          target: "ticket_channel",
          channelId: "222222222222222222",
          content: "reply",
        },
      },
      {
        id: "c",
        kind: "ticket.status",
        delivery: {
          target: "dm",
          discordUserId: "333333333333333333",
          content: "resolved",
        },
      },
      {
        id: "d",
        kind: "ticket.message",
        delivery: { target: "none", reason: "no channel" },
      },
    ];
    expect(await worker.tick()).toBe(4);
    expect(gateway.sent.map((s) => s.to)).toEqual([
      "channel:111111111111111111",
      "channel:222222222222222222",
      "dm:333333333333333333",
    ]);
    expect(api.finished.every((f) => f.ok)).toBe(true);
    expect(worker.stats.delivered).toBe(3);
  });

  it("does not retry permanent failures such as closed DMs", async () => {
    const { api, gateway, worker } = setup();
    gateway.result = "undeliverable";
    api.jobs = [
      {
        id: "a",
        kind: "ticket.status",
        delivery: {
          target: "dm",
          discordUserId: "333333333333333333",
          content: "x",
        },
      },
    ];
    await worker.tick();
    expect(api.finished).toEqual([{ id: "a", ok: true }]);
    expect(worker.stats.undeliverable).toBe(1);
  });

  it("reports transient failures back for retry", async () => {
    const { api, gateway, worker } = setup();
    gateway.fail = new Error("Discord 503");
    api.jobs = [
      {
        id: "a",
        kind: "ticket.created",
        delivery: {
          target: "channel",
          channelKey: "staff:ticket-queue",
          content: "x",
        },
      },
    ];
    await worker.tick();
    expect(api.finished).toEqual([
      { id: "a", ok: false, error: "Discord 503" },
    ]);
    expect(worker.stats).toMatchObject({ failed: 1, lastError: "Discord 503" });
  });

  it("treats an unconfigured channel as an error, not a silent success", async () => {
    const { api, worker } = setup();
    api.jobs = [
      {
        id: "a",
        kind: "commission.created",
        delivery: {
          target: "channel",
          channelKey: "staff:missing",
          content: "x",
        },
      },
    ];
    await worker.tick();
    expect(api.finished[0]).toMatchObject({ ok: false });
    expect(api.finished[0]!.error).toContain("staff:missing");
  });

  it("opens ticket channels, or posts the fallback for non-members", async () => {
    const { api, gateway, worker } = setup();
    const job = (id: string) => ({
      id,
      kind: "ticket.created",
      delivery: {
        target: "create_ticket_channel" as const,
        ticketId: `t-${id}`,
        number: 1,
        category: "technical",
        priority: "normal",
        queue: "support" as const,
        customerDiscordId: "333333333333333333",
        fallback: {
          target: "channel" as const,
          channelKey: "staff:ticket-queue",
          content: "fallback",
        },
      },
    });
    api.jobs = [job("a")];
    await worker.tick();
    gateway.member = false;
    api.jobs = [job("b")];
    await worker.tick();
    expect(gateway.sent.map((s) => s.to)).toEqual([
      "ticket:t-a",
      "channel:111111111111111111",
    ]);
    expect(api.finished.every((f) => f.ok)).toBe(true);
  });

  it("skips overlapping runs", async () => {
    const { api, worker } = setup();
    api.jobs = [
      {
        id: "a",
        kind: "ticket.created",
        delivery: { target: "none", reason: "x" },
      },
    ];
    const [first, second] = await Promise.all([worker.tick(), worker.tick()]);
    expect(first + second).toBe(1);
  });
});
