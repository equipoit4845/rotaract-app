"use client";

import {
  useCreateAppointment,
  useOrganization,
  usePeriods,
  usePositionDefinitions,
} from "@/lib/api";
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
} from "@equipoit4845/ui";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AppointmentMembershipPicker } from "./appointment-membership-picker";
import { describeCreateAppointmentError } from "./appointment-mutation-errors";

/**
 * US-APP-04 — `createAppointment` (`POST
 * /organizations/{id}/appointments`) always starts an `Appointment` in
 * `NOMINATED` (kernel-spec.md §7.5) — this dialog never lets a caller pick
 * an initial status. `startsAt`/`endsAt` are left empty by default so the
 * Kernel materializes them from the period's own bounds (invariant
 * 6.6.12) rather than this UI guessing a timezone-correct value.
 */
export function CreateAppointmentDialog({
  organizationId,
}: {
  organizationId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [positionDefinitionId, setPositionDefinitionId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [membershipId, setMembershipId] = useState("");
  const [touched, setTouched] = useState(false);

  const organization = useOrganization(organizationId);
  const positions = usePositionDefinitions(organization.data?.type);
  const periods = usePeriods(organizationId);
  const createAppointment = useCreateAppointment();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setPositionDefinitionId("");
      setPeriodId("");
      setMembershipId("");
      setTouched(false);
      createAppointment.reset();
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!positionDefinitionId || !periodId || !membershipId) return;
    createAppointment.mutate(
      {
        organizationId,
        payload: { membershipId, periodId, positionDefinitionId },
      },
      {
        onSuccess: (appointment) => {
          handleOpenChange(false);
          router.push(`/appointments/${appointment.id}`);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>Nominar cargo</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nominar cargo</DialogTitle>
          <DialogDescription>
            Crea un cargo en estado NOMINATED para una membresía activa.
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
            label="Cargo"
            htmlFor="positionDefinitionId"
            required
            error={
              touched && !positionDefinitionId ? "Elegí un cargo." : undefined
            }
          >
            <Select
              id="positionDefinitionId"
              value={positionDefinitionId}
              onChange={(event) => setPositionDefinitionId(event.target.value)}
            >
              <option value="">Elegí un cargo</option>
              {(positions.data ?? []).map((position) => (
                <option key={position.id} value={position.id}>
                  {position.name}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField
            label="Período"
            htmlFor="periodId"
            required
            error={touched && !periodId ? "Elegí un período." : undefined}
          >
            <Select
              id="periodId"
              value={periodId}
              onChange={(event) => setPeriodId(event.target.value)}
            >
              <option value="">Elegí un período</option>
              {(periods.data ?? []).map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </Select>
          </FormField>

          <AppointmentMembershipPicker
            organizationId={organizationId}
            positionOrganizationType={organization.data?.type}
            value={membershipId}
            onChange={setMembershipId}
            error={
              touched && !membershipId ? "Elegí una membresía." : undefined
            }
          />

          {createAppointment.isError ? (
            <Alert
              tone="danger"
              title={
                describeCreateAppointmentError(createAppointment.error).title
              }
              description={
                describeCreateAppointmentError(createAppointment.error)
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
            <Button type="submit" disabled={createAppointment.isPending}>
              {createAppointment.isPending ? "Creando…" : "Nominar cargo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
