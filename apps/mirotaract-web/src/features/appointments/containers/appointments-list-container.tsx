"use client";

import {
  useAppointments,
  useCan,
  usePeriods,
  usePositionDefinitions,
} from "@/lib/api";
import { DataState, DataToolbar, PageHeader } from "@equipoit4845/admin-shell";
import { Select, Skeleton } from "@equipoit4845/ui";

import { useActiveOrganizationContext } from "@/features/shell/active-organization-context";
import { describeKernelError } from "@/features/shell/kernel-error-message";

import { AppointmentsTable } from "../components/appointments-table";
import { OrganizationScopeFilter } from "../components/organization-scope-filter";
import { CreateAppointmentDialog } from "../forms/create-appointment-dialog";
import { useAppointmentListFilters } from "../view-models/use-appointment-list-filters";
import { useOrganizationCandidates } from "../view-models/use-organization-candidates";

/**
 * US-APP-02 — `Ruta /appointments?organization=&period=&position=&status=`.
 * `useAppointments` hits `listAppointments`
 * (`GET /organizations/{id}/appointments`), a plain array (no cursor in the
 * contract's `Appointment[]` response) — no pagination view-model needed,
 * unlike Organizations/Memberships.
 */
export function AppointmentsListContainer() {
  const {
    organizationId: urlOrganizationId,
    periodId,
    positionCode,
    status,
    setOrganizationId,
    setPeriodId,
    setPositionCode,
    setStatus,
  } = useAppointmentListFilters();
  const activeOrganization = useActiveOrganizationContext();
  const organizationId = urlOrganizationId ?? activeOrganization.organizationId;

  const appointments = useAppointments(organizationId, {
    periodId,
    positionCode,
    status,
  });
  const positions = usePositionDefinitions();
  const periods = usePeriods(organizationId);
  const { candidates: organizationCandidates } = useOrganizationCandidates();
  const canCreate = useCan("kernel.appointment.create", {
    scopeType: "ORGANIZATION",
    scopeId: organizationId,
  });

  const positionsById = new Map(
    (positions.data ?? []).map((position) => [position.id, position]),
  );

  if (!organizationId) {
    return (
      <DataState
        kind="empty"
        title="Elegí una organización"
        description="Seleccioná una organización para ver sus cargos."
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Cargos"
        description="Nominaciones y designaciones de la organización seleccionada."
        actions={
          canCreate ? (
            <CreateAppointmentDialog organizationId={organizationId} />
          ) : undefined
        }
      />

      <DataToolbar
        filters={
          <div
            style={{
              display: "flex",
              gap: "var(--mr-space-2)",
              flexWrap: "wrap",
            }}
          >
            <OrganizationScopeFilter
              value={organizationId}
              organizations={organizationCandidates}
              onChange={setOrganizationId}
            />
            <Select
              aria-label="Filtrar por período"
              value={periodId ?? ""}
              onChange={(event) => setPeriodId(event.target.value || undefined)}
            >
              <option value="">Todos los períodos</option>
              {(periods.data ?? []).map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filtrar por cargo"
              value={positionCode ?? ""}
              onChange={(event) =>
                setPositionCode(event.target.value || undefined)
              }
            >
              <option value="">Todos los cargos</option>
              {(positions.data ?? []).map((position) => (
                <option key={position.id} value={position.code}>
                  {position.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filtrar por estado"
              value={status ?? ""}
              onChange={(event) =>
                setStatus(
                  (event.target.value || undefined) as
                    | "NOMINATED"
                    | "ELECTED"
                    | "ACTIVE"
                    | "ENDED"
                    | "REVOKED"
                    | undefined,
                )
              }
            >
              <option value="">Todos los estados</option>
              <option value="NOMINATED">Nominado</option>
              <option value="ELECTED">Electo</option>
              <option value="ACTIVE">Activo</option>
              <option value="ENDED">Finalizado</option>
              <option value="REVOKED">Revocado</option>
            </Select>
          </div>
        }
      />

      {appointments.isLoading || positions.isLoading ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--mr-space-2)",
            marginTop: "var(--mr-space-4)",
          }}
        >
          <Skeleton style={{ height: "2.5rem" }} />
          <Skeleton style={{ height: "2.5rem" }} />
          <Skeleton style={{ height: "2.5rem" }} />
        </div>
      ) : appointments.isError ? (
        <DataState kind="error" {...describeKernelError(appointments.error)} />
      ) : !appointments.data || appointments.data.length === 0 ? (
        <DataState
          kind="empty"
          title="Sin cargos"
          description="No encontramos cargos con estos filtros."
        />
      ) : (
        <AppointmentsTable
          items={appointments.data}
          positionsById={positionsById}
        />
      )}
    </>
  );
}
