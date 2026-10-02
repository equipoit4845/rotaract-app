import type { MiRotaractAuth } from "./auth.ts";
import { MiRotaractError, MiRotaractOAuthError } from "./errors.ts";
import type { UserInfo } from "./types.ts";
import {
  MiRotaractWebhookError,
  verifyWebhook,
  type MiRotaractEvent,
} from "./webhooks.ts";

/**
 * Express adapter (no dependency on express: works with any connect-style
 * framework).
 *
 * `requireMiRotaractUser()` protects routes of YOUR backend:
 *
 * - `source: "bearer"` (default): `Authorization: Bearer <access_token>`
 *   issued by Mi Rotaract to your app (typical for a SPA or mobile app that
 *   logged in with a PUBLIC client and calls your API). Validation:
 *   - `verify: "userinfo"` (default): asks `/oauth/userinfo`, so revoked
 *     consents, suspended apps and disabled accounts are rejected
 *     immediately. Results are cached for `cacheTtlSec` (default 60).
 *   - `verify: "jwt"`: local signature check against the JWKS (no network
 *     per request); can't see revocations until the token expires (10 min).
 * - `source: "session"`: a server-side session (recommended for classic web
 *   apps). You log the person in with `auth.authorizationUrl` /
 *   `auth.exchangeCode`, store `claims` in your session (express-session,
 *   etc.), and pass `getUser: (req) => req.session.miRotaractUser`.
 *
 * On success `req.miRotaract = { user, accessToken? }`; otherwise 401 with
 * `{ error: "invalid_token" }` and `WWW-Authenticate: Bearer`.
 */

export type MiRotaractRequestUser = {
  user: UserInfo;
  accessToken?: string;
};

type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
  miRotaract?: MiRotaractRequestUser;
  [key: string]: unknown;
};

type ResponseLike = {
  status(code: number): ResponseLike;
  setHeader(name: string, value: string): unknown;
  json(body: unknown): unknown;
  headersSent?: boolean;
};

type NextFunction = (error?: unknown) => void;

export type RequireUserOptions =
  | {
      source?: "bearer";
      auth: MiRotaractAuth;
      verify?: "userinfo" | "jwt";
      cacheTtlSec?: number;
      /** Optional extra check, e.g. membership in a given club. Return false → 403. */
      authorize?: (user: UserInfo) => boolean | Promise<boolean>;
    }
  | {
      source: "session";
      getUser: (
        req: RequestLike,
      ) => UserInfo | null | undefined | Promise<UserInfo | null | undefined>;
      authorize?: (user: UserInfo) => boolean | Promise<boolean>;
    };

function unauthorized(res: ResponseLike, description: string): void {
  // Header values must be ASCII; the human-readable text goes in the body.
  res.setHeader("WWW-Authenticate", 'Bearer error="invalid_token"');
  res
    .status(401)
    .json({ error: "invalid_token", error_description: description });
}

class TtlCache<V> {
  private readonly map = new Map<string, { value: V; until: number }>();
  private readonly ttlMs: number;
  private readonly max: number;
  constructor(ttlMs: number, max = 1000) {
    this.ttlMs = ttlMs;
    this.max = max;
  }
  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.until < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }
  set(key: string, value: V): void {
    if (this.map.size >= this.max)
      this.map.delete(this.map.keys().next().value as string);
    this.map.set(key, { value, until: Date.now() + this.ttlMs });
  }
}

