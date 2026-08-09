import { KernelApiError } from "@/lib/api";

import {
  describeKernelError,
  type KernelErrorMessage,
} from "@/features/shell/kernel-error-message";

/**
 * `createMembershipApplication`'s 409 means exactly one thing per
 * invariant 6.8.1 — `kernel-openapi.yaml` documents it on the operation
 * explicitly: "Ya existe una solicitud abierta (CA-SOL-01)". Everything
 * else falls back to the shared institutional mapping so 403/404/5xx stay
 * consistent with the rest of the app.
 */
export function describeCreateApplicationError(
  error: unknown,
): KernelErrorMessage {
  if (error instanceof KernelApiError && error.status === 409) {
    return {
      title: "Ya tenés una solicitud abierta para esta organización.",
      description: error.detail,
    };
  }
  return describeKernelError(error);
}

/**
 * Every lifecycle transition (submit/approve/reject/cancel) shares this: a
 * 409 is always `KERNEL_INVALID_TRANSITION` — never retried automatically,
 * never falls back to a different transition.
 */
export function describeApplicationTransitionError(
  error: unknown,
): KernelErrorMessage {
  if (error instanceof KernelApiError && error.isInvalidTransition) {
    return {
      title: "Esta solicitud no puede pasar a ese estado en este momento.",
      description: error.detail,
    };
  }
  return describeKernelError(error);
}
