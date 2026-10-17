import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Restarts the bot after crashes with bounded exponential backoff, so a
 * fault cannot become a Discord reconnect storm. Configuration errors
 * (exit 78) and clean exits stop the supervisor.
 */
export interface BackoffPolicy {
  initialMs: number;
  maxMs: number;
  /** A run longer than this resets the backoff. */
  stableMs: number;
}

export const defaultPolicy: BackoffPolicy = {
  initialMs: 1_000,
  maxMs: 60_000,
  stableMs: 10 * 60_000,
};

export function nextDelay(
  previousMs: number | null,
  ranForMs: number,
  policy: BackoffPolicy = defaultPolicy,
): number {
  if (previousMs === null || ranForMs >= policy.stableMs)
    return policy.initialMs;
  return Math.min(previousMs * 2, policy.maxMs);
}

export const shouldRestart = (code: number | null, signal: string | null) =>
  signal === null && code !== 0 && code !== 78;

function run() {
  const entry = fileURLToPath(new URL("./index.js", import.meta.url));
  let delay: number | null = null;
  let stopping = false;
  let child: ReturnType<typeof spawn> | undefined;

  const start = () => {
    const startedAt = Date.now();
    child = spawn(process.execPath, [entry], {
      stdio: "inherit",
      env: process.env,
    });
    child.once("exit", (code, signal) => {
      if (stopping || !shouldRestart(code, signal)) {
        console.log(
          JSON.stringify({ event: "supervisor.stopped", code, signal }),
        );
        process.exitCode = code ?? 0;
        return;
      }
      delay = nextDelay(delay, Date.now() - startedAt);
      console.error(
        JSON.stringify({ event: "supervisor.restart", code, delayMs: delay }),
      );
      setTimeout(start, delay);
    });
  };
  const stop = () => {
    stopping = true;
    child?.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  start();
}

if (
  process.argv[1] &&
  import.meta.url ===
    new URL(`file://${process.argv[1].replaceAll("\\", "/")}`).href
)
  run();
