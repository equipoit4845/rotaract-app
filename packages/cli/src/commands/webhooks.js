import { resolve } from "node:path";

import { parseUrl } from "../lib/args.js";
import { readEnvFile } from "../lib/env-file.js";
import { CliError } from "../lib/errors.js";
import { SseParser } from "../lib/sse.js";

/** Headers that belong to the stream hop, not to the webhook. */
const HOP_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "keep-alive",
  "upgrade",
  "expect",
]);

export const FORWARD_TIMEOUT_MS = 10_000;

/** Flags > environment > env file (.env.local). */
export function resolveListenOptions(values, { cwd, env }) {
  const fileEnv = readEnvFile(resolve(cwd, values["env-file"] ?? ".env.local"));
  const pick = (flag, key) => values[flag] ?? env[key] ?? fileEnv[key];
  if (!values["forward-to"])
    throw new CliError("Falta --forward-to.", {
      hint: "Ejemplo: mirotaract webhooks listen --forward-to http://localhost:3000/api/webhooks",
    });
  const forwardTo = parseUrl(values["forward-to"], "--forward-to");
  const baseUrl = pick("base-url", "MIROTARACT_BASE_URL");
  const appId = pick("app-id", "MIROTARACT_APP_ID");
  const clientId = pick("client-id", "MIROTARACT_CLIENT_ID");
  const clientSecret = pick("client-secret", "MIROTARACT_CLIENT_SECRET");
  const missing = [
    !baseUrl && "MIROTARACT_BASE_URL (--base-url)",
    !appId && "MIROTARACT_APP_ID (--app-id)",
    !clientId && "MIROTARACT_CLIENT_ID (--client-id)",
    !clientSecret && "MIROTARACT_CLIENT_SECRET (--client-secret)",
  ].filter(Boolean);
  if (missing.length)
    throw new CliError(`Faltan datos de la app: ${missing.join(", ")}.`, {
      hint: "`mirotaract dev up` los escribe en .env.local; si no, pasalos como opciones.",
    });
  const events = values.events
    ? values.events
        .split(",")
        .map((type) => type.trim())
        .filter(Boolean)
    : null;
  return {
    forwardTo,
    baseUrl: parseUrl(baseUrl, "MIROTARACT_BASE_URL"),
    appId,
    clientId,
    clientSecret,
    events,
  };
}

/** `membership.*` and exact types. */
export function matchesEvents(type, patterns) {
  if (!patterns || patterns.length === 0) return true;
  return patterns.some((pattern) =>
    pattern.endsWith("*")
      ? String(type).startsWith(pattern.slice(0, -1))
      : pattern === type,
  );
}

export function streamUrl(baseUrl, appId) {
  return `${baseUrl.replace(/\/+$/, "")}/developer-apps/${encodeURIComponent(appId)}/webhooks/stream`;
}

