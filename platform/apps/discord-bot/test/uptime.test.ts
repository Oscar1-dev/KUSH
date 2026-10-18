import { describe, expect, it } from "vitest";
import { downtime, UptimeWatcher } from "../src/runtime/uptime.js";

describe("uptime alerts", () => {
  const setup = () => {
    const clock = { now: 1_000_000 };
    const results: boolean[] = [];
    const titles: string[] = [];
    const watcher = new UptimeWatcher(
      [{ name: "KUSH API", probe: async () => results.shift() ?? true }],
      async (embed) => void titles.push(String(embed.data.title)),
      () => clock.now,
    );
    const tick = async (healthy: boolean) => {
      results.push(healthy);
      await watcher.tick();
      clock.now += 60_000;
    };
    return { tick, titles };
  };

  it("ignores a single failed check", async () => {
    const { tick, titles } = setup();
    await tick(false);
    await tick(true);
    expect(titles).toEqual([]);
  });

  it("alerts once when down and once when back, with the downtime", async () => {
    const { tick, titles } = setup();
    for (const healthy of [false, false, false, false, true])
      await tick(healthy);
    expect(titles).toEqual(["🔴 KUSH API is down", "🟢 KUSH API is back up"]);
  });

  it("treats a throwing probe as down and survives a failed post", async () => {
    const watcher = new UptimeWatcher(
      [
        {
          name: "Site",
          probe: async () => {
            throw new Error("ECONNREFUSED");
          },
        },
      ],
      async () => {
        throw new Error("Discord down");
      },
    );
    await watcher.tick();
    await watcher.tick();
    expect(watcher.states.get("Site")!.up).toBe(false);
  });

  it("formats downtime readably", () => {
    expect(downtime(30_000)).toBe("30s");
    expect(downtime(5 * 60_000)).toBe("5 min");
    expect(downtime(125 * 60_000)).toBe("2 h 5 min");
  });
});
