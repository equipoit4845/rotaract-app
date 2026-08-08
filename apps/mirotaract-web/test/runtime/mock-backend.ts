import { asRequest, rawUrl, setFetchHandler } from "./bootstrap.ts";
import { jsonResponse, problemResponse } from "./render.ts";

/**
 * Simulates just enough of the Kernel + `/api/auth/*` BFF to drive runtime
 * tests: issues rotating access tokens, tracks whether the (conceptual)
 * refresh cookie is still valid, and rejects any Kernel call whose bearer
 * token doesn't match the last one it issued — so a stale in-memory token
 * always 401s exactly like the real backend would after rotation/expiry.
 */
export class MockBackend {
  refreshValid = true;
  currentAccessToken: string | null = null;
  refreshCalls = 0;
  loginCalls = 0;
  logoutCalls = 0;
  logoutAllCalls = 0;
  kernelCalls: {
    method: string;
    url: string;
    auth: string | null;
    idempotencyKey: string | null;
    correlationId: string | null;
  }[] = [];

  /** Configurable per test: handles every non-auth Kernel call once bearer auth passes. */
  kernelHandler: (request: Request) => Promise<Response> | Response = () =>
    problemResponse(404, "NOT_FOUND");

  private tokenCounter = 0;

  constructor() {
    setFetchHandler((input, init) => this.dispatch(input, init));
  }

  issueToken(): string {
    this.tokenCounter += 1;
    this.currentAccessToken = `access-${this.tokenCounter}`;
    return this.currentAccessToken;
  }

  private async dispatch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = rawUrl(input as string | Request);

    if (url.endsWith("/api/auth/login")) {
      this.loginCalls += 1;
      const token = this.issueToken();
      this.refreshValid = true;
      return jsonResponse({ accessToken: token, tokenType: "Bearer", expiresIn: 600 });
    }

    if (url.endsWith("/api/auth/refresh")) {
      this.refreshCalls += 1;
      if (!this.refreshValid) return problemResponse(401, "INVALID_REFRESH");
      const token = this.issueToken();
      return jsonResponse({ accessToken: token, tokenType: "Bearer", expiresIn: 600 });
    }

    if (url.endsWith("/api/auth/logout")) {
      this.logoutCalls += 1;
      this.refreshValid = false;
      return new Response(null, { status: 204 });
    }

    if (url.endsWith("/api/auth/logout-all")) {
      this.logoutAllCalls += 1;
      this.refreshValid = false;
      return new Response(null, { status: 204 });
    }

    const request = await asRequest(input as string | Request, init);
    const auth = request.headers.get("Authorization");
    const token = auth?.replace(/^Bearer /, "") ?? null;
    this.kernelCalls.push({
      method: request.method,
      url: request.url,
      auth: token,
      idempotencyKey: request.headers.get("Idempotency-Key"),
      correlationId: request.headers.get("X-Correlation-Id"),
    });

    if (token !== this.currentAccessToken) {
      return problemResponse(401, "UNAUTHORIZED");
    }
    return this.kernelHandler(request);
  }
}
