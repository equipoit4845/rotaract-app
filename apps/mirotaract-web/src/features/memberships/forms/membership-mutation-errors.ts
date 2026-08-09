import { KernelApiError } from "@/lib/api";

import {
  describeKernelError,
  type KernelErrorMessage,
} from "@/features/shell/kernel-error-message";

/**
 * `createMembership`'s 409 means exactly one thing per invariant 6.4.1 /
 * CA-MEM-02 (kernel-openapi.yaml documents it on this operation
 * explicitly): a membership for that person already exists in this
 * organization. Everything else falls back to the shared institutional
 * mapping so 403/404/5xx stay consistent with the rest of the app.
 */
export function describeCreateMembershipError(
  error: unknown,
): KernelErrorMessage {
  if (error instanceof KernelApiError && error.status === 409) {
    return {
      title: "Ya existe una membresía para esta persona en esta organización.",
      description: error.detail,
    };
  }
  return describeKernelError(error);
}

/**
 * Every lifecycle transition (activate/leave/resume/deactivate/graduate/
 * reactivate) shares this: a 409 is always `KERNEL_INVALID_TRANSITION`
 * (product spec §19) — never retried automatically, never falls back to a
 * different transition.
 */
export function describeMembershipTransitionError(
  error: unknown,
): KernelErrorMessage {
  if (error instanceof KernelApiError && error.isInvalidTransition) {
    return {
      title: "Esta membresía no puede pasar a ese estado en este momento.",
      description: error.detail,
    };
  }
  return describeKernelError(error);
}
