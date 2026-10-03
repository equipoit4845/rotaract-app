import { MiRotaractError } from "./errors.ts";
import type {
  AuthorityView,
  MemberView,
  MembershipStatus,
  OrganizationView,
  PeriodView,
  PersonView,
} from "./types.ts";

/**
 * Webhooks de Mi Rotaract (docs/developers/webhooks.md).
 *
 * Every POST carries:
 *
 * - `MiRotaract-Webhook-Id: evt_...` — the same on every retry: deduplicate on it.
 * - `MiRotaract-Webhook-Timestamp: <unix seconds>`
 * - `MiRotaract-Signature: v1=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>`
 *   (several comma-separated `v1=` values during a secret rotation).
 *
 * `verifyWebhook` checks all of that in one line, with Web Crypto (Node 20+,
 * edge runtimes, Deno, Bun). It needs the RAW body exactly as received: a
 * body that was parsed and re-serialized no longer matches the signature.
 */

export const WEBHOOK_ID_HEADER = "MiRotaract-Webhook-Id";
export const WEBHOOK_TIMESTAMP_HEADER = "MiRotaract-Webhook-Timestamp";
export const WEBHOOK_SIGNATURE_HEADER = "MiRotaract-Signature";
export const DEFAULT_WEBHOOK_TOLERANCE_SEC = 300;

export type MiRotaractWebhookErrorCode =
  | "missing_header"
  | "invalid_timestamp"
  | "timestamp_out_of_tolerance"
  | "invalid_signature"
  | "invalid_payload";

export class MiRotaractWebhookError extends MiRotaractError {
  readonly code: MiRotaractWebhookErrorCode;
  constructor(code: MiRotaractWebhookErrorCode, message: string) {
    super(message);
    this.name = "MiRotaractWebhookError";
    this.code = code;
  }
}

// --- Event types (GET /events/catalog, docs/developers/catalogo-de-eventos.md)

export type MiRotaractEvent<
  T extends string = string,
  D = Record<string, unknown>,
> = {
  /** `evt_...`, stable across retries. */
  id: string;
  type: T;
  /** When it happened in the Kernel (ISO 8601). */
  createdAt: string;
  /** Organization of your app's scope the event is about. */
  organizationId: string;
  data: D;
};

export type MembershipEventData = {
  membership: MemberView;
  previousStatus: MembershipStatus | null;
};

export type MembershipCreatedEvent = MiRotaractEvent<
  "membership.created.v1",
  MembershipEventData
>;
export type MembershipActivatedEvent = MiRotaractEvent<
  "membership.activated.v1",
  MembershipEventData
>;
export type MembershipEndedEvent = MiRotaractEvent<
  "membership.ended.v1",
  MembershipEventData & {
    reason: "INACTIVE" | "GRADUATED" | "TRANSFERRED";
    endedAt: string | null;
  }
>;
export type AppointmentActivatedEvent = MiRotaractEvent<
  "appointment.activated.v1",
  { authority: AuthorityView }
>;
export type AppointmentEndedEvent = MiRotaractEvent<
  "appointment.ended.v1",
  { authority: AuthorityView }
>;
export type OrganizationUpdatedEvent = MiRotaractEvent<
  "organization.updated.v1",
  { organization: OrganizationView; changedFields: string[] }
>;
export type OrganizationArchivedEvent = MiRotaractEvent<
  "organization.archived.v1",
  { organization: OrganizationView }
>;
export type PersonUpdatedEvent = MiRotaractEvent<
  "person.updated.v1",
  { person: PersonView; changedFields: string[] }
>;
export type PeriodCreatedEvent = MiRotaractEvent<
  "period.created.v1",
  { period: PeriodView }
