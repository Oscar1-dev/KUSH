import { ticketCategories } from "../src/tickets/categories.js";
import { describe, expect, it } from "vitest";
import { blueprint } from "../src/blueprint.js";
import { channelContent } from "../src/content/channel-content.js";
import {
  planContent,
  publishContent,
  renderContentPreview,
  type ContentAdapter,
} from "../src/content/publisher.js";
import {
  HONEYPOT_CHANNEL_KEY,
  HoneypotTracker,
  defaultHoneypotPolicy,
  isHoneypotExempt,
} from "../src/moderation/honeypot.js";
import type { RoleKey } from "../src/blueprint.js";
import type { BotReply } from "../src/runtime/command.js";

class FakeContent implements ContentAdapter {
  messages = new Map<
    string,
    { channelId: string; reply: BotReply; pinned: boolean }
  >();
  calls: string[] = [];
  failOn?: string;
  #next = 700000000000000000n;
  async messageExists(_channelId: string, messageId: string) {
    return this.messages.has(messageId);
  }
  async send(channelId: string, reply: BotReply) {
    if (this.failOn === channelId) throw new Error("simulated failure");
    const id = String(this.#next++);
    this.messages.set(id, { channelId, reply, pinned: false });
    this.calls.push(`send ${channelId}`);
    return id;
  }
  async edit(channelId: string, messageId: string, reply: BotReply) {
    this.messages.get(messageId)!.reply = reply;
    this.calls.push(`edit ${channelId}`);
  }
  async pin(_channelId: string, messageId: string) {
    this.messages.get(messageId)!.pinned = true;
    this.calls.push("pin");
  }
}

// Every v2 channel gets a fake ID.
const channelIds = Object.fromEntries(
  blueprint.channels.map((channel, index) => [
    channel.key,
    `6${String(index).padStart(17, "0")}`,
  ]),
);

describe("official channel content", () => {
  it("targets only channels that exist in the blueprint", () => {
    const keys = new Set(blueprint.channels.map((channel) => channel.key));
    for (const message of channelContent)
      expect(keys.has(message.channelKey), message.id).toBe(true);
    expect(new Set(channelContent.map((message) => message.id)).size).toBe(
      channelContent.length,
    );
  });

  it("never advertises unfinished features as available", () => {
    const text = JSON.stringify(
      channelContent.map((message) => message.build()),
    );
    for (const unfinished of ["!downloads", "!guide", "!licenses"])
      if (text.includes(unfinished))
        expect(text).toMatch(
          new RegExp(
            `${unfinished.replace("!", "\\!")}[^]{0,120}not available yet`,
          ),
        );
    // No prices, products or partner application buttons are invented.
    expect(text).not.toMatch(/£\s?\d|\$\s?\d/);
    expect(text).not.toContain("partner:apply:");
  });

  it("only uses buttons that have working handlers", () => {
    const handled = [
      "ticket:open",
      "onboarding:accept",
      // Every category button (handled by the ticket:open:<key> route).
      ...ticketCategories.map((c) => `ticket:open:${c.key}`),
    ];
    for (const message of channelContent)
      for (const row of message.build().components ?? []) {
        const json = ("toJSON" in row ? row.toJSON() : row) as {
          components: { custom_id?: string }[];
        };
        for (const component of json.components)
          expect(handled, `${message.id}:${component.custom_id}`).toContain(
            component.custom_id,
          );
      }
  });

  it("posts and pins once, then edits in place without duplicates", async () => {
    const discord = new FakeContent();
    const first = await publishContent(channelContent, channelIds, {}, discord);
    expect(first.errors).toEqual([]);
    expect(
      discord.calls.filter((call) => call.startsWith("send")),
    ).toHaveLength(channelContent.length);
    expect(
      [...discord.messages.values()].filter((item) => item.pinned),
    ).toHaveLength(channelContent.filter((message) => message.pin).length);
    discord.calls = [];
    const second = await publishContent(
      channelContent,
      channelIds,
      first.published,
      discord,
    );
    expect(discord.calls.every((call) => call.startsWith("edit"))).toBe(true);
    expect(discord.messages.size).toBe(channelContent.length);
    expect(second.published).toEqual(first.published);
  });

  it("reposts if a published message was deleted, and skips missing channels", async () => {
    const discord = new FakeContent();
    const first = await publishContent(channelContent, channelIds, {}, discord);
    const [deletedId] = Object.values(first.published).map(
      (item) => item.messageId,
    );
    discord.messages.delete(deletedId!);
    const plan = await planContent(
      channelContent,
      channelIds,
      first.published,
      discord,
    );
    expect(plan.filter((action) => action.action === "post")).toHaveLength(1);
    const partial = await planContent(channelContent, {}, {}, discord);
    expect(partial.every((action) => action.action === "skip")).toBe(true);
  });

  it("keeps the published map after a partial failure", async () => {
    const discord = new FakeContent();
    discord.failOn = channelIds["support:create-ticket"];
    const result = await publishContent(
      channelContent,
      channelIds,
      {},
      discord,
    );
    expect(result.errors.map((error) => error.id)).toEqual([
      "create-ticket.panel",
    ]);
    expect(Object.keys(result.published)).toHaveLength(
      channelContent.length - 1,
    );
  });

  it("renders a reviewable preview", () => {
    const preview = renderContentPreview(channelContent, {});
    expect(preview).toContain("#rules");
    expect(preview).toContain("[I have read and accept the rules]");
    expect(preview).toContain("not created yet");
  });
});

describe("honeypot", () => {
  const actor = (roles: RoleKey[], isGuildOwner = false) => ({
    userId: "1",
    displayName: "x",
    roles: new Set(roles),
    isGuildOwner,
  });

  it("exists in the blueprint as a member-writable channel", () => {
    expect(
      blueprint.channels.some(
        (channel) => channel.key === HONEYPOT_CHANNEL_KEY,
      ),
    ).toBe(true);
  });

  it("exempts staff and the owner but not members, customers or partners", () => {
    expect(isHoneypotExempt(actor(["member", "moderator"]))).toBe(true);
    expect(isHoneypotExempt(actor(["member", "support-staff"]))).toBe(true);
    expect(isHoneypotExempt(actor([], true))).toBe(true);
    expect(isHoneypotExempt(actor(["member"]))).toBe(false);
    expect(
      isHoneypotExempt(
        actor(["member", "verified-customer", "approved-seller"]),
      ),
    ).toBe(false);
  });
});

describe("honeypot escalation", () => {
  it("does not restrict a single accidental post", () => {
    const tracker = new HoneypotTracker();
    const first = tracker.record("u1");
    expect(first).toEqual({ strikes: 1, restrict: false });
    expect(tracker.record("u1").restrict).toBe(false);
  });

  it("restricts only after repeated triggers inside the window", () => {
    const now = 0;
    const tracker = new HoneypotTracker(defaultHoneypotPolicy, () => now);
    expect(tracker.record("u2").restrict).toBe(false);
    expect(tracker.record("u2").restrict).toBe(false);
    const third = tracker.record("u2");
    expect(third.restrict).toBe(true);
    expect(third.strikes).toBe(defaultHoneypotPolicy.strikesBeforeTimeout);
  });

  it("forgives strikes once the window passes", () => {
    let now = 0;
    const tracker = new HoneypotTracker(defaultHoneypotPolicy, () => now);
    tracker.record("u3");
    tracker.record("u3");
    now += defaultHoneypotPolicy.windowMs + 1;
    expect(tracker.record("u3")).toEqual({ strikes: 1, restrict: false });
  });

  it("tracks members independently", () => {
    const tracker = new HoneypotTracker();
    tracker.record("a");
    tracker.record("a");
    expect(tracker.record("b").restrict).toBe(false);
  });

  it("rate limits moderator notifications per member", () => {
    let now = 0;
    const tracker = new HoneypotTracker(defaultHoneypotPolicy, () => now);
    expect(tracker.shouldNotify("u4")).toBe(true);
    expect(tracker.shouldNotify("u4")).toBe(false);
    expect(tracker.shouldNotify("other")).toBe(true);
    now += defaultHoneypotPolicy.notifyEveryMs + 1;
    expect(tracker.shouldNotify("u4")).toBe(true);
  });

  it("bounds memory when swept", () => {
    let now = 0;
    const tracker = new HoneypotTracker(defaultHoneypotPolicy, () => now);
    tracker.record("u5");
    now += defaultHoneypotPolicy.windowMs + 1;
    tracker.sweep();
    expect(tracker.record("u5").strikes).toBe(1);
  });
});
