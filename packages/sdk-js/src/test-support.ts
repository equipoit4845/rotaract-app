// Test-only: an in-memory fake of the Kernel's OAuth/OIDC + service API,
// exposed as a `fetch` function. Not part of the build.
import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWK,
  type KeyLike,
} from "jose";

export const ISSUER = "https://kernel.test/api/kernel/v1";
export const CLIENT_ID = "mra_0123456789abcdef0123";
export const CLIENT_SECRET = "mrs_secret-value";
export const REDIRECT_URI = "https://app.test/callback";

export type Recorded = {
  method: string;
  url: URL;
  headers: Headers;
  body: string;
  form: URLSearchParams;
  json: any;
};

type Reply = {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
};
type Handler = (req: Recorded) => Reply | Promise<Reply>;

export class FakeKernel {
  calls: Recorded[] = [];
  routes = new Map<string, Handler>();
  keys: Array<{ kid: string; privateKey: KeyLike; jwk: JWK }> = [];
  /** Keys published in the JWKS (by kid); defaults to all. */
  published: string[] | undefined;
  tokenCounter = 0;
  tokenExpiresIn = 600;

  static async create(): Promise<FakeKernel> {
    const kernel = new FakeKernel();
    await kernel.addKey("k1");
    kernel.installDefaults();
    return kernel;
  }

  async addKey(kid: string) {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const jwk = {
      ...(await exportJWK(publicKey)),
      kid,
      alg: "ES256",
      use: "sig",
    };
    this.keys.push({ kid, privateKey, jwk });
  }

  async sign(
    claims: Record<string, unknown>,
    options: {
      kid?: string;
      audience?: string;
      issuer?: string;
      expiresIn?: number;
      subject?: string;
    } = {},
  ): Promise<string> {
    const key = this.keys.find(
      (k) => k.kid === (options.kid ?? this.keys[0].kid),
    )!;
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256", kid: key.kid })
      .setIssuer(options.issuer ?? ISSUER)
      .setAudience(options.audience ?? CLIENT_ID)
      .setSubject(options.subject ?? "person_1")
      .setIssuedAt(now)
      .setExpirationTime(now + (options.expiresIn ?? 600))
      .sign(key.privateKey);
  }

  on(method: string, path: string, handler: Handler) {
    this.routes.set(`${method} ${path}`, handler);
  }

  callsTo(method: string, path: string): Recorded[] {
    return this.calls.filter(
      (c) =>
        c.method === method &&
        c.url.pathname === new URL(ISSUER + path).pathname,
    );
  }

  private installDefaults() {
    this.on("GET", "/.well-known/openid-configuration", () => ({
      body: {
        issuer: ISSUER,
        authorization_endpoint: "https://web.test/oauth/authorize",
        token_endpoint: `${ISSUER}/oauth/token`,
        userinfo_endpoint: `${ISSUER}/oauth/userinfo`,
        revocation_endpoint: `${ISSUER}/oauth/revoke`,
        jwks_uri: `${ISSUER}/.well-known/jwks.json`,
        code_challenge_methods_supported: ["S256"],
      },
    }));
    this.on("GET", "/.well-known/jwks.json", () => ({
      body: {
        keys: this.keys
          .filter((k) => !this.published || this.published.includes(k.kid))
          .map((k) => k.jwk),
      },
    }));
    this.on("POST", "/oauth/token", (req) => {
      const auth = req.headers.get("authorization");
      const basic = auth?.startsWith("Basic ")
        ? atob(auth.slice(6)).split(":").map(decodeURIComponent)
        : undefined;
      const secret = basic?.[1] ?? req.form.get("client_secret");
      if (secret !== CLIENT_SECRET)
        return {
          status: 401,
          body: {
            error: "invalid_client",
            error_description: "Client authentication failed",
          },
        };
      if (req.form.get("grant_type") === "client_credentials") {
        this.tokenCounter++;
        return {
          body: {
            access_token: `svc_${this.tokenCounter}`,
            token_type: "Bearer",
            expires_in: this.tokenExpiresIn,
            scope:
              "kernel.service.organizations.read kernel.service.memberships.read",
          },
        };
      }
      return { status: 400, body: { error: "unsupported_grant_type" } };
    });
  }

  fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? init.body : "";
    const recorded: Recorded = {
      method,
      url,
      headers,
      body,
      form: new URLSearchParams(
        headers.get("content-type")?.includes("form") ? body : "",
      ),
      json:
        headers.get("content-type")?.includes("json") && body
          ? JSON.parse(body)
          : undefined,
    };
    this.calls.push(recorded);
    const path = url.pathname.replace(new URL(ISSUER).pathname, "");
    let handler = this.routes.get(`${method} ${path}`);
    if (!handler)
      for (const [key, candidate] of this.routes) {
        const [m, pattern] = key.split(" ");
        if (m !== method || !pattern.includes(":")) continue;
        const regex = new RegExp(`^${pattern.replace(/:[^/]+/g, "[^/]+")}$`);
        if (regex.test(path)) handler = candidate;
      }
    if (!handler)
      return new Response(
        JSON.stringify({
          status: 404,
          code: "KERNEL_HTTP_404",
          title: "Request failed",
          detail: `No route ${method} ${path}`,
        }),
        {
          status: 404,
          headers: { "content-type": "application/problem+json" },
        },
      );
    const reply = await handler(recorded);
    const status = reply.status ?? 200;
    return new Response(
      reply.body === undefined || status === 304 || status === 204
        ? null
        : JSON.stringify(reply.body),
      {
        status,
        headers: { "content-type": "application/json", ...reply.headers },
      },
    );
  };
}

export const noSleep = async () => undefined;
