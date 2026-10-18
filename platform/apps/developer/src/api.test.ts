import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  API_URL,
  pollingInterval,
  request,
  validatedEndpoint,
} from "./api";
afterEach(() => vi.unstubAllGlobals());
describe("polling preferences", () => {
  it("rejects malformed and unbounded persisted values", () => {
    for (const value of [
      null,
      "",
      "NaN",
      "Infinity",
      "4",
      "61",
      "5.5",
      "15",
      {},
      false,
    ])
      expect(pollingInterval(value)).toBe(10);
    expect(pollingInterval("30")).toBe(30);
  });
});
describe("API boundary", () => {
  it("restricts persisted and requested origins to the two loopback profiles", async () => {
    for (const value of [
      "https://example.com",
      "http://localhost:4310/path",
      "http://localhost:4311",
      "http://127.0.0.1:4310@evil.example",
      null,
    ])
      expect(validatedEndpoint(value)).toBe(API_URL);
    expect(validatedEndpoint("http://localhost:4310")).toBe(
      "http://localhost:4310",
    );
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await request("/health", {}, undefined, "https://example.com");
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_URL}/health`);
  });
  it("preserves unauthorized status for centralized session clearing", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("private detail", { status: 401 })),
    );
    try {
      await request("/auth/me", {}, "expired");
      throw new Error("Expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(401);
      expect((error as Error).message).not.toContain("private detail");
    }
  });
  it("sends a bearer token only in the authorization header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ user: {} })));
    vi.stubGlobal("fetch", fetchMock);
    await request("/auth/me", {}, "session-secret");
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:4310/auth/me");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer session-secret",
    );
  });
  it("handles no-content sign out and unreachable backend honestly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    await expect(
      request("/auth/logout", { method: "POST" }),
    ).resolves.toBeUndefined();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("network failure")),
    );
    await expect(request("/health")).rejects.toThrow("Local API unavailable");
  });
  it("does not expose server error response bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("secret stack", { status: 500 })),
    );
    await expect(request("/health")).rejects.toThrow(
      "API request failed (500).",
    );
  });
});
