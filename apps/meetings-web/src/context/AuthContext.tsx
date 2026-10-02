"use client";

/**
 * Replaces the legacy AuthContext (email/password + JWT in localStorage).
 * Identity now comes from "Ingresar con Mi Rotaract" (encrypted session
 * cookie); the role the meetings screens guard on comes from
 * `GET /meetings-api/auth/me`. The hook names and the `{ user, token,
 * isLoading }` shape are kept so the ported screens work unchanged.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { authApi, type MeResponse } from "@/lib/api";
import {
  getCachedToken,
  onTokenChange,
  SessionExpiredError,
} from "@/lib/session-token";
import type { AuthUser, Role } from "@/types/auth";

type AuthContextType = {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  /** Set when meetings-api could not be reached (not when the session expired). */
  error: string | null;
};

type AuthActionsContextType = {
  logout: () => void;
  reload: () => void;
};

const AuthStateContext = createContext<AuthContextType | null>(null);
const AuthActionsContext = createContext<AuthActionsContextType | null>(null);

/** Maps `GET /meetings-api/auth/me` to the legacy `AuthUser` shape. */
export function toAuthUser(data: MeResponse | { user: MeResponse }): AuthUser {
  const me = "user" in data && data.user ? data.user : (data as MeResponse);
  return {
    id: me.id,
    fullName: me.fullName,
    email: me.email,
    role: me.role as Role,
    memberships: (me.clubs ?? []).map((club) => ({
      clubId: club.id,
      clubName: club.name,
      clubCode: "",
      title: club.isPresident ? "Presidente" : null,
      isPresident: club.isPresident,
    })),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => onTokenChange(setToken), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    authApi
      .me()
      .then((data) => {
        if (cancelled) return;
        setUser(toAuthUser(data));
        setToken(getCachedToken());
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setUser(null);
        // A SessionExpiredError already redirected to /auth/login.
        if (!(e instanceof SessionExpiredError)) {
          setError(
            e instanceof Error
              ? e.message
              : "No se pudo conectar con el servidor de reuniones",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const logout = useCallback(() => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/auth/logout";
    document.body.appendChild(form);
    form.submit();
  }, []);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const stateValue = useMemo(
    () => ({ user, token, isLoading, error }),
    [user, token, isLoading, error],
  );
  const actionsValue = useMemo(() => ({ logout, reload }), [logout, reload]);

  return (
    <AuthStateContext.Provider value={stateValue}>
      <AuthActionsContext.Provider value={actionsValue}>
        {children}
      </AuthActionsContext.Provider>
    </AuthStateContext.Provider>
  );
}

export function useAuthState() {
  const ctx = useContext(AuthStateContext);
  if (!ctx) throw new Error("useAuthState must be used within AuthProvider");
  return ctx;
}

export function useAuthActions() {
  const ctx = useContext(AuthActionsContext);
  if (!ctx) throw new Error("useAuthActions must be used within AuthProvider");
  return ctx;
}

export function useAuth() {
  const state = useAuthState();
  const actions = useAuthActions();
  return { ...state, ...actions };
}

/** Legacy helper: the current meetings token (memory only). */
export function getStoredToken(): string | null {
  return getCachedToken();
}