>;
/** E8: your module's installation in a club (or the district). */
export type ModuleInstallationView = {
  moduleId: string;
  organizationId: string;
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "DISABLED";
  /** The club's configuration, already validated against your configurationSchema. */
  configuration: Record<string, unknown> | null;
  installedAt: string;
  activatedAt?: string | null;
  disabledAt?: string | null;
};
/** Module events only reach the app that owns the module. */
export type ModuleInstalledEvent = MiRotaractEvent<
  "module.installed.v1",
  { installation: ModuleInstallationView }
>;
export type ModuleEnabledEvent = MiRotaractEvent<
  "module.enabled.v1",
  { installation: ModuleInstallationView }
>;
export type ModuleDisabledEvent = MiRotaractEvent<
  "module.disabled.v1",
  { installation: ModuleInstallationView; reason: "SUSPENDED" | "DISABLED" }
>;
export type ModuleConfiguredEvent = MiRotaractEvent<
  "module.configured.v1",
  { installation: ModuleInstallationView }
>;
export type PingEvent = MiRotaractEvent<
  "ping.v1",
  { message: string; appId: string; endpointId: string }
>;

/** Every type of the v1 catalog. Unknown future types still verify (as MiRotaractEvent). */
export type MiRotaractWebhookEvent =
  | MembershipCreatedEvent
  | MembershipActivatedEvent
  | MembershipEndedEvent
  | AppointmentActivatedEvent
  | AppointmentEndedEvent
  | OrganizationUpdatedEvent
  | OrganizationArchivedEvent
  | PersonUpdatedEvent
  | PeriodCreatedEvent
  | ModuleInstalledEvent
  | ModuleEnabledEvent
  | ModuleDisabledEvent
  | ModuleConfiguredEvent
  | PingEvent;

export type WebhookEventType = MiRotaractWebhookEvent["type"];

// --- Verification -----------------------------------------------------------

export type WebhookHeadersLike =
  Headers | Record<string, string | string[] | undefined>;

export type VerifyWebhookOptions = {
  /** The raw request body (string, Buffer/Uint8Array or ArrayBuffer). */
  payload: string | Uint8Array | ArrayBuffer;
  headers: WebhookHeadersLike;
  /** `whsec_...`. Pass two during a rotation of your own configuration. */
  secret: string | readonly string[];
  /** Max clock difference accepted, in seconds. Default 300. */
  toleranceSec?: number;
  /** Current time in Unix seconds (tests). Default: now. */
  now?: number;
};

function header(headers: WebhookHeadersLike, name: string): string | undefined {
  if (typeof (headers as Headers).get === "function")
    return (headers as Headers).get(name) ?? undefined;
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(
    headers as Record<string, string | string[] | undefined>,
  ))
    if (key.toLowerCase() === lower)
      return Array.isArray(value) ? value.join(",") : value;
  return undefined;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function bytesOf(payload: VerifyWebhookOptions["payload"]): Uint8Array {
  if (typeof payload === "string") return encoder.encode(payload);
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
  if (ArrayBuffer.isView(payload))
    return new Uint8Array(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    );
  throw new MiRotaractWebhookError(
    "invalid_payload",
    "payload tiene que ser el cuerpo crudo (string o bytes), no un objeto ya parseado",
  );
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++)
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * Verifies a webhook and returns the parsed event. Throws
 * `MiRotaractWebhookError` (`code`: missing_header, invalid_timestamp,
 * timestamp_out_of_tolerance, invalid_signature, invalid_payload).
 *
 * ```ts
 * const event = await verifyWebhook({ payload: rawBody, headers: req.headers, secret: process.env.MIROTARACT_WEBHOOK_SECRET! });
 * ```
 */
export async function verifyWebhook<
  E extends MiRotaractEvent = MiRotaractWebhookEvent,
