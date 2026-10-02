import { lookup as dnsLookup, type LookupAddress } from "dns";
import { isIP } from "net";

/**
 * SSRF guard for webhook destinations (docs/13-events-and-webhooks.md
 * §Seguridad). The Kernel POSTs to URLs chosen by third parties from inside
 * the production network, so by default:
 *
 * - only https;
 * - no destination that is private, loopback, link-local, CGNAT, multicast,
 *   reserved or otherwise not publicly routable — checked when the endpoint
 *   is registered AND on every delivery, after DNS resolution, and the
 *   connection is pinned to the address that was checked (no DNS
 *   rebinding between check and connect);
 * - no credentials in the URL, no redirects followed (a 3xx is a failure).
 *
 * `KERNEL_WEBHOOKS_ALLOW_INSECURE=true` (local kernel, sandbox, tests only)
 * lifts the http and private-address rules, e.g. for http://localhost:3000.
 */

export type WebhookUrlPolicy = { allowInsecure: boolean };

export function webhookUrlPolicy(
  env: NodeJS.ProcessEnv = process.env,
): WebhookUrlPolicy {
  return { allowInsecure: env.KERNEL_WEBHOOKS_ALLOW_INSECURE === "true" };
}

export class WebhookUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookUrlError";
  }
}

// [network bytes, prefix length]
type Cidr = [number[], number];

const V4_BLOCKED: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (cloud metadata lives here)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

const V6_BLOCKED: Array<[string, number]> = [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["100::", 64], // discard-only
  ["2001::", 23], // IETF protocol assignments (incl. Teredo)
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4 (embeds arbitrary IPv4)
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (deprecated)
  ["ff00::", 8], // multicast
];

function v4Bytes(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((part) =>
    /^\d{1,3}$/.test(part) ? Number(part) : NaN,
  );
  return bytes.every((byte) => byte >= 0 && byte <= 255) ? bytes : null;
}

