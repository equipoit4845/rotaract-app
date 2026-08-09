"use client";

import type { MembershipTransfer } from "@/lib/api";

import { AcceptTransferDialog } from "../forms/accept-transfer-dialog";
import { CancelTransferDialog } from "../forms/cancel-transfer-dialog";
import { CompleteTransferDialog } from "../forms/complete-transfer-dialog";
import { ConfirmTransferDialog } from "../forms/confirm-transfer-dialog";
import { RejectTransferDialog } from "../forms/reject-transfer-dialog";

/**
 * Each dialog gates itself on `useCan()` + scope + the real state machine
 * (`transfer-lifecycle.ts`) and renders nothing when not applicable — this
 * row never hardcodes which actions exist for a given status or actor
 * (product spec §16/§30), it just lays out whatever the five dialogs
 * decide to render. No "Expirar" action exists anywhere in this row —
 * `EXPIRED` has no manual transition (kernel-openapi.yaml).
 */
export function TransferActionsRow({
  transfer,
}: {
  transfer: MembershipTransfer;
}) {
  return (
    <div
      style={{ display: "flex", gap: "var(--mr-space-2)", flexWrap: "wrap" }}
    >
      <AcceptTransferDialog transfer={transfer} />
      <ConfirmTransferDialog transfer={transfer} />
      <CompleteTransferDialog transfer={transfer} />
      <RejectTransferDialog transfer={transfer} />
      <CancelTransferDialog transfer={transfer} />
    </div>
  );
}
