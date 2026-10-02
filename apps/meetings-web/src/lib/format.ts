/** Formatting helpers shared by the meetings screens. */

/**
 * A topic's estimated duration in minutes. Legacy showed the raw seconds
 * (`(600s)`); contract fix #5 shows minutes: 600 → "10 min", 90 → "2 min"
 * (rounded, at least 1 for any positive value). null/undefined/≤0 → null.
 */
export function formatDurationMinutes(
  seconds: number | null | undefined,
): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

/** Sum of the topics' estimated durations for the StatStrip: "N min" or "—". */
export function formatTotalDuration(
  topics: { estimatedDurationSec?: number | null }[],
): string {
  const totalSec = topics.reduce(
    (acc, t) => acc + (t.estimatedDurationSec ?? 0),
    0,
  );
  const totalMin = totalSec / 60;
  return totalMin > 0 ? `${Math.round(totalMin)} min` : "—";
}

/** Countdown text "m:ss" (TimerDisplay). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
