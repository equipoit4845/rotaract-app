"use client";

import { KernelApiError, useMembershipApplication, usePerson } from "@/lib/api";
import { DataState, PageHeader } from "@equipoit4845/admin-shell";
import { Skeleton } from "@equipoit4845/ui";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { ApplicationActionsRow } from "../components/application-actions-row";
import { ApplicationSummaryCard } from "../components/application-summary-card";

export function ApplicationDetailContainer({
  applicationId,
}: {
  applicationId: string;
}) {
  const applicationQuery = useMembershipApplication(applicationId);
  const application = applicationQuery.data;
  const personQuery = usePerson(application?.requesterPersonId);

  if (applicationQuery.isLoading) {
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

  if (applicationQuery.isError) {
    const error = applicationQuery.error;
    if (error instanceof KernelApiError && error.isNotFound) {
      return (
        <DataState
          kind="empty"
          title="Solicitud no encontrada"
          description="No encontramos la solicitud que buscás. Puede haber sido eliminada o el enlace estar desactualizado."
        />
      );
    }
    return <DataState kind="error" {...describeKernelError(error)} />;
  }

  if (!application) return null;

  const personLabel = personQuery.data
    ? personQuery.data.displayName?.trim() ||
      `${personQuery.data.firstName} ${personQuery.data.lastName}`
    : "esta persona";

  return (
    <>
      <PageHeader
        title={`Solicitud de ${personLabel}`}
        description="Solicitud de membresía"
        breadcrumb={[
          { label: "Solicitudes", href: "/applications" },
          { label: personLabel },
        ]}
        actions={
          <ApplicationActionsRow
            application={application}
            personLabel={personLabel}
          />
        }
      />
      <ApplicationSummaryCard application={application} />
    </>
  );
}
