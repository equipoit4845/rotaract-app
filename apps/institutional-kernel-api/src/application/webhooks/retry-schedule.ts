/**
 * Delivery retries (docs/13-events-and-webhooks.md §Reintentos).
 *
 * After the n-th failed attempt the next one waits RETRY_DELAYS_MS[n-1]
 * (the last value repeats), ±10 % jitter so that a receiver that comes back
 * up is not hit by every pending event at the same instant. No automatic
 * attempt is scheduled after `retryUntil` (72 h after the event); the last
 * one is clamped to exactly that instant, and then the delivery is FAILED.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const RETRY_DELAYS_MS = [
  1 * MINUTE,
  5 * MINUTE,
  30 * MINUTE,
  2 * HOUR,
  6 * HOUR,
  12 * HOUR,
] as const;

export const RETRY_WINDOW_MS = 72 * HOUR;
export const JITTER_RATIO = 0.1;
/** An endpoint whose every attempt failed for this long is disabled. */
export const AUTO_DISABLE_AFTER_MS = 72 * HOUR;
/** Receiver must answer within this. */
export const DELIVERY_TIMEOUT_MS = 10_000;

/** Base delay (no jitter) after `failedAttempts` failures (≥ 1). */
export function baseRetryDelayMs(failedAttempts: number): number {
  const index = Math.min(
    Math.max(failedAttempts, 1) - 1,
    RETRY_DELAYS_MS.length - 1,
  );
  return RETRY_DELAYS_MS[index];
}

/** `random` returns [0, 1); 0.5 means no jitter. */
export function retryDelayMs(
  failedAttempts: number,
  random: () => number = Math.random,
): number {
  const base = baseRetryDelayMs(failedAttempts);
  const jitter = (random() * 2 - 1) * JITTER_RATIO * base;
  return Math.round(base + jitter);
}

/** When to try again, or null when the delivery has to be marked FAILED. */
export function nextAttemptAt(input: {
  failedAttempts: number;
  now: Date;
  retryUntil: Date;
  random?: () => number;
}): Date | null {
  const { now, retryUntil } = input;
  if (now.getTime() >= retryUntil.getTime()) return null;
  const next = now.getTime() + retryDelayMs(input.failedAttempts, input.random);
  return new Date(Math.min(next, retryUntil.getTime()));
}

/** Attempt times (ms after the event) with no jitter, for docs and tests. */
export function plannedAttemptOffsetsMs(): number[] {
  const offsets = [0];
  let at = 0;
  for (let failed = 1; ; failed++) {
    if (at >= RETRY_WINDOW_MS) break;
    at = Math.min(at + baseRetryDelayMs(failed), RETRY_WINDOW_MS);
    offsets.push(at);
  }
  return offsets;
}

/** True when this failure should disable the endpoint. */
export function shouldAutoDisable(
  failingSince: Date | null,
  now: Date,
): boolean {
  return (
    failingSince !== null &&
    now.getTime() - failingSince.getTime() >= AUTO_DISABLE_AFTER_MS
  );
}
