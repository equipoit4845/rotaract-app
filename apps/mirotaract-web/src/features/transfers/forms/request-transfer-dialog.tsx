"use client";

import { useRequestMembershipTransfer } from "@/lib/api";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FormField,
  Select,
  Textarea,
} from "@equipoit4845/ui";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useOwnActiveMemberships } from "../view-models/use-own-active-memberships";
import { useTransferOrganizationCandidates } from "../view-models/use-organization-candidates";
import { describeRequestTransferError } from "./transfer-mutation-errors";

/**
 * `RequestMembershipTransferRequest`: `membershipId` (required) +
 * `toOrganizationId` (required) + `reason` (optional) — nothing else
 * (kernel-openapi.yaml). Both pickers only *guide* the UX toward valid
 * input (invariant 6.9.1 — only an `ACTIVE` membership; invariant 6.9.2 —
 * origin ≠ destination): the membership picker only lists the actor's own
 * `ACTIVE` memberships (`useOwnActiveMemberships`), and the destination
 * picker excludes whichever organization the selected membership already
 * belongs to. The Kernel is still the real authority — a 409 (invariant
 * 6.9.3, one open transfer per membership) is always possible even with a
 * "valid-looking" selection, and is surfaced via
 * `describeRequestTransferError`, never silently retried or swapped for a
 * different transition.
 */
export function RequestTransferDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [membershipId, setMembershipId] = useState("");
  const [toOrganizationId, setToOrganizationId] = useState("");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const requestTransfer = useRequestMembershipTransfer();

  const { candidates: ownMemberships, isLoading: ownMembershipsLoading } =
    useOwnActiveMemberships();
  const { candidates: organizations, isLoading: organizationsLoading } =
    useTransferOrganizationCandidates();

  const organizationNameById = new Map(
    organizations.map((organization) => [organization.id, organization.name]),
  );

  const selectedMembership = ownMemberships.find(
    (candidate) => candidate.membershipId === membershipId,
  );
  const originOrganizationId = selectedMembership?.organizationId;

  // Empty (not "every organization") until a membership is picked — the
  // Kernel needs a known origin to validate origin ≠ destination
  // (invariant 6.9.2), and showing every organization as a valid
  // destination before that would be misleading UX, not just a stray
  // extra option.
  const destinationOptions = originOrganizationId
    ? organizations.filter(
        (organization) => organization.id !== originOrganizationId,
      )
    : [];

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setMembershipId("");
      setToOrganizationId("");
      setReason("");
      setTouched(false);
      requestTransfer.reset();
    }
  }

  function handleMembershipChange(value: string) {
    setMembershipId(value);
    // The previously picked destination might equal the newly selected
    // membership's own organization — clear it rather than silently submit
    // an origin === destination pair (invariant 6.9.2).
    const membership = ownMemberships.find((c) => c.membershipId === value);
    if (membership && membership.organizationId === toOrganizationId) {
      setToOrganizationId("");
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!membershipId || !toOrganizationId) return;
    requestTransfer.mutate(
      {
        membershipId,
        toOrganizationId,
        reason: reason.trim() || undefined,
      },
      {
        onSuccess: (transfer) => {
          handleOpenChange(false);
          router.push(`/transfers/${transfer.id}`);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>Solicitar transferencia</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar transferencia de membresía</DialogTitle>
          <DialogDescription>
            Transferí una de tus membresías activas a otra organización. El
            destino debe aceptar y el origen confirmar antes de completarse.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--mr-space-3)",
          }}
        >
          <FormField
            label="Tu membresía"
            htmlFor="transferMembershipId"
            required
            error={
              touched && !membershipId ? "Elegí una membresía." : undefined
            }
            hint={
              ownMembershipsLoading
                ? "Cargando…"
                : ownMemberships.length === 0
                  ? "No tenés membresías activas para transferir."
                  : undefined
            }
          >
            <Select
              id="transferMembershipId"
              value={membershipId}
              onChange={(event) => handleMembershipChange(event.target.value)}
            >
              <option value="">Elegí una membresía</option>
              {ownMemberships.map((candidate) => (
                <option
                  key={candidate.membershipId}
                  value={candidate.membershipId}
                >
                  {organizationNameById.get(candidate.organizationId) ??
                    candidate.organizationId}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField
            label="Organización destino"
            htmlFor="transferToOrganizationId"
            required
            error={
              touched && !toOrganizationId
                ? "Elegí una organización destino."
                : undefined
            }
            hint={
              !membershipId
                ? "Elegí primero tu membresía."
                : organizationsLoading
                  ? "Cargando…"
                  : undefined
            }
          >
            <Select
              id="transferToOrganizationId"
              value={toOrganizationId}
              onChange={(event) => setToOrganizationId(event.target.value)}
              disabled={!membershipId}
            >
              <option value="">Elegí una organización</option>
              {destinationOptions.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Motivo" htmlFor="transferReason" hint="Opcional.">
            <Textarea
              id="transferReason"
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </FormField>

          {requestTransfer.isError ? (
            <Alert
              tone="danger"
              title={describeRequestTransferError(requestTransfer.error).title}
              description={
                describeRequestTransferError(requestTransfer.error).description
              }
            />
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={requestTransfer.isPending}>
              {requestTransfer.isPending ? "Solicitando…" : "Solicitar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