export function backoffDelay(
  attempt,
  { initialMs = 1000, maxMs = 30_000, random = Math.random } = {},
) {
  const ceiling = Math.min(maxMs, initialMs * 2 ** attempt);
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

function time() {
  return new Date().toTimeString().slice(0, 8);
}

/** Re-POSTs one stream event to the developer's endpoint, byte for byte. */
export async function forwardEvent(payload, { forwardTo, fetch, signal }) {
  const headers = {};
  for (const [key, value] of Object.entries(payload.headers ?? {}))
    if (
      !HOP_HEADERS.has(key.toLowerCase()) &&
      value !== undefined &&
      value !== null
    )
      headers[key] = String(value);
  if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type"))
    headers["Content-Type"] = "application/json";
  const timeout = AbortSignal.timeout(FORWARD_TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(forwardTo, {
      method: "POST",
      headers,
      body: payload.body,
      redirect: "manual",
      signal:
        signal && AbortSignal.any
          ? AbortSignal.any([signal, timeout])
          : timeout,
    });
    await response.arrayBuffer().catch(() => undefined);
    return {
      status: response.status,
      ok: response.ok,
      ms: Date.now() - started,
    };
  } catch (error) {
    const reason =
      error?.name === "TimeoutError"
        ? `sin respuesta en ${FORWARD_TIMEOUT_MS / 1000} s`
        : networkReason(error);
    return { error: reason, ms: Date.now() - started };
  }
}

/**
 * Connects to the kernel's webhook stream and forwards every event until
 * `signal` aborts. Reconnects with exponential backoff + jitter on network
 * errors, 5xx and dropped streams; gives up on 401/403/404 (configuration).
 *
 * @returns {Promise<{ received: number, forwarded: number, failed: number, skipped: number }>}
 */
export async function listenWebhooks(options, ctx) {
  const {
    fetch = globalThis.fetch,
    out,
    err,
    signal,
    sleep = abortableSleep,
  } = ctx;
  const stats = {
    received: 0,
    forwarded: 0,
    failed: 0,
    skipped: 0,
    connections: 0,
  };
  const authorization = `Basic ${Buffer.from(`${options.clientId}:${options.clientSecret}`).toString("base64")}`;
  const url = streamUrl(options.baseUrl, options.appId);
  let attempt = 0;
  let lastEventId;
  let secret;
  let retryHint;
  const maxReconnects = options.maxReconnects ?? Infinity;

  while (!signal?.aborted) {
    let response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: authorization,
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}),
        },
        signal,
      });
    } catch (error) {
      if (signal?.aborted) break;
      err.write(
        `${time()}  No pude conectar con ${url}: ${networkReason(error)}\n`,
      );
      response = null;
    }

    if (response && !response.ok) {
      const body = await response.text().catch(() => "");
      const detail = describeProblem(body);
      if (response.status === 401 || response.status === 403)
        throw new CliError(
          `El kernel rechazó las credenciales de la app (HTTP ${response.status}${detail ? `: ${detail}` : ""}).`,
          {
            hint: "Revisá MIROTARACT_CLIENT_ID / MIROTARACT_CLIENT_SECRET y MIROTARACT_APP_ID (en local: `mirotaract dev up` los reescribe).",
          },
        );
      if (response.status === 404)
        throw new CliError(
          `El kernel no tiene el stream de webhooks para esta app (HTTP 404${detail ? `: ${detail}` : ""}).`,
          {
            hint:
              "Verificá MIROTARACT_APP_ID y que el kernel tenga KERNEL_WEBHOOK_STREAM_ENABLED=true (el kernel local lo trae activado). " +
              "Si tu checkout del kernel es anterior a los webhooks (E7), actualizalo y corré `mirotaract dev up` de nuevo.",
          },
        );
      if (response.status < 500 && response.status !== 429)
        throw new CliError(
          `El kernel respondió HTTP ${response.status}${detail ? `: ${detail}` : ""}.`,
        );
      err.write(
        `${time()}  El kernel respondió HTTP ${response.status}; reintento.\n`,
      );
      response = null;
    }

    if (response) {
      stats.connections += 1;
      let chain = Promise.resolve();
      const parser = new SseParser((event) => {
        if (event.retry !== undefined) retryHint = event.retry;
        if (event.id) lastEventId = event.id;
        if (event.event === "ready") {
          let data = {};
          try {
            data = JSON.parse(event.data || "{}");
          } catch {
            // ignore: secret stays unknown
          }
          attempt = 0;
          if (data.secret && data.secret !== secret) {
            const first = secret === undefined;
            secret = data.secret;
            out.write(
              `${first ? "" : "⚠ El secreto de firma cambió al reconectar.\n"}` +
                `Listo. Reenviando eventos a ${options.forwardTo}\n` +
                `Secreto de firma de esta sesión: ${secret}\n` +
                "  (configuralo como MIROTARACT_WEBHOOK_SECRET en tu app para verificar las firmas)\n",
            );
          } else if (secret) out.write(`${time()}  Reconectado.\n`);
          return;
        }
        if (event.event !== "webhook") return;
        chain = chain.then(() => handleWebhook(event.data));
      });

      const handleWebhook = async (raw) => {
        let payload;
        try {
          payload = JSON.parse(raw);
        } catch {
          err.write(`${time()}  Evento ilegible; lo salteo.\n`);
          return;
        }
        let body = {};
        try {
          body = JSON.parse(payload.body);
        } catch {
          // forwarded as is
        }
        stats.received += 1;
        const type = body.type ?? "?";
        const id = body.id ?? payload.headers?.["MiRotaract-Webhook-Id"] ?? "?";
        if (!matchesEvents(type, options.events)) {
          stats.skipped += 1;
          out.write(`${time()}  ${type}  ${id}  (filtrado)\n`);
          return;
        }
        const result = await forwardEvent(payload, {
          forwardTo: options.forwardTo,
          fetch,
          signal,
        });
        if (result.error) {
          stats.failed += 1;
          out.write(`${time()}  ${type}  ${id}  → error: ${result.error}\n`);
        } else {
          if (result.ok) stats.forwarded += 1;
          else stats.failed += 1;
          out.write(
            `${time()}  ${type}  ${id}  → ${result.status} (${result.ms} ms)\n`,
          );
        }
      };

      try {
        const decoder = new TextDecoder();
        for await (const chunk of response.body)
          parser.push(decoder.decode(chunk, { stream: true }));
        parser.push(decoder.decode());
      } catch (error) {
        if (!signal?.aborted)
          err.write(
            `${time()}  Se cortó la conexión: ${networkReason(error)}\n`,
          );
      }
      await chain;
      if (signal?.aborted) break;
      err.write(`${time()}  El stream terminó; reconectando…\n`);
    }

    if (attempt >= maxReconnects) break;
    const delay = retryHint ?? backoffDelay(attempt, options.backoff);
    attempt += 1;
    await sleep(delay, signal);
  }
  return stats;
}

