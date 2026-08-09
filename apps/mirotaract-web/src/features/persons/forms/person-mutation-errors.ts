import { KernelApiError } from "@/lib/api";

import {
  describeKernelError,
  type KernelErrorMessage,
} from "@/features/shell/kernel-error-message";

/**
 * `kernel-openapi.yaml` doesn't document a per-operation error catalog for
 * `createPerson`/`updatePerson` beyond the success response — normalized
 * by generic HTTP status (product spec §15), same reasoning as
 * Organizations' `describeOrganizationMutationError`. No specific `code`
 * is invented for a case the contract doesn't distinguish.
 */
export function describePersonMutationError(
  error: unknown,
): KernelErrorMessage {
  if (error instanceof KernelApiError) {
    if (error.status === 409) {
      return {
        title: "Ya existe una persona equivalente registrada.",
        description: error.detail,
      };
    }
    if (error.status === 422) {
      return {
        title: "Los datos ingresados no son válidos.",
        description: error.detail,
      };
    }
  }
  return describeKernelError(error);
}
