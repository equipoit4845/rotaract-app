import { KernelApiError } from "@/lib/api";

import {
  describeKernelError,
  type KernelErrorMessage,
} from "@/features/shell/kernel-error-message";

/**
 * `requestMembershipTransfer`'s 409 means exactly one thing per invariant
 * 6.9.3: only one open transfer per membership at a time
 * (kernel-openapi.yaml documents this on the operation). Everything else
 * falls back to the shared institutional mapping so 403/404/5xx stay
 * consistent with the rest of the app. Same shape as
 * `describeCreateMembershipError` (Memberships, US-MEM-03), duplicated
 * locally on purpose (product spec §32).
 */
export function describeRequestTransferError(
  error: unknown,
): KernelErrorMessage {
  if (error instanceof KernelApiError && error.status === 409) {
    return {
      title: "Ya existe una transferencia abierta para esta membresía.",
      description: error.detail,
    };
  }
  return describeKernelError(error);
}

/**
 * Every transition (accept/confirm/complete/reject/cancel) shares this: a
 * 409 is always `KERNEL_INVALID_TRANSITION` (product spec §19) — never
 * retried automatically, never falls back to a different transition.
 */
export function describeTransferTransitionError(
  error: unknown,
): KernelErrorMessage {
  if (error instanceof KernelApiError && error.isInvalidTransition) {
    return {
      title: "Esta transferencia no puede pasar a ese estado en este momento.",
      description: error.detail,
    };
  }
  return describeKernelError(error);
}
