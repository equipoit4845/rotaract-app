import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatClock,
  formatDurationMinutes,
  formatTotalDuration,
} from "@/lib/format";

test("topic duration is shown in minutes, not raw seconds (contract fix #5)", () => {
  assert.equal(formatDurationMinutes(600), "10 min");
  assert.equal(formatDurationMinutes(300), "5 min");
  assert.equal(formatDurationMinutes(90), "2 min");
  assert.equal(formatDurationMinutes(30), "1 min");
  assert.equal(formatDurationMinutes(7200), "120 min");
});

test("missing or non-positive durations render nothing", () => {
  assert.equal(formatDurationMinutes(null), null);
  assert.equal(formatDurationMinutes(undefined), null);
  assert.equal(formatDurationMinutes(0), null);
  assert.equal(formatDurationMinutes(-60), null);
  assert.equal(formatDurationMinutes(Number.NaN), null);
});

test('StatStrip "Duración est." sums the agenda', () => {
  assert.equal(
    formatTotalDuration([
      { estimatedDurationSec: 600 },
      { estimatedDurationSec: 900 },
      { estimatedDurationSec: null },
    ]),
    "25 min",
  );
  assert.equal(formatTotalDuration([]), "—");
  assert.equal(formatTotalDuration([{ estimatedDurationSec: null }]), "—");
});

test("timer clock is m:ss", () => {
  assert.equal(formatClock(0), "0:00");
  assert.equal(formatClock(65), "1:05");
  assert.equal(formatClock(600), "10:00");
  assert.equal(formatClock(-3), "0:00");
});
