import { KernelApiError } from "@/lib/api";

import {
  describeKernelError,
  type KernelErrorMessage,
} from "@/features/shell/kernel-error-message";

/**
 * Login-specific mapping. `POST /auth/login` folds "credenciales
 * inválidas" and "cuenta no verificada" into the same 401 (kernel-openapi.yaml
 * doesn't expose a stable `code` to tell them apart) — showing one generic
 * message for both is deliberate, not a gap: distinguishing them here would
 * leak account existence (product spec §15). 423 (cuenta bloqueada) and 429
 * (rate limit) are genuinely distinct statuses, so those get their own copy.
 */
export function describeLoginError(error: unknown): KernelErrorMessage {
  if (error instanceof KernelApiError) {
    if (error.isLocked) {
      return {
        title: "Esta cuenta está bloqueada por intentos fallidos.",
        description: "Probá de nuevo más tarde o recuperá tu contraseña.",
      };
    }
    if (error.isRateLimited) {
      return { title: "Demasiados intentos. Intentá nuevamente más tarde." };
    }
    if (error.isAuthError) {
      return { title: "Las credenciales ingresadas no son válidas." };
    }
  }
  return describeKernelError(error);
}

/** `POST /auth/register` — 409 means the email is already registered (CA-ID-02). */
export function describeRegisterError(error: unknown): KernelErrorMessage {
  if (error instanceof KernelApiError) {
    if (error.status === 409) {
      return { title: "Ya existe una cuenta registrada con ese email." };
    }
    if (error.isRateLimited) {
      return { title: "Demasiados intentos. Intentá nuevamente más tarde." };
    }
  }
  return describeKernelError(error);
}

/** `POST /auth/verify-email` — 410 means the token was already used or expired. */
export function describeVerifyEmailError(error: unknown): KernelErrorMessage {
  if (error instanceof KernelApiError && error.isGone) {
    return {
      title: "Este enlace de verificación ya no es válido.",
      description: "Puede haber sido usado antes o haber vencido.",
    };
  }
  return describeKernelError(error);
}

/**
 * `POST /auth/invitations/accept` — 409 covers three cases the Kernel
 * folds together (invitación ya consumida, revocada, o la persona ya tiene
 * cuenta); the contract gives no stable `code` to tell them apart, so this
 * shows one honest generic message instead of guessing which one it was.
 */
export function describeAcceptInvitationError(
  error: unknown,
): KernelErrorMessage {
  if (error instanceof KernelApiError) {
    if (error.status === 409) {
      return {
        title: "Esta invitación ya no está disponible.",
        description:
          "Puede haber sido aceptada, revocada, o la persona ya tiene una cuenta.",
      };
    }
    if (error.isRateLimited) {
      return { title: "Demasiados intentos. Intentá nuevamente más tarde." };
    }
  }
  return describeKernelError(error);
}

/** `POST /auth/reset-password` — 410 means the token was already used or expired (CA-ID-05). */
export function describeResetPasswordError(error: unknown): KernelErrorMessage {
  if (error instanceof KernelApiError && error.isGone) {
    return {
      title: "Este enlace de recuperación ya no es válido.",
      description: "Puede haber sido usado antes o haber vencido.",
    };
  }
  return describeKernelError(error);
}
