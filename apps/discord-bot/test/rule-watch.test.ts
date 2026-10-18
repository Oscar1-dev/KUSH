import { describe, expect, it } from "vitest";
import {
  detect,
  parseRuleWatchButton,
  reportMessage,
  ruleWatchButtonId,
  RuleWatchTracker,
  type MessageFacts,
} from "../src/moderation/rule-watch.js";

const facts = (content: string, extra: Partial<MessageFacts> = {}) => ({
  content,
  userMentions: 0,
  roleMentions: 0,
  everyone: false,
  displayName: "Sam",
  ...extra,
});
const keys = (content: string, extra: Partial<MessageFacts> = {}) =>
  detect(facts(content, extra), ["kush"]).map((finding) => finding.key);

describe("rule watch detection", () => {
  it("flags each rule's clear patterns", () => {
    expect(keys("join my server discord.gg/coolserver")).toEqual(["invite"]);
    expect(keys("FREE NITRO claim here https://dlscord-gift.ru/x")).toContain(
      "scam",
    );
    expect(keys("here is my key ABCDE-12345-FGHIJ-67890-KLMNO")).toEqual([
      "licence-key",
    ]);
    expect(keys("anyone got a cracked version of photoshop")).toEqual([
      "piracy",
    ]);
    expect(keys("just kys honestly")).toEqual(["harassment"]);
    expect(keys("call me on +44 7700 900123")).toEqual(["private-info"]);
    expect(keys("hey", { userMentions: 6 })).toEqual(["mass-mention"]);
    expect(keys("hello", { displayName: "KUSH Staff" })).toEqual([
      "impersonation",
    ]);
    expect(keys("I need a refund for my order")).toEqual(["support-public"]);
  });

  it("stays quiet on normal conversation", () => {
    for (const text of [
      "this server is great, love the new release",
      "my user id is 1560640601676845146 if that helps",
      "order 123456789012 arrived fine thanks",
      "check discord.gg/kush for the invite",
      "the skills you have are killer",
      "nitro is expensive lol",
      "",
    ])
      expect(keys(text), text).toEqual([]);
  });
});

describe("rule watch tracker", () => {
  it("detects floods and repeats, and rate-limits reports", () => {
    const clock = { now: 0 };
    const tracker = new RuleWatchTracker(() => clock.now);
    let flood = null;
    for (let i = 0; i < 6; i++) {
      flood = tracker.flood("u1", `message ${i}`);
      clock.now += 500;
    }
    expect(flood?.key).toBe("flood");

    let repeat = null;
    for (let i = 0; i < 4; i++) {
      clock.now += 10_000;
      repeat = tracker.flood("u2", "BUY NOW");
    }
    expect(repeat?.detail).toContain("same message 4 times");

    expect(tracker.shouldReport("u1", "flood")).toBe(true);
    expect(tracker.shouldReport("u1", "flood")).toBe(false);
    clock.now += 11 * 60_000;
    expect(tracker.shouldReport("u1", "flood")).toBe(true);
  });
});

describe("rule watch reports", () => {
  const ids = {
    channelId: "12345678901234567",
    messageId: "22345678901234567",
    userId: "32345678901234567",
    rule: 4,
  };

  it("round-trips button IDs within Discord's limit", () => {
    const id = ruleWatchButtonId("timeout", ids);
    expect(id.length).toBeLessThanOrEqual(100);
    expect(parseRuleWatchButton(id)).toEqual({ action: "timeout", ...ids });
    expect(parseRuleWatchButton("rw:explode:1:2:3:4")).toBeNull();
  });

  it("builds a report with a jump link and four actions", () => {
    const report = reportMessage({
      findings: detect(facts("ABCDE-12345-FGHIJ-67890-KLMNO")),
      guildId: "42345678901234567",
      excerpt: "ABCDE-12345-FGHIJ-67890-KLMNO",
      ...ids,
    });
    const json = JSON.stringify(report.embeds[0]!.toJSON());
    expect(json).toContain("Rule 4");
    expect(json).toContain(
      "discord.com/channels/42345678901234567/12345678901234567/22345678901234567",
    );
    expect(report.components[0]!.components).toHaveLength(4);
  });
});
