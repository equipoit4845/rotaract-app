import type { TransferStatus } from "@/lib/api";

/**
 * Mirrors the real state machine (kernel-spec.md §7.7) exactly:
 *
 *   REQUESTED               -> ACCEPTED_BY_DESTINATION
 *   REQUESTED               -> REJECTED
 *   REQUESTED               -> CANCELLED
 *   REQUESTED               -> EXPIRED
 *
 *   ACCEPTED_BY_DESTINATION -> CONFIRMED_BY_ORIGIN
 *   ACCEPTED_BY_DESTINATION -> REJECTED
 *   ACCEPTED_BY_DESTINATION -> CANCELLED
 *   ACCEPTED_BY_DESTINATION -> EXPIRED
 *
 *   CONFIRMED_BY_ORIGIN     -> COMPLETED
 *   CONFIRMED_BY_ORIGIN     -> REJECTED
 *   CONFIRMED_BY_ORIGIN     -> CANCELLED
 *   CONFIRMED_BY_ORIGIN     -> EXPIRED
 *
 * `EXPIRED` is a real `TransferStatus` value, but `kernel-openapi.yaml`
 * documents no manual transition operation into it (no `POST
 * .../expire`). This adapter never offers an "Expirar" action — `EXPIRED`
 * is only ever a status the UI *displays* after the Kernel puts a transfer
 * there on its own (see docs/09, Área 7).
 *
 * `COMPLETED`/`REJECTED`/`CANCELLED`/`EXPIRED` are terminal — no outgoing
 * transition is documented for any of them.
 *
 * This only decides which action the UI *offers*; the Kernel re-validates
 * every transition server-side regardless (409 `KERNEL_INVALID_TRANSITION`
 * otherwise — product spec §16/§19).
 */
export function canAcceptTransfer(status: TransferStatus): boolean {
  return status === "REQUESTED";
}

export function canConfirmTransfer(status: TransferStatus): boolean {
  return status === "ACCEPTED_BY_DESTINATION";
}

export function canCompleteTransfer(status: TransferStatus): boolean {
  return status === "CONFIRMED_BY_ORIGIN";
}

export function canRejectTransfer(status: TransferStatus): boolean {
  return (
    status === "REQUESTED" ||
    status === "ACCEPTED_BY_DESTINATION" ||
    status === "CONFIRMED_BY_ORIGIN"
  );
}

export function canCancelTransfer(status: TransferStatus): boolean {
  return (
    status === "REQUESTED" ||
    status === "ACCEPTED_BY_DESTINATION" ||
    status === "CONFIRMED_BY_ORIGIN"
  );
}

export type TransferAction =
  "accept" | "confirm" | "complete" | "reject" | "cancel";

/** Presentation-only helper (product spec §16) — never used to decide server-side authority. */
export function getAvailableTransferActions(
  status: TransferStatus,
): TransferAction[] {
  const actions: TransferAction[] = [];
  if (canAcceptTransfer(status)) actions.push("accept");
  if (canConfirmTransfer(status)) actions.push("confirm");
  if (canCompleteTransfer(status)) actions.push("complete");
  if (canRejectTransfer(status)) actions.push("reject");
  if (canCancelTransfer(status)) actions.push("cancel");
  return actions;
}
