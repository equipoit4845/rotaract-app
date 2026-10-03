/**
 * Pure logic of the "Probar" panel (kept dependency-free so it is unit
 * tested with `node --test`). The panel never persists the token: it lives
 * in React state only, and is sent only to the base URL the developer chose.
 */

export type TryOperation = {
  method: string;
  path: string;
  auth: string[];
  parameters: Array<{ name: string; in: string; required: boolean }>;
  bodyContentType?: string;
};

export type TryInput = {
  baseUrl: string;
  token?: string;
  clientId?: string;
  clientSecret?: string;
  pathValues: Record<string, string>;
  queryValues: Record<string, string>;
  body?: string;
  idempotencyKey?: string;
  correlationId?: string;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** True for a kernel on this machine (the `mirotaract dev up` one, or any local port). */
export function isLocalBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return LOCAL_HOSTS.has(url.hostname) || url.hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}

/** Real hosts (anything not local) need an explicit confirmation for every request. */
export function needsConfirmation(baseUrl: string): boolean {
  return !isLocalBaseUrl(baseUrl);
}

export function isProductionBaseUrl(baseUrl: string): boolean {
  try {
    return /(^|\.)rotaract4845\.com$/.test(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

export function validateBaseUrl(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:")
      return "La URL tiene que empezar con http:// o https://";
    if (url.protocol === "http:" && !isLocalBaseUrl(baseUrl))
      return "Fuera de localhost, usá https://";
    return null;
  } catch {
    return "No es una URL válida";
  }
}

function base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export type BuiltRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  missing: string[];
};

export function buildRequest(
  operation: TryOperation,
  input: TryInput,
): BuiltRequest {
  const missing: string[] = [];
  const path = operation.path.replace(
    /\{([^}]+)\}/g,
    (_match, name: string) => {
      const value = input.pathValues[name]?.trim();
      if (!value) missing.push(name);
      return encodeURIComponent(value ?? "");
    },
  );
  const query = new URLSearchParams();
  for (const parameter of operation.parameters.filter(
    (p) => p.in === "query",
  )) {
    const value = input.queryValues[parameter.name]?.trim();
    if (value) query.set(parameter.name, value);
    else if (parameter.required) missing.push(parameter.name);
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (input.correlationId) headers["X-Correlation-Id"] = input.correlationId;
  if (operation.auth.includes("client")) {
    if (input.clientId && input.clientSecret)
      headers.Authorization = `Basic ${base64(
        `${encodeURIComponent(input.clientId)}:${encodeURIComponent(input.clientSecret)}`,
      )}`;
    else if (!input.clientId) missing.push("client_id");
  } else if (!operation.auth.includes("none")) {
    if (input.token?.trim())
      headers.Authorization = `Bearer ${input.token.trim()}`;
    else missing.push("token");
  }
  const needsKey = operation.parameters.some(
    (parameter) =>
      parameter.in === "header" &&
      parameter.name.toLowerCase() === "idempotency-key" &&
      parameter.required,
  );
  if (needsKey)
    headers["Idempotency-Key"] = input.idempotencyKey ?? crypto.randomUUID();
  let body: string | undefined;
  if (
    operation.method !== "GET" &&
    operation.method !== "DELETE" &&
    input.body?.trim()
  ) {
    body = input.body.trim();
    headers["Content-Type"] = operation.bodyContentType ?? "application/json";
  }
  const base = input.baseUrl.replace(/\/+$/, "");
  return {
    url: `${base}${path}${query.size ? `?${query}` : ""}`,
    method: operation.method,
    headers,
    body,
    missing,
  };
}

/** Headers worth showing from a response. */
export const INTERESTING_HEADERS = [
  "x-trace-id",
  "deprecation",
  "sunset",
  "link",
  "etag",
  "retry-after",
  "content-type",
];
