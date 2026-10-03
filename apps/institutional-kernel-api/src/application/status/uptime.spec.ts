import {
  averageLatency,
  dayStatus,
  displayedStatus,
  fillDays,
  mostSevere,
  probeStatus,
  uptimePercent,
  uptimeRatio,
  type DaySummary,
} from "./uptime";

function day(date: string, counts: Partial<DaySummary> = {}): DaySummary {
  const up = counts.up ?? 1440;
  const degraded = counts.degraded ?? 0;
  const down = counts.down ?? 0;
  const maintenance = counts.maintenance ?? 0;
  return {
    day: new Date(`${date}T00:00:00Z`),
    total: counts.total ?? up + degraded + down + maintenance,
    up,
    degraded,
    down,
    maintenance,
    latencySumMs: counts.latencySumMs ?? 0,
    latencyCount: counts.latencyCount ?? 0,
  };
}

describe("uptime math (E12.1)", () => {
  it("is answered / counted minutes; degraded counts as available", () => {
    expect(uptimeRatio([day("2026-10-01")])).toBe(1);
    expect(
      uptimeRatio([day("2026-10-01", { up: 1430, degraded: 5, down: 5 })]),
    ).toBeCloseTo(1435 / 1440);
  });

  it("maintenance minutes are excluded from both sides", () => {
    // 2 hours of announced maintenance, 10 minutes down outside it.
    const d = day("2026-10-01", { up: 1310, down: 10, maintenance: 120 });
    expect(uptimeRatio([d])).toBeCloseTo(1310 / 1320);
  });

  it("no countable minutes means no uptime (null), never 100 %", () => {
    expect(uptimeRatio([])).toBeNull();
    expect(
      uptimeRatio([day("2026-10-01", { up: 0, maintenance: 60 })]),
    ).toBeNull();
    expect(uptimePercent(null)).toBeNull();
  });

  it("aggregates a 90-day window over the days it has", () => {
    const rows = Array.from({ length: 90 }, (_, i) =>
      day(
        `2026-07-${String((i % 28) + 1).padStart(2, "0")}`,
        i === 10 ? { up: 1380, down: 60 } : {},
      ),
    );
    // 60 minutes down out of 90 * 1440.
    expect(uptimePercent(uptimeRatio(rows))).toBe(99.95);
  });

  it("percent rounds DOWN with two decimals: one bad minute is never 100 %", () => {
    expect(uptimePercent(1)).toBe(100);
    expect(uptimePercent(1 - 1 / (90 * 1440))).toBe(99.99);
    expect(uptimePercent(0.99996)).toBe(99.99);
    expect(uptimePercent(0.5)).toBe(50);
    expect(uptimePercent(0)).toBe(0);
  });

  it("day colour comes from the minutes down/degraded", () => {
    expect(dayStatus(null)).toBe("UNKNOWN");
    expect(dayStatus(day("2026-10-01"))).toBe("OPERATIONAL");
    expect(dayStatus(day("2026-10-01", { degraded: 3 }))).toBe("DEGRADED");
    expect(dayStatus(day("2026-10-01", { down: 29 }))).toBe("PARTIAL_OUTAGE");
    expect(dayStatus(day("2026-10-01", { down: 30 }))).toBe("MAJOR_OUTAGE");
    expect(dayStatus(day("2026-10-01", { up: 0, maintenance: 1440 }))).toBe(
      "MAINTENANCE",
    );
  });

  it("fills missing days with null, oldest first, ending today", () => {
    const days = fillDays(
      [day("2026-10-03"), day("2026-10-05")],
      new Date("2026-10-05T15:00:00Z"),
      4,
    );
    expect(days.map((d) => [d.date, d.summary ? "data" : null])).toEqual([
      ["2026-10-02", null],
      ["2026-10-03", "data"],
      ["2026-10-04", null],
      ["2026-10-05", "data"],
    ]);
  });

  it("average latency weights by measured checks", () => {
    expect(
      averageLatency([
        { latencySumMs: 1000, latencyCount: 10 },
        { latencySumMs: 3000, latencyCount: 10 },
      ]),
    ).toBe(200);
    expect(averageLatency([{ latencySumMs: 0, latencyCount: 0 }])).toBeNull();
  });

  it("probe status: stale or missing checks are UNKNOWN", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    const at = (s: number) => new Date(now.getTime() - s * 1000);
    expect(probeStatus(null, now, 300_000)).toBe("UNKNOWN");
    expect(
      probeStatus({ result: "UP", checkedAt: at(400) }, now, 300_000),
    ).toBe("UNKNOWN");
    expect(probeStatus({ result: "UP", checkedAt: at(30) }, now, 300_000)).toBe(
      "OPERATIONAL",
    );
    expect(
      probeStatus({ result: "DEGRADED", checkedAt: at(30) }, now, 300_000),
    ).toBe("DEGRADED");
    expect(
      probeStatus({ result: "DOWN", checkedAt: at(30) }, now, 300_000),
    ).toBe("MAJOR_OUTAGE");
  });

  it("displayed status: maintenance masks the probe, incidents never show less than their impact", () => {
    expect(
      displayedStatus({
        probe: "OPERATIONAL",
        inMaintenance: false,
        openIncidentImpacts: [],
      }),
    ).toBe("OPERATIONAL");
    expect(
      displayedStatus({
        probe: "MAJOR_OUTAGE",
        inMaintenance: true,
        openIncidentImpacts: [],
      }),
    ).toBe("MAINTENANCE");
    expect(
      displayedStatus({
        probe: "OPERATIONAL",
        inMaintenance: false,
        openIncidentImpacts: ["MINOR"],
      }),
    ).toBe("DEGRADED");
    expect(
      displayedStatus({
        probe: "OPERATIONAL",
        inMaintenance: false,
        openIncidentImpacts: ["MINOR", "CRITICAL"],
      }),
    ).toBe("MAJOR_OUTAGE");
    // The probe is worse than the declared impact: the probe wins.
    expect(
      displayedStatus({
        probe: "MAJOR_OUTAGE",
        inMaintenance: false,
        openIncidentImpacts: ["MINOR"],
      }),
    ).toBe("MAJOR_OUTAGE");
    expect(
      displayedStatus({
        probe: "UNKNOWN",
        inMaintenance: false,
        openIncidentImpacts: ["MAJOR"],
      }),
    ).toBe("PARTIAL_OUTAGE");
    expect(
      displayedStatus({
        probe: "UNKNOWN",
        inMaintenance: false,
        openIncidentImpacts: [],
      }),
    ).toBe("UNKNOWN");
  });

  it("overall: the most severe known status", () => {
    expect(mostSevere(["OPERATIONAL", "DEGRADED", "UNKNOWN"])).toBe("DEGRADED");
    expect(mostSevere(["OPERATIONAL", "MAINTENANCE"])).toBe("MAINTENANCE");
    expect(mostSevere(["PARTIAL_OUTAGE", "MAJOR_OUTAGE"])).toBe("MAJOR_OUTAGE");
    expect(mostSevere(["UNKNOWN", "UNKNOWN"])).toBe("UNKNOWN");
    expect(mostSevere([])).toBe("UNKNOWN");
  });
});
