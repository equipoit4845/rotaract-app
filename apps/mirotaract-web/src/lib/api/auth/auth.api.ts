import { KernelApiError } from "../client/api-error";
import { apiRequest, httpClient } from "../client/http-client";
import { tokenManager } from "../client/token-manager";
import type {
  AcceptAccountInvitationRequest,
  LoginRequest,
  RegisterAccountRequest,
  UserAccount,
  UserContext,
} from "./auth.types";

type BffTokens = { accessToken: string; tokenType: string; expiresIn: number };

async function bffPost(
  path: string,
  init?: RequestInit,
): Promise<BffTokens | null> {
  const response = await fetch(path, { method: "POST", ...init });
  if (!response.ok) {
    const problem = response.headers.get("content-type")?.includes("json")
      ? await response.json().catch(() => null)
      : null;
    throw KernelApiError.fromProblem(response, problem);
  }
  if (response.status === 204) return null;
  return response.json();
}

/**
 * Session exchange (login/logout/refresh) goes through the local `/api/auth/*`
 * BFF routes so the refresh token only ever lives in an httpOnly cookie —
 * see client/session-cookie.server.ts. Everything else calls the Kernel
 * API directly through `httpClient` with the in-memory access token.
 */
export const authApi = {
  async login(credentials: LoginRequest): Promise<void> {
    const tokens = await bffPost("/api/auth/login", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(credentials),
    });
    if (tokens) tokenManager.setSession(tokens.accessToken, tokens.expiresIn);
  },

  async logout(): Promise<void> {
    const token = tokenManager.getAccessToken();
    await bffPost("/api/auth/logout", {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    }).catch(() => undefined);
    tokenManager.clearSession();
  },

  async logoutAll(): Promise<void> {
    const token = tokenManager.getAccessToken();
    await bffPost("/api/auth/logout-all", {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    }).catch(() => undefined);
    tokenManager.clearSession();
  },

  register: (
    payload: RegisterAccountRequest,
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.POST("/auth/register", {
        body: payload,
        signal: opts?.signal,
      }),
    ) as Promise<UserAccount>,

  verifyEmail: (payload: { token: string }, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.POST("/auth/verify-email", {
        body: payload,
        signal: opts?.signal,
      }),
    ),

  requestPasswordReset: (
    payload: { email: string },
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.POST("/auth/forgot-password", {
        body: payload,
        signal: opts?.signal,
      }),
    ),

  resetPassword: (
    payload: { token: string; newPassword: string },
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.POST("/auth/reset-password", {
        body: payload,
        signal: opts?.signal,
      }),
    ),

  acceptInvitation: (
    payload: AcceptAccountInvitationRequest,
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.POST("/auth/invitations/accept", {
        body: payload,
        signal: opts?.signal,
      }),
    ) as Promise<UserAccount>,

  me: (opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/auth/me", { signal: opts?.signal }),
    ) as Promise<UserContext>,

  updateMe: (payload: { email: string }) =>
    apiRequest(() =>
      httpClient.PATCH("/auth/me", { body: payload }),
    ) as Promise<UserAccount>,

  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    apiRequest(() => httpClient.PATCH("/auth/me/password", { body: payload })),

  listSessions: (opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/auth/sessions", { signal: opts?.signal }),
    ),

  revokeSession: (sessionId: string) =>
    apiRequest(() =>
      httpClient.DELETE("/auth/sessions/{sessionId}", {
        params: { path: { sessionId } },
      }),
    ),

  suspendAccount: (accountId: string) =>
    apiRequest(() =>
      httpClient.POST("/auth/accounts/{accountId}/suspend", {
        params: { path: { accountId } },
      }),
    ) as Promise<UserAccount>,

  reactivateAccount: (accountId: string) =>
    apiRequest(() =>
      httpClient.POST("/auth/accounts/{accountId}/reactivate", {
        params: { path: { accountId } },
      }),
    ) as Promise<UserAccount>,

  disableAccount: (accountId: string) =>
    apiRequest(() =>
      httpClient.POST("/auth/accounts/{accountId}/disable", {
        params: { path: { accountId } },
      }),
    ) as Promise<UserAccount>,
};
