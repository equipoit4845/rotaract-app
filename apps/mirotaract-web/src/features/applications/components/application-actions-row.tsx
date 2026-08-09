"use client";

import type { MembershipApplication } from "@/lib/api";

import { ApproveApplicationDialog } from "../forms/approve-application-dialog";
import { CancelApplicationDialog } from "../forms/cancel-application-dialog";
import { RejectApplicationDialog } from "../forms/reject-application-dialog";
import { SubmitApplicationDialog } from "../forms/submit-application-dialog";

/**
 * Each dialog gates itself on `useCan()` + the real state machine
 * (`application-lifecycle.ts`) and renders nothing when not applicable —
 * this row never hardcodes which actions exist for a given status, it
 * just lays out whatever the four dialogs decide to render. There is no
 * "Expirar" dialog: `EXPIRED` has no manual transition in
 * kernel-openapi.yaml (see `application-lifecycle.ts`).
 */
export function ApplicationActionsRow({
  application,
  personLabel,
}: {
  application: MembershipApplication;
  personLabel: string;
}) {
  return (
    <div
      style={{ display: "flex", gap: "var(--mr-space-2)", flexWrap: "wrap" }}
    >
      <SubmitApplicationDialog application={application} />
      <ApproveApplicationDialog
        application={application}
        personLabel={personLabel}
      />
      <RejectApplicationDialog
        application={application}
        personLabel={personLabel}
      />
      <CancelApplicationDialog application={application} />
    </div>
  );
}
