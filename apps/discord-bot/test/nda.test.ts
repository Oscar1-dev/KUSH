import { describe, expect, it } from "vitest";
import {
  ACCEPT_PHRASE,
  NDA_SIGN_PREFIX,
  NDA_SUBMIT_PREFIX,
  ndaModal,
  ndaPrompt,
} from "../src/automation/nda.js";

const base = {
  agreementId: "11111111-2222-4333-8444-555555555555",
  title: "KUSH Staff Non-Disclosure Agreement",
  version: "1.0-draft",
  body: "FULL NDA TEXT",
  discordUserId: "500000000000000001",
};

describe("Discord NDA prompt", () => {
  it("attaches the full text and a sign button for that agreement", () => {
    const prompt = ndaPrompt({
      ...base,
      websiteUrl: "https://kush.example/account/agreements/x",
    });
    expect(prompt.files[0]!.name).toBe("kush-staff-nda-1.0-draft.txt");
    const buttons = prompt.components[0]!.toJSON().components as {
      custom_id?: string;
      url?: string;
    }[];
    expect(buttons[0]!.custom_id).toBe(`${NDA_SIGN_PREFIX}${base.agreementId}`);
    expect(buttons[1]!.url).toBe("https://kush.example/account/agreements/x");
  });

  it("omits the website button while the site is local-only", () => {
    const prompt = ndaPrompt({
      ...base,
      websiteUrl: "http://localhost:3000/account/agreements/x",
    });
    expect(prompt.components[0]!.toJSON().components).toHaveLength(1);
  });

  it("asks for name, email, matching signature and the exact phrase", () => {
    const modal = ndaModal(base.agreementId).toJSON() as unknown as {
      custom_id: string;
      components: { components: { custom_id: string; label: string }[] }[];
    };
    expect(modal.custom_id).toBe(`${NDA_SUBMIT_PREFIX}${base.agreementId}`);
    const ids = modal.components.map((row) => row.components[0]!.custom_id);
    expect(ids).toEqual(["legalName", "email", "signature", "confirmation"]);
    for (const row of modal.components)
      expect(row.components[0]!.label.length).toBeLessThanOrEqual(45);
    expect(ACCEPT_PHRASE).toBe("I ACCEPT");
  });
});
