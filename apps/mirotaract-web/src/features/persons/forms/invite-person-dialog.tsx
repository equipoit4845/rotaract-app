"use client";

import type { Person } from "@/lib/api";
import { useCan, useInvitePerson, usePersonMemberships } from "@/lib/api";
import { Alert, Button, FormField, Input, Select } from "@equipoit4845/ui";
import { useState } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { invitationStatusToLabel } from "../adapters/invitation-status-to-tone";
import { personDisplayName } from "../adapters/person-display-name";
import { ConfirmationDialog } from "../components/confirmation-dialog";
import { InviteMembershipOption } from "./invite-membership-option";

/**
 * `invitePersonToCreateAccount` requires `membershipId` — inviting only
 * makes sense once the person has at least one membership (product spec
 * §21: the UI can guide/disable, but the Kernel is the final authority on
 * whether the invitation is actually valid).
 */
export function InvitePersonDialog({ person }: { person: Person }) {
  const [open, setOpen] = useState(false);
  const [membershipId, setMembershipId] = useState("");
  const [email, setEmail] = useState(person.primaryEmail ?? "");
  const invite = useInvitePerson();
  const canManage = useCan("kernel.person.manage");
  const membershipsQuery = usePersonMemberships(person.id);

  if (!canManage) return null;

  const memberships = membershipsQuery.data ?? [];
  const hasMembership = memberships.length > 0;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      invite.reset();
      setMembershipId("");
      setEmail(person.primaryEmail ?? "");
    }
  }

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button variant="outline" disabled={!hasMembership}>
          Invitar a crear cuenta
        </Button>
      }
      title="Invitar a crear cuenta"
      description={
        hasMembership
          ? `Envía una invitación para que "${personDisplayName(person)}" cree su cuenta y quede vinculada a esta persona.`
          : "Esta persona necesita al menos una membresía antes de poder invitarla — el Kernel exige una membershipId (invitePersonToCreateAccount)."
      }
      confirmLabel="Enviar invitación"
      isPending={invite.isPending}
      errorMessage={
        invite.isError ? describeKernelError(invite.error) : undefined
      }
      onConfirm={() => {
        if (!membershipId || !email) return;
        invite.mutate({
          personId: person.id,
          payload: { membershipId, email },
        });
      }}
    >
      {hasMembership ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--mr-space-3)",
          }}
        >
          <FormField label="Membresía" htmlFor="membershipId" required>
            <Select
              id="membershipId"
              value={membershipId}
              onChange={(event) => setMembershipId(event.target.value)}
            >
              <option value="">Elegí una membresía</option>
              {memberships.map((membership) => (
                <InviteMembershipOption
                  key={membership.id}
                  membership={membership}
                />
              ))}
            </Select>
          </FormField>
          <FormField label="Email" htmlFor="inviteEmail" required>
            <Input
              id="inviteEmail"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </FormField>
          {invite.isSuccess ? (
            <Alert
              tone="success"
              title="Invitación enviada"
              description={`Estado: ${invitationStatusToLabel(invite.data.status)}`}
            />
          ) : null}
        </div>
      ) : null}
    </ConfirmationDialog>
  );
}
