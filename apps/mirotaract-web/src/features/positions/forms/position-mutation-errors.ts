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
 * Attach/detach failures in plain language. 409: the position derives no
 * role, or its role is shared with another organization's positions.
 * 403: the caller can't edit it, or the permission is district-only and the
 * position belongs to a club.
 */
export function describePositionPermissionError(
  error: unknown,
): KernelErrorMessage {
  if (error instanceof KernelApiError && error.status === 409) {
    return {
      title: "No se puede cambiar lo que permite este cargo.",
      description:
        "Este cargo comparte sus permisos con cargos de otra organización. Pedile al distrito que lo revise.",
    };
  }
  if (
    error instanceof KernelApiError &&
    error.status === 403 &&
    error.detail?.includes("only be granted by the district")
  ) {
    return {
      title: "Ese permiso no se puede dar desde un club.",
      description:
        "Algunos permisos (por ejemplo, crear o mover clubes, u otorgar roles) los decide solo el distrito.",
    };
  }
  return describeKernelError(error);
}
