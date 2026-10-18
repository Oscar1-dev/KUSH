import { AuditLogEvent } from "discord.js";
import { describe, expect, it } from "vitest";
import { cardForEntry, welcomeCard } from "../src/moderation/mod-log.js";

const entry = (action: AuditLogEvent, extra: object = {}) => ({
  action,
  targetId: "500000000000000001",
  executorId: "600000000000000001",
  reason: "Spamming",
  changes: [],
  extra: null,
  ...extra,
});

describe("moderation log cards", () => {
  it("logs bans, kicks and unbans with user, moderator and reason", () => {
    const ban = cardForEntry(entry(AuditLogEvent.MemberBanAdd))!.toJSON();
    expect(ban.title).toBe("🔨 Member banned");
    const fields = Object.fromEntries(
      ban.fields!.map((f) => [f.name, f.value]),
    );
    expect(fields.User).toContain("500000000000000001");
    expect(fields.Moderator).toContain("600000000000000001");
    expect(fields.Reason).toBe("Spamming");
    expect(cardForEntry(entry(AuditLogEvent.MemberKick))!.toJSON().title).toBe(
      "👢 Member kicked",
    );
    expect(
      cardForEntry(entry(AuditLogEvent.MemberBanRemove))!.toJSON().title,
    ).toBe("♻️ Ban lifted");
  });

  it("logs timeouts with their end time, and their removal", () => {
    const until = "2026-10-18T12:00:00.000Z";
    const t = cardForEntry(
      entry(AuditLogEvent.MemberUpdate, {
        changes: [{ key: "communication_disabled_until", new: until }],
      }),
    )!.toJSON();
    expect(t.title).toBe("🔇 Member timed out");
    expect(JSON.stringify(t.fields)).toContain(
      `<t:${Date.parse(until) / 1000}:F>`,
    );
    const lifted = cardForEntry(
      entry(AuditLogEvent.MemberUpdate, {
        changes: [{ key: "communication_disabled_until", old: until }],
      }),
    )!.toJSON();
    expect(lifted.title).toBe("🔊 Timeout removed");
    // Other member updates (nickname etc.) are not logged.
    expect(
      cardForEntry(
        entry(AuditLogEvent.MemberUpdate, {
          changes: [{ key: "nick", new: "x" }],
        }),
      ),
    ).toBeNull();
  });

  it("logs moderator message deletions with the channel", () => {
    const d = cardForEntry(
      entry(AuditLogEvent.MessageDelete, {
        extra: { channel: { id: "700000000000000001" }, count: 3 },
      }),
    )!.toJSON();
    expect(d.title).toBe("🗑️ Message deleted");
    expect(JSON.stringify(d.fields)).toContain("<#700000000000000001>");
    expect(JSON.stringify(d.fields)).toContain('"value":"3"');
  });

  it("builds the member-joined welcome card", () => {
    const card = welcomeCard(
      {
        id: "500000000000000001",
        displayAvatarURL: () => "https://cdn.discordapp.com/avatars/x.png",
        user: { createdTimestamp: 1_700_000_000_000 },
        guild: { memberCount: 42 },
      } as never,
      { rules: "800000000000000001", support: "800000000000000002" },
    ).toJSON();
    expect(card.title).toBe("👋 Member joined");
    expect(card.description).toContain("<#800000000000000001>");
    expect(JSON.stringify(card.fields)).toContain('"value":"42"');
    expect(card.thumbnail?.url).toContain("avatars");
  });
});

import { notificationMessage } from "../src/panels.js";

describe("notification cards", () => {
  it("keeps a leading mention outside the card and the link in the body", () => {
    const m = notificationMessage(
      "<@500000000000000001> your application **#3** is now being reviewed. http://localhost:3000/account/applications/x",
    );
    expect(m.content).toBe("<@500000000000000001>");
    const e = m.embeds[0]!.toJSON();
    expect(e.title).toBe("your application #3 is now being reviewed.");
    expect(e.description).toContain(
      "http://localhost:3000/account/applications/x",
    );
  });
});
