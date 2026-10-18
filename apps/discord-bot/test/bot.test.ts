import { describe, expect, it } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { DiscordApiClient, requestUuid } from "../src/api-client.js";
import { blueprint, requiredBotPermissions } from "../src/blueprint.js";
import { commandJson } from "../src/commands.js";
import { createComponentId, verifyComponentId } from "../src/component-id.js";
import { runtimeConfigSchema } from "../src/config.js";
import { supportPanel } from "../src/panels.js";

describe("Discord bot foundation", () => {
  it("defines every required category and unique command name", () => {
    expect(
      blueprint.channels
        .filter((channel) => channel.type === 4)
        .map((channel) => channel.key),
    ).toEqual([
      "information",
      "community",
      "studio",
      "products",
      "support",
      "partnerships",
      "staff",
      "owner",
      "tickets",
      "reports",
    ]);
    const names = commandJson.map((command) => command.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        "help",
        "ticket",
        "account",
        "downloads",
        "guide",
        "setup",
        "apply",
        "partner",
        "health",
        "sync",
        "permissions",
        "entitlement",
      ]),
    );
  });

  it("requests provisioning permissions without Administrator", () => {
    expect(requiredBotPermissions & PermissionFlagsBits.ManageChannels).toBe(
      PermissionFlagsBits.ManageChannels,
    );
    expect(requiredBotPermissions & PermissionFlagsBits.ManageRoles).toBe(
      PermissionFlagsBits.ManageRoles,
    );
    expect(requiredBotPermissions & PermissionFlagsBits.Administrator).toBe(0n);
  });

  it("signs, scopes and expires component payloads", () => {
    const secret = "a-secure-test-secret-with-at-least-32-characters";
    const id = createComponentId(
      { action: "ticket-create", subject: "user-1", expiresAt: 2000 },
      secret,
    );
    expect(verifyComponentId(id, secret, 1000)?.subject).toBe("user-1");
    expect(verifyComponentId(id, secret, 3000)).toBeNull();
    expect(verifyComponentId(`${id}x`, secret, 1000)).toBeNull();
  });

  it("keeps tokens out of the persisted configuration schema", () => {
    const parsed = runtimeConfigSchema.parse({
      applicationId: "12345678901234567",
      guildId: "22345678901234567",
      apiBaseUrl: "http://127.0.0.1:4310",
      supportTenantId: "11111111-1111-4111-8111-111111111111",
    });
    expect(parsed).not.toHaveProperty("token");
    expect(() =>
      runtimeConfigSchema.parse({
        ...parsed,
        apiBaseUrl: "https://example.com",
      }),
    ).toThrow(/loopback/);
  });

  it("builds an accessible support panel without fake live data", () => {
    const json = supportPanel().embeds[0]?.toJSON();
    expect(json?.title).toContain("KUSH support");
    expect(JSON.stringify(json)).not.toMatch(/online|uptime|customers served/i);
    expect(supportPanel().components).toHaveLength(1);
  });

  it("uses stable retry IDs and authenticates backend integration calls", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const mockFetch = async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      calls.push({ url: input.toString(), init });
      return new Response(JSON.stringify({ ticket: { number: 42 } }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    };
    const client = new DiscordApiClient({
      baseUrl: "http://127.0.0.1:4310",
      tenantId: "11111111-1111-4111-8111-111111111111",
      guildId: "22345678901234567",
      integrationSecret: "integration-secret-with-more-than-32-characters",
      fetch: mockFetch,
    });
    expect(requestUuid("12345678901234567")).toBe(
      requestUuid("12345678901234567"),
    );
    await expect(
      client.create({
        discordUserId: "32345678901234567",
        guildId: "22345678901234567",
        interactionId: "12345678901234567",
        category: "technical",
        description: "A reproducible technical issue",
      }),
    ).resolves.toMatchObject({ reference: "#42" });
    expect(calls[0]?.url).toContain(
      "/discord/integration/tenants/11111111-1111-4111-8111-111111111111/tickets",
    );
    expect(
      new Headers(calls[0]?.init?.headers).get("x-kush-discord-secret"),
    ).toBe("integration-secret-with-more-than-32-characters");
    expect(
      new Headers(calls[0]?.init?.headers).get("x-kush-discord-user-id"),
    ).toBe("32345678901234567");
  });
});
