"use client";

import {
  KernelApiError,
  useAppointment,
  useMembership,
  useOrganization,
  usePeriod,
  usePerson,
  usePositionDefinitions,
} from "@/lib/api";
import {
  DataState,
  DetailGrid,
  DetailItem,
  EntityHero,
} from "@/components/layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/components/ui";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { personDisplayName } from "../adapters/person-display-name";
import { AppointmentActionsRow } from "../components/appointment-actions-row";
import { formatDateTime } from "../utils/format-date";
import { StatusBadge } from "@/components/domain/status-badge";

function Field({
  label,
  value,
}: {
  label: string;
  value: string | undefined | null;
}) {
  return <DetailItem label={label}>{value}</DetailItem>;
}

/**
 * US-APP-03. A single detail page = a single appointment, so resolving its
 * position/organization/membership/person/period here is a fixed, bounded
 * set of extra requests — not the per-row pattern list views have to guard
 * against (§18), same convention as `OrganizationSummaryCard`.
 */
export function AppointmentDetailContainer({
  appointmentId,
}: {
  appointmentId: string;
}) {
  const appointmentQuery = useAppointment(appointmentId);
  const appointment = appointmentQuery.data;

  const positions = usePositionDefinitions();
  const organization = useOrganization(appointment?.organizationId);
  const membership = useMembership(appointment?.membershipId);
  const person = usePerson(membership.data?.personId);
  const period = usePeriod(appointment?.periodId);

  if (appointmentQuery.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (appointmentQuery.isError) {
    const error = appointmentQuery.error;
    if (error instanceof KernelApiError && error.isNotFound) {
      return (
        <DataState
          kind="empty"
          title="Cargo no encontrado"
          description="No encontramos el cargo que buscás."
        />
      );
    }
    return <DataState kind="error" {...describeKernelError(error)} />;
  }

  if (!appointment) return null;

  const positionName =
    positions.data?.find((p) => p.id === appointment.positionDefinitionId)
      ?.name ?? "Cargo";

  return (
    <>
      <EntityHero
        badges={<StatusBadge kind="appointment" status={appointment.status} />}
        title={positionName}
        subtitle={organization.data?.name ?? appointment.organizationId}
        breadcrumb={[
          { label: "Cargos", href: "/appointments" },
          { label: positionName },
        ]}
        actions={<AppointmentActionsRow appointment={appointment} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Resumen</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailGrid>
            <Field
              label="Persona"
              value={person.data ? personDisplayName(person.data) : "…"}
            />
            <Field label="Organización" value={organization.data?.name} />
            <Field label="Período" value={period.data?.name} />
            <Field
              label="Inicio"
              value={
                appointment.startsAt
                  ? formatDateTime(appointment.startsAt)
                  : undefined
              }
            />
            <Field
              label="Fin"
              value={
                appointment.endsAt
                  ? formatDateTime(appointment.endsAt)
                  : undefined
              }
            />
            <Field
              label="Activado"
              value={
                appointment.activatedAt
                  ? formatDateTime(appointment.activatedAt)
                  : undefined
              }
            />
            <Field
              label="Finalizado"
              value={
                appointment.endedAt
                  ? formatDateTime(appointment.endedAt)
                  : undefined
              }
            />
            <Field
              label="Revocado"
              value={
                appointment.revokedAt
                  ? formatDateTime(appointment.revokedAt)
                  : undefined
              }
            />
            {appointment.revokeReason ? (
              <Field
                label="Motivo de revocación"
                value={appointment.revokeReason}
              />
            ) : null}
            <Field
              label="Creado"
              value={formatDateTime(appointment.createdAt)}
            />
          </DetailGrid>
        </CardContent>
      </Card>
    </>
  );
}