export function requireMiRotaractUser(options: RequireUserOptions) {
  const cache =
    options.source !== "session" && (options.cacheTtlSec ?? 60) > 0
      ? new TtlCache<UserInfo>((options.cacheTtlSec ?? 60) * 1000)
      : undefined;

  return async function miRotaractUser(
    req: RequestLike,
    res: ResponseLike,
    next: NextFunction,
  ) {
    try {
      let user: UserInfo | null | undefined;
      let accessToken: string | undefined;
      if (options.source === "session") {
        user = await options.getUser(req);
        if (!user?.sub) return unauthorized(res, "Sesión requerida");
      } else {
        const header = req.headers.authorization;
        const match = (Array.isArray(header) ? header[0] : header)?.match(
          /^Bearer\s+(.+)$/i,
        );
        if (!match) return unauthorized(res, "Falta el token Bearer");
        accessToken = match[1].trim();
        user = cache?.get(accessToken);
        if (!user) {
          try {
            if (options.verify === "jwt") {
              const claims = await options.auth.verifyAccessToken(accessToken);
              user = { sub: claims.sub, scope: claims.scope };
            } else user = await options.auth.userInfo(accessToken);
          } catch (error) {
            if (
              error instanceof MiRotaractOAuthError ||
              (error instanceof MiRotaractError &&
                (error as { status?: number }).status === 401)
            )
              return unauthorized(res, "Token inválido o vencido");
            throw error;
          }
          cache?.set(accessToken, user);
        }
      }
      if (options.authorize && !(await options.authorize(user)))
        return void res.status(403).json({ error: "forbidden" });
      req.miRotaract = { user, ...(accessToken ? { accessToken } : {}) };
      next();
    } catch (error) {
      next(error);
    }
  };
}

// --- Webhooks ----------------------------------------------------------------

export type WebhookRequestLike = RequestLike & {
  body?: unknown;
  miRotaractEvent?: MiRotaractEvent;
  on?: (event: string, listener: (...args: any[]) => void) => unknown;
};

/**
 * Verifies Mi Rotaract webhooks on an Express route. Needs the RAW body:
 * mount it with `express.raw({ type: "application/json" })` (or let it read
 * the stream when no body parser ran). A body already parsed by
 * `express.json()` can't be verified and is rejected with 400.
 *
 * ```ts
 * app.post("/webhooks/mirotaract",
 *   express.raw({ type: "application/json" }),
 *   miRotaractWebhook({ secret: process.env.MIROTARACT_WEBHOOK_SECRET! }),
 *   (req, res) => { handle(req.miRotaractEvent); res.sendStatus(200); });
 * ```
 *
 * On success `req.miRotaractEvent` is the verified event; otherwise 400 with
 * `{ error: <code> }` (no retry will fix a bad signature).
 */
export function miRotaractWebhook(options: {
  secret: string | readonly string[];
  toleranceSec?: number;
}) {
  return async function verifyMiRotaractWebhook(
    req: WebhookRequestLike,
    res: ResponseLike,
    next: NextFunction,
  ) {
    try {
      let payload: string | Uint8Array;
      if (typeof req.body === "string" || req.body instanceof Uint8Array)
        payload = req.body;
      else if (
        req.body !== undefined &&
        req.body !== null &&
        Object.keys(req.body as object).length > 0
      )
        return void res.status(400).json({
          error: "invalid_payload",
          error_description:
            'El cuerpo ya fue parseado (express.json()): usá express.raw({ type: "application/json" }) en esta ruta',
        });
      else payload = await readStream(req);
      req.miRotaractEvent = await verifyWebhook({
        payload,
        headers: req.headers,
        secret: options.secret,
        toleranceSec: options.toleranceSec,
      });
      next();
    } catch (error) {
      if (error instanceof MiRotaractWebhookError)
        return void res
          .status(400)
          .json({ error: error.code, error_description: error.message });
      next(error);
    }
  };
}

function readStream(req: WebhookRequestLike): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (typeof req.on !== "function")
      return reject(
        new MiRotaractWebhookError(
          "invalid_payload",
          "No hay cuerpo para verificar",
        ),
      );
    const chunks: Uint8Array[] = [];
    req.on("data", (chunk: Uint8Array | string) =>
      chunks.push(
        typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk,
      ),
    );
    req.on("end", () => {
      const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
      const out = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
      }
      resolve(out);
    });
    req.on("error", reject);
  });
}