function v6Bytes(address: string): number[] | null {
  let text = address.replace(/^\[|\]$/g, "").split("%")[0];
  // Trailing dotted IPv4 (::ffff:127.0.0.1)
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const v4 = v4Bytes(dotted[2]);
    if (!v4) return null;
    text = `${dotted[1]}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 0) return null;
  const groups = [...head, ...Array(missing).fill("0"), ...tail];
  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    const value = parseInt(group, 16);
    bytes.push(value >> 8, value & 0xff);
  }
  return bytes.length === 16 ? bytes : null;
}

function inCidr(bytes: number[], [network, prefix]: Cidr): boolean {
  for (let bit = 0; bit < prefix; bit++) {
    const byte = bit >> 3;
    const mask = 0x80 >> (bit & 7);
    if ((bytes[byte] & mask) !== (network[byte] & mask)) return false;
  }
  return true;
}

const v4Cidrs: Cidr[] = V4_BLOCKED.map(([net, prefix]) => [
  v4Bytes(net)!,
  prefix,
]);
const v6Cidrs: Cidr[] = V6_BLOCKED.map(([net, prefix]) => [
  v6Bytes(net)!,
  prefix,
]);

/** True for anything that is not a public unicast address (or not an IP). */
export function isNonPublicAddress(address: string): boolean {
  const family = isIP(address.replace(/^\[|\]$/g, "").split("%")[0]);
  if (family === 4) {
    const bytes = v4Bytes(address)!;
    return v4Cidrs.some((cidr) => inCidr(bytes, cidr));
  }
  if (family === 6) {
    const bytes = v6Bytes(address);
    if (!bytes) return true;
    const isPrefix = (prefix: number[]) =>
      prefix.every((value, index) => bytes[index] === value);
    // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d) and NAT64
    // (64:ff9b::a.b.c.d) embed an IPv4 address: judge that one.
    const embedded =
      isPrefix([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff]) ||
      isPrefix([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) ||
      isPrefix([0, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0]);
    if (embedded && !bytes.slice(0, 15).every((b) => b === 0))
      return isNonPublicAddress(bytes.slice(12).join("."));
    return v6Cidrs.some((cidr) => inCidr(bytes, cidr));
  }
  return true;
}

const INTERNAL_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home.arpa",
];

/**
 * Syntax and policy checks that need no network. Returns the normalized
 * URL string. Messages are shown in the console as they are.
 */
export function validateWebhookUrl(
  value: unknown,
  policy: WebhookUrlPolicy = webhookUrlPolicy(),
): string {
  if (typeof value !== "string" || !value.trim())
    throw new WebhookUrlError("La URL es obligatoria");
  if (value.length > 2048)
    throw new WebhookUrlError("La URL puede tener hasta 2048 caracteres");
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new WebhookUrlError("La URL no es válida");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new WebhookUrlError("La URL tiene que empezar con https://");
  if (url.protocol === "http:" && !policy.allowInsecure)
    throw new WebhookUrlError(
      "La URL tiene que usar https:// (http solo se permite en un kernel local o de pruebas)",
    );
  if (url.username || url.password)
    throw new WebhookUrlError("La URL no puede llevar usuario ni contraseña");
  if (url.hash) throw new WebhookUrlError("La URL no puede llevar #");
  const host = url.hostname.toLowerCase();
  if (!host) throw new WebhookUrlError("La URL no tiene dominio");
  if (!policy.allowInsecure) {
    const literal = host.replace(/^\[|\]$/g, "");
    if (isIP(literal) ? isNonPublicAddress(literal) : false)
      throw new WebhookUrlError(
        "La URL apunta a una dirección privada o local; tiene que ser un servidor accesible desde internet",
      );
    if (
      host === "localhost" ||
      !host.includes(".") ||
      INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix))
    )
      throw new WebhookUrlError(
        "La URL apunta a un nombre local o interno; tiene que ser un dominio público",
      );
  }
  return url.toString();
}

export type LookupAll = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>;

export const systemLookupAll: LookupAll = (hostname) =>
  new Promise((resolve, reject) =>
    dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) =>
      error ? reject(error) : resolve(addresses as LookupAddress[]),
    ),
  );

/**
 * Resolves the host and fails unless EVERY address is public (an attacker
 * controlling DNS could otherwise mix a public and a private record).
 * Returns the addresses to connect to.
 */
export async function resolvePublicAddresses(
  hostname: string,
  policy: WebhookUrlPolicy = webhookUrlPolicy(),
  lookupAll: LookupAll = systemLookupAll,
): Promise<Array<{ address: string; family: number }>> {
  const literal = hostname.replace(/^\[|\]$/g, "");
  const family = isIP(literal);
  const addresses = family
    ? [{ address: literal, family }]
    : await lookupAll(hostname).catch(() => {
        throw new WebhookUrlError(
          `No pudimos encontrar el dominio ${hostname}`,
        );
      });
  if (addresses.length === 0)
    throw new WebhookUrlError(`No pudimos encontrar el dominio ${hostname}`);
  if (
    !policy.allowInsecure &&
    addresses.some((a) => isNonPublicAddress(a.address))
  )
    throw new WebhookUrlError(
      `El dominio ${hostname} apunta a una dirección privada o local`,
    );
  return addresses;
}

/**
 * `lookup` option for http(s).request: resolves through the guard so the
 * socket connects to exactly the address that passed the check.
 */
export function guardedLookup(
  policy: WebhookUrlPolicy,
  lookupAll: LookupAll = systemLookupAll,
) {
  return (
    hostname: string,
    options: { all?: boolean } | number | undefined,
    callback: (
      error: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void,
  ): void => {
    resolvePublicAddresses(hostname, policy, lookupAll).then(
      (addresses) => {
        if (typeof options === "object" && options?.all)
          callback(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
      },
      (error: Error) =>
        callback(Object.assign(error, { code: "EWEBHOOKBLOCKED" }), ""),
    );
  };
}
