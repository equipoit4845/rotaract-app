export type PageInfo = { nextCursor: string | null; hasMore: boolean };

export type Page<T> = {
  notModified: false;
  items: T[];
  pageInfo: PageInfo;
  /** ETag of this page; pass it later as `ifNoneMatch` to sync incrementally. */
  etag: string | undefined;
};

/** The server answered `304 Not Modified` to `If-None-Match`. */
export type NotModified = { notModified: true; etag: string | undefined };

export type PageFetcher<T> = (
  cursor: string | undefined,
  ifNoneMatch: string | undefined,
) => Promise<Page<T> | NotModified>;

/**
 * Cursor pagination (`{ items, pageInfo: { nextCursor, hasMore } }`).
 *
 * - `for await (const item of paginator)` follows `nextCursor` transparently.
 * - `.all()` collects every item.
 * - `.page()` fetches only the first page (or the page at `cursor`) and is the
 *   way to use ETags: with `ifNoneMatch` it can return `{ notModified: true }`.
 *
 * `ifNoneMatch` only applies to the first page. If it matches, iteration
 * yields nothing and `paginator.notModified` becomes `true`.
 */
export class Paginator<T> implements AsyncIterable<T> {
  /** True once the first page answered 304. */
  notModified = false;
  /** ETag of the first page, once fetched. */
  etag: string | undefined;

  private readonly fetchPage: PageFetcher<T>;
  private readonly ifNoneMatch: string | undefined;

  constructor(fetchPage: PageFetcher<T>, ifNoneMatch?: string) {
    this.fetchPage = fetchPage;
    this.ifNoneMatch = ifNoneMatch;
  }

  async page(cursor?: string): Promise<Page<T> | NotModified> {
    const result = await this.fetchPage(
      cursor,
      cursor === undefined ? this.ifNoneMatch : undefined,
    );
    if (cursor === undefined) {
      this.etag = result.etag;
      this.notModified = result.notModified;
    }
    return result;
  }

  async *pages(): AsyncGenerator<Page<T>, void, undefined> {
    let cursor: string | undefined;
    const seen = new Set<string>();
    for (;;) {
      const result = await this.page(cursor);
      if (result.notModified) return;
      yield result;
      const next = result.pageInfo?.nextCursor ?? null;
      if (!result.pageInfo?.hasMore || !next || seen.has(next)) return;
      seen.add(next);
      cursor = next;
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T, void, undefined> {
    for await (const page of this.pages()) yield* page.items;
  }

  /** Every item of every page. `max` stops early (protects against huge lists). */
  async all(options: { max?: number } = {}): Promise<T[]> {
    const items: T[] = [];
    for await (const item of this) {
      items.push(item);
      if (options.max !== undefined && items.length >= options.max) break;
    }
    return items;
  }
}
