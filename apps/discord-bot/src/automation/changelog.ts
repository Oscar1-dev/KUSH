import { readFile, writeFile } from "node:fs/promises";
import { brandImages, card } from "../panels.js";
import type { BotReply } from "../runtime/command.js";
import type { Logger } from "../runtime/logger.js";

/**
 * Automatic update announcements. The bot checks the public GitHub repo
 * every few minutes (no webhook or hosting needed) and, when new commits
 * have landed on the branch, posts one card to #announcements explaining
 * what changed, in plain words and without any GitHub link.
 *
 * The first run only records where the branch is, so history is never
 * replayed into the channel. The last announced commit is kept in a small
 * state file so restarts don't repeat or miss a push.
 */

export interface Commit {
  sha: string;
  message: string;
  /** Merge commits (two parents) are skipped; their content is in the others. */
  parents: number;
  date: string;
}

/** Lines that are bookkeeping, not changes people care about. */
const noise = [
  /^update platform from local kush repo/i,
  /^merge\b/i,
  /^co-authored-by:/i,
  /^signed-off-by:/i,
  /^git-subtree-/i,
  /\bTEST\b/,
  /^tidy\b/i,
  /^wip\b/i,
];

const clean = (line: string) =>
  line
    .replace(/^[-*•]\s*/, "")
    .replace(/https?:\/\/\S+/g, "") // never post links
    .replace(/\s+/g, " ")
    .replace(/[.;:,]\s*$/, "")
    .trim();

/** Turns a push's commits into announcement lines (headline + details). */
export function summarisePush(commits: readonly Commit[]) {
  const changes: { headline: string; details: string[] }[] = [];
  for (const commit of commits) {
    if (commit.parents > 1) continue;
    const [subject = "", ...body] = commit.message.split("\n");
    const headline = clean(subject);
    if (!headline || noise.some((pattern) => pattern.test(headline))) continue;
    const details = body
      .map((line) => line.trim())
      .filter((line) => /^[-*•]\s+/.test(line))
      .map(clean)
      .filter((line) => line && !noise.some((pattern) => pattern.test(line)));
    changes.push({ headline, details: details.slice(0, 4) });
  }
  return changes;
}

const MAX_CHANGES = 8;

export function announcement(
  changes: ReturnType<typeof summarisePush>,
  when: Date,
): BotReply {
  const shown = changes.slice(0, MAX_CHANGES);
  const extra = changes.length - shown.length;
  const description = [
    "Fresh changes have just landed across KUSH.",
    "",
    ...shown.flatMap((change) => [
      `**✦ ${change.headline}**`,
      ...change.details.map((line) => `• ${line}`),
      "",
    ]),
    ...(extra > 0
      ? [`…plus ${extra} smaller change${extra === 1 ? "" : "s"}.`]
      : []),
  ]
    .join("\n")
    .trim()
    .slice(0, 4000);
  const { icon } = brandImages();
  return {
    embeds: [
      card({
        title: "KUSH update",
        emoji: "🚀",
        tone: "brand",
        description,
        thumbnail: icon ?? null,
        banner: true,
        timestamp: true,
        footer: `KUSH changelog • ${when.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
      }),
    ],
  };
}

export interface ChangelogOptions {
  repo: string; // "owner/name"
  branch: string;
  statePath: string;
  post(reply: BotReply): Promise<void>;
  log: Logger;
  fetch?: typeof fetch;
  now?: () => Date;
}

interface State {
  lastSha: string;
}

export class ChangelogAnnouncer {
  #running = false;
  constructor(private readonly options: ChangelogOptions) {}

  async #get<T>(path: string): Promise<T> {
    const response = await (this.options.fetch ?? fetch)(
      `https://api.github.com/repos/${this.options.repo}${path}`,
      {
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "kush-discord-bot",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new Error(`GitHub ${response.status}`);
    return (await response.json()) as T;
  }

  async #state(): Promise<State | null> {
    try {
      return JSON.parse(
        await readFile(this.options.statePath, "utf8"),
      ) as State;
    } catch {
      return null;
    }
  }

  async #save(state: State) {
    await writeFile(this.options.statePath, `${JSON.stringify(state)}\n`);
  }

  /** Checks once. Returns how many changes were announced. */
  async tick(): Promise<number> {
    if (this.#running) return 0;
    this.#running = true;
    try {
      const head = (
        await this.#get<{ sha: string }>(
          `/commits/${encodeURIComponent(this.options.branch)}`,
        )
      ).sha;
      const state = await this.#state();
      if (!state) {
        // First run: start from here, don't replay the whole history.
        await this.#save({ lastSha: head });
        this.options.log.info("changelog.initialised", {
          head: head.slice(0, 7),
        });
        return 0;
      }
      if (state.lastSha === head) return 0;
      const compare = await this.#get<{
        status: string;
        commits: {
          sha: string;
          parents: unknown[];
          commit: { message: string; committer: { date: string } };
        }[];
      }>(`/compare/${state.lastSha}...${head}`);
      const changes = summarisePush(
        compare.commits.map((item) => ({
          sha: item.sha,
          message: item.commit.message,
          parents: item.parents.length,
          date: item.commit.committer.date,
        })),
      );
      // Save first: a failed post is logged, never re-posted in a loop.
      await this.#save({ lastSha: head });
      if (!changes.length) return 0;
      await this.options.post(
        announcement(changes, (this.options.now ?? (() => new Date()))()),
      );
      this.options.log.info("changelog.announced", {
        head: head.slice(0, 7),
        changes: changes.length,
      });
      return changes.length;
    } finally {
      this.#running = false;
    }
  }
}
