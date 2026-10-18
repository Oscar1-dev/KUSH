import { ApiError } from "../api-client.js";

/** API down, timed out, rate limited or erroring: worth trying again. */
export const isTransient = (error: unknown) =>
  !(error instanceof ApiError) || error.status >= 500 || error.status === 429;

/**
 * Retries an idempotent operation in the background after transient
 * failures (15 s, 1 min, 5 min, 15 min), so a short API outage does not lose
 * Discord messages. Permanent failures are not retried.
 */
export function retryInBackground(
  operation: () => Promise<void>,
  onGiveUp: (error: unknown) => void,
  delays: readonly number[] = [15_000, 60_000, 300_000, 900_000],
) {
  const attempt = (index: number) =>
    setTimeout(() => {
      operation().catch((error: unknown) => {
        if (isTransient(error) && index + 1 < delays.length) attempt(index + 1);
        else onGiveUp(error);
      });
    }, delays[index]).unref?.();
  attempt(0);
}
