import { BadRequestException } from "@nestjs/common";

import { weakEtag } from "./etag";
import {
  afterCursor,
  decodeCursor,
  encodeCursor,
  parseLimit,
  parseUpdatedSince,
  toPage,
} from "./paging";

describe("Data API paging", () => {
  const key = { updatedAt: new Date("2026-07-01T10:00:00.123Z"), id: "c1" };

  it("round-trips an opaque base64url cursor", () => {
    const cursor = encodeCursor(key);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(cursor)).toEqual(key);
  });

  it.each([
    "not-base64-json",
    Buffer.from("{}").toString("base64url"),
    Buffer.from('{"u":"nope","i":"x"}').toString("base64url"),
    Buffer.from('{"u":"2026-01-01T00:00:00Z","i":""}').toString("base64url"),
  ])("rejects a tampered cursor %s with 400", (cursor) => {
    expect(() => decodeCursor(cursor)).toThrow(BadRequestException);
  });

  it("selects rows strictly after the cursor, breaking ties by id", () => {
    expect(afterCursor(undefined)).toEqual({});
    expect(afterCursor(key)).toEqual({
      OR: [
        { updatedAt: { gt: key.updatedAt } },
        { updatedAt: key.updatedAt, id: { gt: "c1" } },
      ],
    });
  });

  it("defaults limit to 25 and bounds it to 1..100", () => {
    expect(parseLimit(undefined)).toBe(25);
    expect(parseLimit("1")).toBe(1);
    expect(parseLimit("100")).toBe(100);
    for (const bad of ["0", "101", "2.5", "x", -1])
      expect(() => parseLimit(bad)).toThrow(BadRequestException);
  });

  it("parses updatedSince as an ISO instant", () => {
    expect(parseUpdatedSince(undefined)).toBeUndefined();
    expect(parseUpdatedSince("2026-07-01T00:00:00Z")).toEqual(
      new Date("2026-07-01T00:00:00Z"),
    );
    expect(() => parseUpdatedSince("yesterday")).toThrow(BadRequestException);
  });

  it("uses the extra row only to compute hasMore and the next cursor", () => {
    const rows = [1, 2, 3].map((n) => ({
      updatedAt: new Date(n * 1000),
      id: `r${n}`,
    }));
    const page = toPage(rows, 2, (row) => row.id);
    expect(page.items).toEqual(["r1", "r2"]);
    expect(page.pageInfo.hasMore).toBe(true);
    expect(decodeCursor(page.pageInfo.nextCursor!)).toEqual(rows[1]);

    const last = toPage(rows.slice(0, 2), 2, (row) => row.id);
    expect(last.pageInfo).toEqual({ hasMore: false, nextCursor: null });
  });
});

describe("weakEtag", () => {
  it("is a weak validator stable for equal content and different otherwise", () => {
    const etag = weakEtag({ a: 1, b: [1, 2] });
    expect(etag).toMatch(/^W\/"[0-9a-f]{40}"$/);
    expect(weakEtag({ a: 1, b: [1, 2] })).toBe(etag);
    expect(weakEtag({ a: 1, b: [2, 1] })).not.toBe(etag);
  });
});
