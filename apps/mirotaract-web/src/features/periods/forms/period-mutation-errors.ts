import { KernelApiError } from "@/lib/api";

import {
  describeKernelError,
  type KernelErrorMessage,
} from "@/features/shell/kernel-error-message";

/**
 * `createPeriod`'s documented 422 means exactly one thing
 * (kernel-openapi.yaml, CA-PER-01/01a): the dates don't run 1 de julio →
 * 30 de junio del año siguiente. `updateDraftPeriod` shares the same date
 * fields/invariant even though its own 409 is documented for "not DRAFT"
 * instead — this mapper only special-cases 422, so an update's 409 falls
 * through to the shared institutional mapping untouched.
 */
export function describePeriodDatesError(error: unknown): KernelErrorMessage {
  if (error instanceof KernelApiError && error.status === 422) {
    return {
      title:
        "Las fechas no son válidas: el período debe ir del 1 de julio al 30 de junio del año siguiente.",
      description: error.detail,
    };
  }
  return describeKernelError(error);
}

/**
 * `activatePeriod`'s 409 (`InvalidTransition` response, kernel-openapi.yaml)
 * has no documented stable `code` distinguishing "not SCHEDULED"
 * (invariant 6.5.5) from "another period is already ACTIVE for this
 * organization" (invariant 6.5.3) — both invariants share the exact same
 * response shape, so this is normalized by HTTP status only, never guessed
 * from `error.detail` text and never detected/prevented client-side before
 * submitting (product spec: no frontend workaround for the two-ACTIVE-
 * periods conflict).
 */
export function describeActivatePeriodError(
  error: unknown,
): KernelErrorMessage {
  if (error instanceof KernelApiError && error.status === 409) {
    return {
      title:
        "No se pudo activar el período: sólo puede activarse desde SCHEDULED y no puede haber otro período ACTIVE en esta organización.",
      description: error.detail,
    };
  }
  return describeKernelError(error);
}
