import { KernelApiError } from "@/lib/api";

import {
  describeKernelError,
  type KernelErrorMessage,
} from "@/features/shell/kernel-error-message";

/**
 * Normalizes create/update errors per product spec §19: 409 → duplicate
 * code/slug, 422 → invalid hierarchy/data, everything else falls back to
 * the shared institutional mapping (`describeKernelError`) so 403/404/5xx
 * stay consistent with the rest of the app.
 */
export function describeOrganizationMutationError(
  error: unknown,
): KernelErrorMessage {
  if (error instanceof KernelApiError) {
    if (error.status === 409) {
      return {
        title: "Ya existe una organización con ese código o slug.",
        description: error.detail,
      };
    }
    if (error.status === 422) {
      return {
        title:
          "Los datos ingresados no son válidos para esta jerarquía institucional.",
        description: error.detail,
      };
    }
  }
  return describeKernelError(error);
}

/**
 * `moveOrganization`'s 409 means exactly one thing per
 * `kernel-openapi.yaml` (CA-ORG-03): the move would create a hierarchical
 * cycle. There's no stable `code` documented for it yet, so this is
 * identified by endpoint + status, never guessed by the frontend itself
 * (product spec §29 — cycles are never detected client-side).
 */
export function describeMoveOrganizationError(
  error: unknown,
): KernelErrorMessage {
  if (error instanceof KernelApiError && error.status === 409) {
    return {
      title:
        "No se puede mover esta organización porque generaría una jerarquía circular.",
      description: error.detail,
    };
  }
  return describeKernelError(error);
}
