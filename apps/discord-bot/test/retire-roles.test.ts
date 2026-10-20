import { describe, expect, it } from "vitest";
import { PermissionFlagsBits as P } from "discord.js";
import { retiredRoles } from "../src/blueprint.js";
import type { ObservedGuild } from "../src/provisioning.js";
import { planRoleRetirement, retirementHash } from "../src/retire-roles.js";

const guild = (roles: ObservedGuild["roles"]): ObservedGuild => ({
  guildId: "guild",
  bot: { userId: "bot", roleId: "bot-role" },
  roles: [
    {
      id: "bot-role",
      name: "KUSH",
      colour: 0,
      permissions: 0n,
      hoist: false,
      position: 10,
      managed: true,
    },
    ...roles,
  ],
  channels: [],
});
const role = (
  id: string,
  name: string,
  position: number,
  permissions = 0n,
) => ({
  id,
  name,
  colour: 0,
  permissions,
  hoist: false,
  position,
});

describe("role retirement", () => {
  const retired = [
    { configKey: "old", reason: "Unused" },
    { configKey: "held", reason: "Unused" },
    { configKey: "senior", reason: "Unused" },
    { configKey: "dangerous", reason: "Unused" },
    { roleId: "test-role", reason: "TEST leftover" },
    { configKey: "missing", reason: "Unused" },
  ];
  const observed = guild([
    role("r-old", "Old", 3),
    role("r-held", "Held", 4),
    role("r-senior", "Senior", 12),
    role("r-dangerous", "Dangerous", 2, P.Administrator),
    role("test-role", "TEST product access", 1),
  ]);
  const ids = {
    old: "r-old",
    held: "r-held",
    senior: "r-senior",
    dangerous: "r-dangerous",
    missing: "r-gone",
  };
  const holders = new Map([
    ["r-held", 2],
    ["test-role", 1],
  ]);
  const plan = planRoleRetirement(retired, observed, ids, holders);
  const action = (name: string) =>
    plan.find((item) => item.name === name || item.configKey === name)?.action;

  it("deletes only empty, powerless roles below the bot (and TEST leftovers)", () => {
    expect(action("Old")).toBe("delete");
    expect(action("TEST product access")).toBe("delete");
    expect(action("Held")).toBe("owner");
    expect(action("Senior")).toBe("owner");
    expect(action("Dangerous")).toBe("owner");
    expect(action("missing")).toBe("already-gone");
    expect(plan.find((item) => item.name === "Held")?.blocker).toMatch(
      /2 member/,
    );
  });

  it("changes its hash when holders change, so a stale review can't apply", () => {
    const later = planRoleRetirement(
      retired,
      observed,
      ids,
      new Map([...holders, ["r-old", 1]]),
    );
    expect(retirementHash(later)).not.toBe(retirementHash(plan));
  });

  it("only lists roles that carry no blueprint duty", () => {
    const keys = retiredRoles.flatMap((item) =>
      "configKey" in item ? [item.configKey] : [],
    );
    for (const kept of [
      "owner",
      "administrator",
      "management",
      "developer",
      "support-staff",
      "moderator",
      "member",
    ])
      expect(keys).not.toContain(kept);
  });
});
