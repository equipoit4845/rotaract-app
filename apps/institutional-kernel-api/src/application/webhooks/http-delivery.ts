import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";

import { DELIVERY_TIMEOUT_MS } from "./retry-schedule";
import {
  guardedLookup,
  validateWebhookUrl,
  type LookupAll,
  type WebhookUrlPolicy,
} from "./ssrf-guard";

export type DeliveryResult = {
  ok: boolean;
  status: number | null;
  /** First RESPONSE_EXCERPT_BYTES of the answer (text). */
  responseExcerpt: string | null;
  latencyMs: number;
  error: string | null;
};

export const RESPONSE_EXCERPT_BYTES = 1_024;

/**
 * One POST, no redirects, hard 10 s budget for the whole exchange
 * (connect + answer). Never throws: every outcome is a DeliveryResult.
 * Only 2xx counts as delivered.
 */
export function postWebhook(input: {
  url: string;
  headers: Record<string, string>;
  body: string;
  policy: WebhookUrlPolicy;
  timeoutMs?: number;
  lookupAll?: LookupAll;
}): Promise<DeliveryResult> {
  const started = Date.now();
  const timeoutMs = input.timeoutMs ?? DELIVERY_TIMEOUT_MS;
  const finish = (
    partial: Partial<DeliveryResult> & { ok: boolean },
  ): DeliveryResult => ({
    status: null,
    responseExcerpt: null,
    error: null,
    ...partial,
    latencyMs: Date.now() - started,
  });

  let url: URL;
  try {
    // Re-checked on every delivery: the policy may have changed since the
    // endpoint was registered.
    url = new URL(validateWebhookUrl(input.url, input.policy));
  } catch (error) {
    return Promise.resolve(
      finish({ ok: false, error: (error as Error).message }),
    );
  }

  return new Promise((resolve) => {
    let settled = false;
    const done = (result: DeliveryResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = send(
      url,
      {
        method: "POST",
        headers: {
          ...input.headers,
          "Content-Length": String(Buffer.byteLength(input.body)),
        },
        // IP literals skip `lookup`; validateWebhookUrl already judged them.
        lookup: guardedLookup(input.policy, input.lookupAll) as never,
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          if (size < RESPONSE_EXCERPT_BYTES) {
            chunks.push(chunk);
            size += chunk.length;
          }
          if (size >= RESPONSE_EXCERPT_BYTES) res.destroy();
        });
        const complete = () => {
          const status = res.statusCode ?? 0;
          const excerpt = Buffer.concat(chunks)
            .subarray(0, RESPONSE_EXCERPT_BYTES)
            .toString("utf8");
          done(
            finish({
              ok: status >= 200 && status < 300,
              status,
              responseExcerpt: excerpt || null,
              error:
                status >= 200 && status < 300
                  ? null
                  : status >= 300 && status < 400
                    ? `Redirección ${status}: los webhooks no siguen redirecciones`
                    : `Respuesta ${status}`,
            }),
          );
        };
        res.on("end", complete);
        res.on("close", complete);
        res.on("error", complete);
      },
    );
    const timer = setTimeout(() => {
      req.destroy(new Error("timeout"));
      done(
        finish({
          ok: false,
          error: `Sin respuesta en ${Math.round(timeoutMs / 1_000)} s`,
        }),
      );
    }, timeoutMs);
    req.on("error", (error: NodeJS.ErrnoException) =>
      done(
        finish({
          ok: false,
          error:
            error.code === "EWEBHOOKBLOCKED"
              ? error.message
              : `${error.code ?? "ERROR"}: ${error.message}`.slice(0, 300),
        }),
      ),
    );
    req.end(input.body);
  });
}
