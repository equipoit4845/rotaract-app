/**
 * Sandbox-only tools (create_test_app, issue_test_token). They work only
 * against a LOCAL kernel (localhost / 127.0.0.1 / ::1, i.e. `mirotaract dev`)
 * whose organizations are all synthetic (codes `SBX-…`), using the local
 * seed's admin account. Any other host is refused before a single request is
 * made: in production the MCP server is read-only docs and contracts.
 */
import { randomUUID } from "node:crypto";

export const DEFAULT_ADMIN = { email: "admin@example.org", password: "sandbox-9999" };
const SANDBOX_PREFIX = "SBX-";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export class SandboxError extends Error {}

/** True only for http(s)://localhost|127.0.0.1|[::1][:port]/… without credentials. */
export function isLocalKernel(baseUrl) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    return false;
  }
  return ["http:", "https:"].includes(url.protocol) && LOCAL_HOSTS.has(url.hostname) && !url.username && !url.password;
}

export function assertLocal(baseUrl) {
  if (!baseUrl)
    throw new SandboxError(
      "No hay kernel configurado. Las herramientas de sandbox solo funcionan con un kernel local: levantalo con `mirotaract dev up` y configurá MIROTARACT_BASE_URL=http://localhost:54321/api/kernel/v1 en el servidor MCP.",
    );
  if (!isLocalKernel(baseUrl))
    throw new SandboxError(
      `Me niego: ${new URL(baseUrl).host} no es un kernel local. create_test_app e issue_test_token solo funcionan contra \`mirotaract dev\` (localhost); contra producción este servidor MCP es solo lectura de documentación y contratos, y nunca crea apps ni emite tokens.`,
    );
}

function decodeJwtForDisplay(token) {
  try {
    const [header, payload] = token.split(".").slice(0, 2).map((p) => JSON.parse(Buffer.from(p, "base64url").toString("utf8")));
    return { header, payload };
  } catch {
    return null;
  }
}

export class Sandbox {
  constructor({ baseUrl, fetch: fetchImpl = globalThis.fetch, admin = DEFAULT_ADMIN, timeoutMs = 15000 }) {
    this.baseUrl = baseUrl?.replace(/\/+$/, "");
    this.fetch = fetchImpl;
    this.admin = admin;
    this.timeoutMs = timeoutMs;
    this.session = null;
    this.lastApp = null;
  }