>(options: VerifyWebhookOptions): Promise<E> {
  const signature = header(options.headers, WEBHOOK_SIGNATURE_HEADER);
  const timestampText = header(options.headers, WEBHOOK_TIMESTAMP_HEADER);
  if (!signature || !timestampText)
    throw new MiRotaractWebhookError(
      "missing_header",
      `Faltan las cabeceras ${WEBHOOK_SIGNATURE_HEADER} / ${WEBHOOK_TIMESTAMP_HEADER}`,
    );
  if (!/^\d+$/.test(timestampText.trim()))
    throw new MiRotaractWebhookError(
      "invalid_timestamp",
      `${WEBHOOK_TIMESTAMP_HEADER} no es un número de segundos`,
    );
  const timestamp = Number(timestampText.trim());
  const now = options.now ?? Math.floor(Date.now() / 1_000);
  const tolerance = options.toleranceSec ?? DEFAULT_WEBHOOK_TOLERANCE_SEC;
  if (Math.abs(now - timestamp) > tolerance)
    throw new MiRotaractWebhookError(
      "timestamp_out_of_tolerance",
      `La marca de tiempo está a más de ${tolerance} s del reloj local`,
    );

  const body = bytesOf(options.payload);
  const signed = concat(encoder.encode(`${timestamp}.`), body);
  const candidates = signature
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1="))
    .map((part) => hexToBytes(part.slice(3)))
    .filter((bytes): bytes is Uint8Array => bytes !== null);
  const secrets =
    typeof options.secret === "string" ? [options.secret] : options.secret;
  if (secrets.length === 0 || secrets.some((secret) => !secret))
    throw new MiRotaractWebhookError(
      "invalid_signature",
      "Falta el secreto del webhook",
    );

  let valid = false;
  for (const secret of secrets) {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    for (const candidate of candidates)
      // subtle.verify compares in constant time.
      if (
        await crypto.subtle.verify(
          "HMAC",
          key,
          candidate as BufferSource,
          signed as BufferSource,
        )
      )
        valid = true;
  }
  if (!valid)
    throw new MiRotaractWebhookError(
      "invalid_signature",
      "La firma no coincide: revisá el secreto y que estés usando el cuerpo crudo",
    );

  let event: unknown;
  try {
    event = JSON.parse(decoder.decode(body));
  } catch {
    throw new MiRotaractWebhookError("invalid_payload", "El cuerpo no es JSON");
  }
  const candidate = event as Partial<MiRotaractEvent>;
  if (
    !candidate ||
    typeof candidate !== "object" ||
    typeof candidate.id !== "string" ||
    typeof candidate.type !== "string"
  )
    throw new MiRotaractWebhookError(
      "invalid_payload",
      "El cuerpo no es un evento de Mi Rotaract",
    );
  return event as E;
}

// --- Fetch-style handler (Next.js App Router, Hono, Remix, edge) ------------

export type WebhookHandlerOptions<E extends MiRotaractEvent> = {
  secret: string | readonly string[];
  toleranceSec?: number;
  /**
   * Your logic. Throwing makes the handler answer 500, so Mi Rotaract
   * retries later. Answer fast (< 10 s): queue slow work.
   */
  onEvent: (event: E, request: Request) => void | Promise<void>;
};

/**
 * `export const POST = createWebhookHandler({ secret, onEvent })` in
 * `app/api/webhooks/route.ts`. 400 on a bad signature (not retried
 * forever: it will keep failing), 500 if `onEvent` throws, 200 otherwise.
 */
export function createWebhookHandler<
  E extends MiRotaractEvent = MiRotaractWebhookEvent,
>(options: WebhookHandlerOptions<E>): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    let event: E;
    try {
      event = await verifyWebhook<E>({
        payload: new Uint8Array(await request.arrayBuffer()),
        headers: request.headers,
        secret: options.secret,
        toleranceSec: options.toleranceSec,
      });
    } catch (error) {
      if (error instanceof MiRotaractWebhookError)
        return Response.json(
          { error: error.code, error_description: error.message },
          { status: 400 },
        );
      throw error;
    }
    try {
      await options.onEvent(event, request);
    } catch {
      return Response.json({ error: "handler_failed" }, { status: 500 });
    }
    return Response.json({ received: true });
  };
}
