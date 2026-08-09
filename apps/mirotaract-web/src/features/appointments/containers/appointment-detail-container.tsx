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
import { DataState, PageHeader } from "@equipoit4845/admin-shell";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@equipoit4845/ui";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import {
  appointmentStatusToLabel,
  appointmentStatusToTone,
} from "../adapters/appointment-status-to-tone";
import { personDisplayName } from "../adapters/person-display-name";
import { AppointmentActionsRow } from "../components/appointment-actions-row";
import { formatDateTime } from "../utils/format-date";

function Field({
  label,
  value,
}: {
  label: string;
  value: string | undefined | null;
}) {
  return (
    <div>
      <dt
        style={{
          fontSize: "0.75rem",
          color: "var(--mr-color-text-muted)",
          margin: 0,
        }}
      >
        {label}
      </dt>
      <dd style={{ margin: 0 }}>{value?.trim() ? value : "—"}</dd>
    </div>
  );
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
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--mr-space-3)",
        }}
      >
        <Skeleton style={{ height: "2rem" }} />
        <Skeleton style={{ height: "12rem" }} />
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
      <PageHeader
        title={positionName}
        description={organization.data?.name ?? appointment.organizationId}
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
          <dl
            style={{
              display: "grid",
              gap: "var(--mr-space-4)",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              margin: 0,
            }}
          >
            <div>
              <dt
                style={{
                  fontSize: "0.75rem",
                  color: "var(--mr-color-text-muted)",
                  margin: 0,
                }}
              >
                Estado
              </dt>
              <dd style={{ margin: 0 }}>
                <Badge tone={appointmentStatusToTone(appointment.status)}>
                  {appointmentStatusToLabel(appointment.status)}
                </Badge>
              </dd>
            </div>
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
          </dl>
        </CardContent>
      </Card>
    </>
  );
}
