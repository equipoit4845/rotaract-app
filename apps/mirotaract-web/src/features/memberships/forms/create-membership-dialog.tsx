"use client";

import { useCreateMembership } from "@/lib/api";
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
  Input,
} from "@equipoit4845/ui";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { PersonPickerField } from "./person-picker-field";
import { describeCreateMembershipError } from "./membership-mutation-errors";

/**
 * Exportable so it can be triggered both from `/memberships` (US-MEM-03)
 * and from the "Socios" tab of `/organizations/[id]` without either page
 * owning the other's code (product spec §13/§32) — `organizationId` is
 * always given by the caller, this dialog never lets the user pick it,
 * since `createMembership`'s organization comes from the URL path, not the
 * request body (`CreateMembershipRequest` only has `personId`,
 * `memberNumber`, `metadata` — kernel-openapi.yaml). `metadata` has no UI
 * yet, same call as Organizations' `attributes` (US-ORG-05).
 */
export function CreateMembershipDialog({
  organizationId,
}: {
  organizationId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [personId, setPersonId] = useState("");
  const [memberNumber, setMemberNumber] = useState("");
  const [touched, setTouched] = useState(false);
  const createMembership = useCreateMembership();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setPersonId("");
      setMemberNumber("");
      setTouched(false);
      createMembership.reset();
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!personId) return;
    createMembership.mutate(
      {
        organizationId,
        payload: { personId, memberNumber: memberNumber.trim() || null },
      },
      {
        onSuccess: (membership) => {
          handleOpenChange(false);
          router.push(`/memberships/${membership.id}`);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>Agregar socio</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear membresía</DialogTitle>
          <DialogDescription>
            Da de alta a una persona como socio de esta organización.
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
          <PersonPickerField
            value={personId}
            onChange={setPersonId}
            error={touched && !personId ? "Elegí una persona." : undefined}
          />
          <FormField label="Número de socio" htmlFor="memberNumber">
            <Input
              id="memberNumber"
              value={memberNumber}
              onChange={(event) => setMemberNumber(event.target.value)}
            />
          </FormField>

          {createMembership.isError ? (
            <Alert
              tone="danger"
              title={
                describeCreateMembershipError(createMembership.error).title
              }
              description={
                describeCreateMembershipError(createMembership.error)
                  .description
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
            <Button type="submit" disabled={createMembership.isPending}>
              {createMembership.isPending ? "Creando…" : "Crear membresía"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