  async request(path, { method = "GET", token, json, form, basic, headers = {} } = {}) {
    assertLocal(this.baseUrl);
    const init = { method, headers: { accept: "application/json", ...headers }, redirect: "error", signal: AbortSignal.timeout(this.timeoutMs) };
    if (token) init.headers.authorization = `Bearer ${token}`;
    if (basic) init.headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(basic[0])}:${encodeURIComponent(basic[1])}`).toString("base64")}`;
    if (json !== undefined) {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(json);
    }
    if (form) {
      init.headers["content-type"] = "application/x-www-form-urlencoded";
      init.body = new URLSearchParams(form).toString();
    }
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, init);
    } catch (error) {
      throw new SandboxError(`No pude conectarme al kernel local en ${this.baseUrl} (${error.cause?.code ?? error.message}). ¿Corriste \`mirotaract dev up\`?`);
    }
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!response.ok) {
      const detail = body?.error_description ?? body?.detail ?? body?.title ?? body?.error ?? body?.message ?? `HTTP ${response.status}`;
      const error = new SandboxError(`${method} ${path} → ${response.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  /** Logs in with the local seed's admin and checks the data is synthetic. */
  async adminToken() {
    if (this.session && this.session.expiresAt > Date.now() + 30_000) return this.session.token;
    let tokens;
    try {
      tokens = await this.request("/auth/login", { method: "POST", json: { email: this.admin.email, password: this.admin.password } });
    } catch (error) {
      if (error.status === 401 || error.status === 423)
        throw new SandboxError("La cuenta admin del seed sintético no funciona en este kernel: no parece un kernel de `mirotaract dev`. No sigo.");
      throw error;
    }
    const token = tokens?.accessToken;
    if (!token) throw new SandboxError("El kernel no devolvió un token de sesión.");
    const districts = await this.request("/organizations?type=DISTRICT&limit=100", { token });
    const items = Array.isArray(districts) ? districts : (districts?.items ?? []);
    if (!items.length || items.some((o) => !String(o.code ?? "").startsWith(SANDBOX_PREFIX)))
      throw new SandboxError("Este kernel local tiene organizaciones que no son del distrito sintético (códigos SBX-…). Por seguridad no creo apps ni emito tokens.");
    this.session = { token, expiresAt: Date.now() + (tokens.expiresIn ?? 600) * 1000, district: items.find((o) => o.type === "DISTRICT") ?? items[0] };
    return token;
  }

  async organizations() {
    const token = await this.adminToken();
    const all = await this.request("/organizations?limit=100", { token });
    return (Array.isArray(all) ? all : (all?.items ?? [])).filter((o) => String(o.code ?? "").startsWith(SANDBOX_PREFIX));
  }

  /** Registers an app in the synthetic district (or one of its clubs). */
  async createTestApp({ name = "App de prueba (MCP)", type = "CONFIDENTIAL", scopes, grantTypes, redirectUris = [], organization } = {}) {
    for (const uri of redirectUris)
      if (!isLocalKernel(uri) || !uri.startsWith("http"))
        throw new SandboxError(`Dirección de regreso no local: ${uri}. En el sandbox solo http://localhost:<puerto>/….`);
    const token = await this.adminToken();
    const orgs = await this.organizations();
    let org = this.session.district;
    if (organization) {
      const needle = organization.toLowerCase();
      org = orgs.find((o) => o.id === organization || String(o.code).toLowerCase() === needle || String(o.slug ?? "").toLowerCase() === needle || String(o.name).toLowerCase().includes(needle));
      if (!org) throw new SandboxError(`No encontré "${organization}" en el distrito sintético. Opciones: ${orgs.map((o) => `${o.name} (${o.code})`).join(", ")}.`);
    }
    const confidential = type === "CONFIDENTIAL";
    const finalScopes = scopes?.length ? scopes : confidential ? ["kernel.service.organizations.read"] : ["openid", "profile"];
    const finalGrants = grantTypes?.length
      ? grantTypes
      : confidential
        ? [finalScopes.some((s) => s.startsWith("kernel.service.")) ? "client_credentials" : null, redirectUris.length ? "authorization_code" : null].filter(Boolean)
        : ["authorization_code"];
    const created = await this.request("/developer/apps", {
      method: "POST",
      token,
      headers: { "idempotency-key": randomUUID() },
      json: { name, description: "Creada por el servidor MCP de Mi Rotaract en el sandbox local.", type, organizationId: org.id, grantTypes: finalGrants, scopes: finalScopes, redirectUris },
    });
    const app = created.app;
    this.lastApp = { id: app.id, clientId: app.clientId, clientSecret: created.clientSecret ?? null, scopes: app.scopes };
    return {
      sandbox: true,
      app: { id: app.id, clientId: app.clientId, name: app.name, type: app.type, status: app.status, grantTypes: app.grantTypes, scopes: app.scopes, redirectUris: app.redirectUris },
      clientSecret: created.clientSecret ?? null,
      organization: { id: org.id, name: org.name, code: org.code, type: org.type },
      env: [
        `MIROTARACT_ISSUER=${this.baseUrl}`,
        `MIROTARACT_BASE_URL=${this.baseUrl}`,
        `MIROTARACT_CLIENT_ID=${app.clientId}`,
        ...(created.clientSecret ? [`MIROTARACT_CLIENT_SECRET=${created.clientSecret}`] : []),
        `MIROTARACT_APP_ID=${app.id}`,
      ].join("\n"),
    };
  }

  /** client_credentials for a sandbox app (the last one created, by default). */
  async issueTestToken({ clientId, clientSecret, scope } = {}) {
    await this.adminToken(); // same local + synthetic checks before issuing anything
    const id = clientId ?? this.lastApp?.clientId;
    const secret = clientSecret ?? (id === this.lastApp?.clientId ? this.lastApp?.clientSecret : undefined);
    if (!id || !secret) throw new SandboxError("Pasá clientId y clientSecret de una app del sandbox, o creá una antes con create_test_app.");
    const form = { grant_type: "client_credentials" };
    const scopeValue = Array.isArray(scope) ? scope.join(" ") : scope;
    if (scopeValue) form.scope = scopeValue;
    const tokens = await this.request("/oauth/token", { method: "POST", form, basic: [id, secret] });
    const decoded = decodeJwtForDisplay(tokens.access_token);
    return {
      sandbox: true,
      accessToken: tokens.access_token,
      tokenType: tokens.token_type,
      expiresIn: tokens.expires_in,
      scope: tokens.scope,
      claims: decoded?.payload ?? null,
      header: decoded?.header ?? null,
      note: "Token de PRUEBA del kernel local (datos sintéticos). Los claims se muestran decodificados para inspección: tu app no debe confiar en un token sin verificarlo con el JWKS.",
    };
  }
}
