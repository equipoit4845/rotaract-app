import { BadRequestException } from "@nestjs/common";

/**
 * Cursor pagination and incremental sync for the Data API v1
 * (docs/12-data-api-and-sdks.md §E4). Collections are ordered by
 * (updatedAt asc, id asc); the cursor is the opaque base64url encoding of
 * the last item's sort key, so a page boundary never skips or repeats rows
 * that share an updatedAt.
 */
export type CursorKey = { updatedAt: Date; id: string };

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

export function encodeCursor(key: CursorKey): string {
  return Buffer.from(
    JSON.stringify({ u: key.updatedAt.toISOString(), i: key.id }),
  ).toString("base64url");
}

export function decodeCursor(cursor: string): CursorKey {
  const invalid = () => new BadRequestException("Invalid cursor");
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw invalid();
  }
  const { u, i } = (parsed ?? {}) as { u?: unknown; i?: unknown };
  if (typeof u !== "string" || typeof i !== "string" || !i) throw invalid();
  const updatedAt = new Date(u);
  if (Number.isNaN(updatedAt.getTime())) throw invalid();
  return { updatedAt, id: i };
}

export function parseLimit(value: unknown): number {
  if (value === undefined || value === null || value === "")
    return DEFAULT_LIMIT;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)
    throw new BadRequestException(
      `limit must be an integer between 1 and ${MAX_LIMIT}`,
    );
  return limit;
}

export function parseUpdatedSince(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const date = typeof value === "string" ? new Date(value) : undefined;
  if (!date || Number.isNaN(date.getTime()))
    throw new BadRequestException("updatedSince must be an ISO 8601 instant");
  return date;
}

/** Prisma `where` fragment selecting rows strictly after the cursor. */
export function afterCursor(key: CursorKey | undefined) {
  if (!key) return {};
  return {
    OR: [
      { updatedAt: { gt: key.updatedAt } },
      { updatedAt: key.updatedAt, id: { gt: key.id } },
    ],
  };
}

export const pageOrder = [
  { updatedAt: "asc" as const },
  { id: "asc" as const },
];

export type PageInfo = { nextCursor: string | null; hasMore: boolean };

/**
 * `rows` must have been fetched with `take: limit + 1`; the extra row only
 * tells whether there is another page.
 */
export function toPage<Row extends CursorKey, Item>(
  rows: Row[],
  limit: number,
  map: (row: Row) => Item,
): { items: Item[]; pageInfo: PageInfo } {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map(map),
    pageInfo: {
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(last) : null,
    },
  };
}