/** fetch() hides the useful part (ECONNREFUSED…) inside `cause`. */
export function networkReason(error) {
  let current = error;
  for (let depth = 0; current && depth < 4; depth++) {
    const code = current.code ?? current.errors?.find?.((e) => e?.code)?.code;
    if (code && code !== "UND_ERR_SOCKET" && !String(code).startsWith("ERR_")) {
      if (code === "ECONNREFUSED") return "ECONNREFUSED (¿está corriendo?)";
      return code;
    }
    current = current.cause;
  }
  return error?.cause?.message ?? error?.message ?? String(error);
}

function describeProblem(body) {
  try {
    const data = JSON.parse(body);
    return (
      data.detail ??
      data.title ??
      data.error_description ??
      data.error ??
      data.message ??
      ""
    );
  } catch {
    return body.slice(0, 200);
  }
}

function abortableSleep(ms, signal) {
  return new Promise((resolvePromise) => {
    if (signal?.aborted) return resolvePromise();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolvePromise();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

export async function webhooksListenCommand(values, ctx) {
  const options = resolveListenOptions(values, ctx);
  const controller = new AbortController();
  let interrupted = 0;
  const onSignal = () => {
    interrupted += 1;
    if (interrupted > 1) process.exit(130);
    ctx.err.write("\nCortando… (Ctrl-C otra vez para salir ya)\n");
    controller.abort();
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  ctx.err.write(
    `Conectando a ${streamUrl(options.baseUrl, options.appId)} …\n`,
  );
  try {
    const stats = await listenWebhooks(options, {
      ...ctx,
      signal: controller.signal,
    });
    ctx.err.write(
      `Recibidos ${stats.received} · reenviados ${stats.forwarded} · con error ${stats.failed}` +
        `${stats.skipped ? ` · filtrados ${stats.skipped}` : ""}\n`,
    );
    return interrupted ? 130 : 0;
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
}
