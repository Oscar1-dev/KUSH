import { describe, expect, it } from "vitest";
import { selfAssignableRoles } from "../src/blueprint.js";
import {
  navigatorAnswer,
  navigatorMenu,
  rolesPanel,
  roleToggleId,
  toggledRole,
} from "../src/ui/navigation.js";
import { notice, panel } from "../src/ui/kit.js";

const json = (value: unknown) => JSON.stringify(value);

describe("navigator", () => {
  const ids = {
    "studio:services": "100000000000000001",
    "support:faq": "100000000000000002",
  };
  const options = (
    navigatorMenu().toJSON().components[0] as unknown as {
      options: { value: string }[];
    }
  ).options.map((option) => option.value);

  it("answers every menu option privately with real channel mentions", () => {
    for (const option of options) {
      const answer = navigatorAnswer(option, ids);
      expect(answer.embeds?.length, option).toBe(1);
    }
    expect(json(navigatorAnswer("services", ids))).toContain(
      "<#100000000000000001>",
    );
    // Channels without a configured ID fall back to their name.
    expect(json(navigatorAnswer("help", {}))).toContain("#faq");
  });

  it("offers the commission and ticket buttons where they help", () => {
    expect(json(navigatorAnswer("commission", ids))).toContain(
      "ticket:open:commission",
    );
    expect(json(navigatorAnswer("help", ids))).toContain('"ticket:open"');
  });

  it("rejects values that aren't on the menu", () => {
    expect(json(navigatorAnswer("admin-panel", ids))).toContain(
      "Pick an option",
    );
  });
});

describe("notification roles", () => {
  it("only toggles the opt-in ping roles", () => {
    for (const key of selfAssignableRoles)
      expect(toggledRole(roleToggleId(key))).toBe(key);
    // A crafted button ID can never hand out a staff or customer role.
    for (const forged of [
      "administrator",
      "staff-manager",
      "verified-customer",
      "member",
      "kush-bot",
    ])
      expect(toggledRole(`roles:toggle:${forged}`)).toBeNull();
    expect(toggledRole("roles:toggle:")).toBeNull();
    expect(toggledRole("ticket:open")).toBeNull();
  });

  it("puts one button per opt-in role on the panel", () => {
    const panelJson = json(rolesPanel());
    for (const key of selfAssignableRoles)
      expect(panelJson).toContain(roleToggleId(key));
  });
});

describe("UI kit", () => {
  it("gives every notice kind a heading emoji and keeps bodies optional", () => {
    for (const kind of [
      "success",
      "error",
      "warning",
      "info",
      "denied",
      "pending",
    ] as const) {
      const card = notice(kind, "Title").toJSON();
      expect(card.title).toMatch(/^\S+ Title$/);
      expect(card.description).toBeUndefined();
    }
  });

  it("renders panel sections as bold headings in order", () => {
    const card = panel({
      title: "T",
      emoji: "🧪",
      intro: "Intro",
      sections: [
        { heading: "One", body: "a" },
        { heading: "Two", emoji: "✨", body: ["b", "c"] },
      ],
    }).toJSON();
    expect(card.description).toBe("Intro\n\n**One**\na\n\n**✨ Two**\nb\nc");
  });
});
