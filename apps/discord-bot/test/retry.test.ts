import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api-client.js";
import { isTransient, retryInBackground } from "../src/runtime/retry.js";

afterEach(() => vi.useRealTimers());

describe("background retry", () => {
  it("classifies outages as transient and client errors as permanent", () => {
    expect(isTransient(new Error("ECONNREFUSED"))).toBe(true);
    expect(isTransient(new ApiError(503, "down"))).toBe(true);
    expect(isTransient(new ApiError(429, "slow down"))).toBe(true);
    expect(isTransient(new ApiError(403, "no"))).toBe(false);
    expect(isTransient(new ApiError(409, "conflict"))).toBe(false);
  });

  it("retries until the operation succeeds", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const gaveUp = vi.fn();
    retryInBackground(
      async () => {
        calls += 1;
        if (calls < 3) throw new ApiError(503, "down");
      },
      gaveUp,
      [10, 10, 10, 10],
    );
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(3);
    expect(gaveUp).not.toHaveBeenCalled();
  });

  it("stops on a permanent failure and after the last attempt", async () => {
    vi.useFakeTimers();
    const permanent = vi.fn();
    let calls = 0;
    retryInBackground(
      async () => {
        calls += 1;
        throw new ApiError(403, "no");
      },
      permanent,
      [10, 10, 10],
    );
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(1);
    expect(permanent).toHaveBeenCalledOnce();

    const exhausted = vi.fn();
    let tries = 0;
    retryInBackground(
      async () => {
        tries += 1;
        throw new Error("still down");
      },
      exhausted,
      [10, 10],
    );
    await vi.advanceTimersByTimeAsync(100);
    expect(tries).toBe(2);
    expect(exhausted).toHaveBeenCalledOnce();
  });
});
