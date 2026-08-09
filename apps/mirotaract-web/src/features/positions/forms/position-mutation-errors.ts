import { KernelApiError } from "@/lib/api";

import {
  describeKernelError,
  type KernelErrorMessage,
} from "@/features/shell/kernel-error-message";

/**
 * `createPositionDefinition`/`updatePositionDefinition` don't document a
 * stable `code` for their error responses beyond the generic 403
 * (`kernel-openapi.yaml` only documents 403 explicitly on `update`) — so
 * this stays a thin pass-through to the shared institutional mapping rather
 * than inventing a `code` the contract doesn't state (product spec §19).
 */
export function describePositionMutationError(
  error: unknown,
): KernelErrorMessage {
  return describeKernelError(error);
}

/**
 * `attachPermissionToPosition`/`detachPermissionFromPosition` document one
 * specific 409 (kernel-spec.md §6.6.1.5, kernel-openapi.yaml CA-POS-02):
 * the cargo has no `defaultRoleCode` (technical role) to attach/detach a
 * permission from.
 */
export function describePositionPermissionError(
  error: unknown,
): KernelErrorMessage {
  if (error instanceof KernelApiError && error.status === 409) {
    return {
      title: "Este cargo no tiene un rol técnico asociado.",
      description:
        "Asigná un rol técnico (defaultRoleCode) antes de gestionar sus permisos.",
    };
  }
  return describeKernelError(error);
}
