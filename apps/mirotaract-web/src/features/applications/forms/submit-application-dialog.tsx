"use client";

import type { MembershipApplication } from "@/lib/api";
import { useCan, useSubmitMembershipApplication } from "@/lib/api";
import { Button } from "@equipoit4845/ui";
import { useState } from "react";

import { canSubmitApplication } from "../adapters/application-lifecycle";
import { ConfirmationDialog } from "../components/confirmation-dialog";
import { describeApplicationTransitionError } from "./application-mutation-errors";

/**
 * `DRAFT -> SUBMITTED` (kernel-spec.md §7.6). `submitMembershipApplication`
 * carries the same `x-required-permission` as create
 * (`kernel.application.create.self`, kernel-openapi.yaml) — not a typo
 * carried over, the contract really does reuse it for both operations.
 */
export function SubmitApplicationDialog({
  application,
}: {
  application: MembershipApplication;
}) {
  const [open, setOpen] = useState(false);
  const submit = useSubmitMembershipApplication();
  const canSubmit = useCan("kernel.application.create.self", {
    scopeType: "ORGANIZATION",
    scopeId: application.organizationId,
  });

  if (!canSubmit || !canSubmitApplication(application.status)) return null;

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) submit.reset();
      }}
      trigger={<Button variant="outline">Enviar</Button>}
      title="Enviar solicitud"
      description="La solicitud pasará de BORRADOR a ENVIADA y quedará disponible para revisión."
      confirmLabel="Enviar"
      isPending={submit.isPending}
      errorMessage={
        submit.isError
          ? describeApplicationTransitionError(submit.error)
          : undefined
      }
      onConfirm={() =>
        submit.mutate(application.id, { onSuccess: () => setOpen(false) })
      }
    />
  );
}
