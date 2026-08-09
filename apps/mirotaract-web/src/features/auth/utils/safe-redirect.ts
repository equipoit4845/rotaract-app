const DEFAULT_REDIRECT = "/dashboard";

/**
 * `?next=` must only ever point inside this app (product spec §16/§48) — an
 * absolute URL, a protocol-relative one (`//evil.com`), or anything with a
 * scheme would send an authenticated session to an attacker-controlled
 * host. Backslashes are rejected too: per the WHATWG URL spec, browsers
 * treat `\` as equivalent to `/` for special schemes, so `/\evil.com`
 * normalizes to the protocol-relative `//evil.com` — a well-known bypass
 * for a check that only looks for a literal leading `//`. Anything that
 * isn't a same-origin, single-leading-slash path falls back to
 * `/dashboard`.
 */
export function resolveSafeNext(next: string | null | undefined): string {
  if (!next) return DEFAULT_REDIRECT;
  if (!next.startsWith("/")) return DEFAULT_REDIRECT;
  if (next.startsWith("//")) return DEFAULT_REDIRECT;
  if (next.includes("\\")) return DEFAULT_REDIRECT;
  if (next.includes("://")) return DEFAULT_REDIRECT;
  return next;
}
