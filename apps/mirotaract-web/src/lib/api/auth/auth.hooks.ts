"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useIsAuthenticated } from "../client/use-is-authenticated";
import { authApi } from "./auth.api";
import { authKeys } from "./auth.keys";
import type {
  AcceptAccountInvitationRequest,
  LoginRequest,
  RegisterAccountRequest,
} from "./auth.types";

/** The logged-in `UserContext` (accountId, personId, memberships, platformRole). `null` when signed out. */
export function useCurrentUser() {
  const isAuthenticated = useIsAuthenticated();
  return useQuery({
    queryKey: authKeys.currentUser(),
    queryFn: ({ signal }) => authApi.me({ signal }),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: LoginRequest) => authApi.login(credentials),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: authKeys.currentUser() }),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => queryClient.clear(),
  });
}

export function useLogoutAllSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logoutAll(),
    onSuccess: () => queryClient.clear(),
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (payload: RegisterAccountRequest) => authApi.register(payload),
  });
}

export function useVerifyEmail() {
  return useMutation({
    mutationFn: (payload: { token: string }) => authApi.verifyEmail(payload),
  });
}

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (payload: { email: string }) =>
      authApi.requestPasswordReset(payload),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (payload: { token: string; newPassword: string }) =>
      authApi.resetPassword(payload),
  });
}

export function useAcceptInvitation() {
  return useMutation({
    mutationFn: (payload: AcceptAccountInvitationRequest) =>
      authApi.acceptInvitation(payload),
  });
}

export function useUpdateOwnAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { email: string }) => authApi.updateMe(payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: authKeys.currentUser() }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (payload: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(payload),
  });
}

export function useSessions() {
  const isAuthenticated = useIsAuthenticated();
  return useQuery({
    queryKey: authKeys.sessions(),
    queryFn: ({ signal }) => authApi.listSessions({ signal }),
    enabled: isAuthenticated,
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => authApi.revokeSession(sessionId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: authKeys.sessions() }),
  });
}

export function useSuspendAccount() {
  return useMutation({
    mutationFn: (accountId: string) => authApi.suspendAccount(accountId),
  });
}

export function useReactivateAccount() {
  return useMutation({
    mutationFn: (accountId: string) => authApi.reactivateAccount(accountId),
  });
}

export function useDisableAccount() {
  return useMutation({
    mutationFn: (accountId: string) => authApi.disableAccount(accountId),
  });
}
