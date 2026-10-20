import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ChangelogAnnouncer,
  announcement,
  summarisePush,
  type Commit,
} from "../src/automation/changelog.js";
import type { BotReply } from "../src/runtime/command.js";
import { createLogger } from "../src/runtime/logger.js";

const commit = (message: string, parents = 1): Commit => ({
  sha: Math.random().toString(16).slice(2),
  message,
  parents,
  date: "2026-10-20T20:00:00Z",
});

describe("push summaries", () => {
  it("keeps real changes and drops bookkeeping, links and test notes", () => {
    const changes = summarisePush([
      commit(
        "Website: new pricing page.\n\n- Every service with live prices\n- See https://github.com/x/y/pull/1 for details\n- TEST data cleaned up\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
      ),
      commit("Update platform from local KUSH repo", 2),
      commit("Update platform from local KUSH repo"),
      commit("Merge branch 'main'"),
    ]);
    expect(changes).toEqual([
      {
        headline: "Website: new pricing page",
        details: ["Every service with live prices", "See for details"],
      },
    ]);
    expect(JSON.stringify(announcement(changes, new Date()))).not.toMatch(
      /https?:\/\//,
    );
  });
});

describe("announcer", () => {
  const github = (head: string, commits: Commit[]) => {
    const calls: string[] = [];
    const fetch = (async (url: string) => {
      calls.push(url);
      const body = url.includes("/compare/")
        ? {
            status: "ahead",
            commits: commits.map((c) => ({
              sha: c.sha,
              parents: Array(c.parents).fill({}),
              commit: { message: c.message, committer: { date: c.date } },
            })),
          }
        : { sha: head };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof globalThis.fetch;
    return { fetch, calls };
  };

  it("starts silently, announces new pushes once, and never repeats", async () => {
    const statePath = join(
      mkdtempSync(join(tmpdir(), "kush-changelog-")),
      "state.json",
    );
    const posted: BotReply[] = [];
    let remote = github("aaa", []);
    const announcer = () =>
      new ChangelogAnnouncer({
        repo: "Oscar1-dev/KUSH",
        branch: "main",
        statePath,
        log: createLogger(() => undefined),
        fetch: remote.fetch,
        post: async (reply) => void posted.push(reply),
      });
    expect(await announcer().tick()).toBe(0); // first run: just remembers
    expect(posted).toEqual([]);

    remote = github("bbb", [
      commit("Discord: new welcome menu\n\n- Find your way around"),
    ]);
    expect(await announcer().tick()).toBe(1);
    expect(remote.calls.some((url) => url.endsWith("/compare/aaa...bbb"))).toBe(
      true,
    );
    expect(JSON.stringify(posted[0])).toContain("Discord: new welcome menu");

    // Same head again (e.g. after a restart): nothing new is posted.
    expect(await announcer().tick()).toBe(0);
    expect(posted).toHaveLength(1);
  });

  it("stays quiet when a push only has bookkeeping commits", async () => {
    const statePath = join(
      mkdtempSync(join(tmpdir(), "kush-changelog-")),
      "state.json",
    );
    const posted: BotReply[] = [];
    let remote = github("aaa", []);
    const make = () =>
      new ChangelogAnnouncer({
        repo: "o/r",
        branch: "main",
        statePath,
        log: createLogger(() => undefined),
        fetch: remote.fetch,
        post: async (reply) => void posted.push(reply),
      });
    await make().tick();
    remote = github("bbb", [commit("Update platform from local KUSH repo", 2)]);
    expect(await make().tick()).toBe(0);
    expect(posted).toEqual([]);
  });
});
