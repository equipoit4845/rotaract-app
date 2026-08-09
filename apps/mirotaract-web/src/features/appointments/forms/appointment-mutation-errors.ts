import { KernelApiError } from "@/lib/api";

import {
  describeKernelError,
  type KernelErrorMessage,
} from "@/features/shell/kernel-error-message";

/**
 * `createAppointment` doesn't document a stable `code` for its error
 * responses in `kernel-openapi.yaml` (only 201 is documented) even though
 * kernel-spec.md §6.6 states plenty of validation rules that surely surface
 * as 409/422 (membership not ACTIVE, wrong scope, period mismatch). Per
 * product convention (never invent a `code` the contract doesn't state),
 * this normalizes by HTTP status only.
 */
export function describeCreateAppointmentError(
  error: unknown,
): KernelErrorMessage {
  if (error instanceof KernelApiError) {
    if (error.status === 422) {
      return {
        title: "Los datos ingresados no son válidos para este cargo.",
        description:
          error.detail ??
          "Revisá que la membresía esté activa y pertenezca al alcance correcto (invariantes 6.6.1–6.6.4).",
      };
    }
    if (error.status === 409) {
      return {
        title: "No se pudo crear el cargo en este estado.",
        description: error.detail,
      };
    }
  }
  return describeKernelError(error);
}

/**
 * Every Appointment lifecycle transition (elect/activate/end/revoke) shares
 * this: a 409 is always `KERNEL_INVALID_TRANSITION` per the state machine
 * (`kernel-spec.md` §7.5), or — for `activate` specifically — a singleton
 * conflict (CA-APP-02, `kernel-openapi.yaml` documents both under the same
 * undiscriminated 409 on that operation). Neither is distinguishable by a
 * stable `code` the contract states, so both are normalized to the same
 * message per product convention (never guess a `code`).
 */
export function describeAppointmentTransitionError(
  error: unknown,
): KernelErrorMessage {
  if (
    error instanceof KernelApiError &&
    (error.isInvalidTransition || error.status === 409)
  ) {
    return {
      title: "Este cargo no puede pasar a ese estado en este momento.",
      description:
        error.detail ??
        "Puede deberse a una transición inválida o a que ya existe un titular activo para este cargo singleton (CA-APP-02).",
    };
  }
  return describeKernelError(error);
}
