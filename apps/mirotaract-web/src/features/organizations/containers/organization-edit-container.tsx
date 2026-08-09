"use client";

import { useCan, useOrganization } from "@/lib/api";
import { DataState, PageHeader } from "@equipoit4845/admin-shell";
import { Skeleton } from "@equipoit4845/ui";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { canEditOrganization } from "../adapters/organization-lifecycle";
import { EditOrganizationForm } from "../forms/edit-organization-form";

export function OrganizationEditContainer({
  organizationId,
}: {
  organizationId: string;
}) {
  const organizationQuery = useOrganization(organizationId);
  const canUpdate = useCan("kernel.organization.update", {
    scopeType: "ORGANIZATION",
    scopeId: organizationId,
  });

  if (organizationQuery.isLoading) {
    return <Skeleton style={{ height: "20rem" }} />;
  }

  if (organizationQuery.isError) {
    return (
      <DataState
        kind="error"
        {...describeKernelError(organizationQuery.error)}
      />
    );
  }

  const organization = organizationQuery.data;
  if (!organization) return null;

  if (!canUpdate) {
    return (
      <DataState
        kind="error"
        title="No tenés permisos para editar esta organización."
      />
    );
  }

  if (!canEditOrganization(organization.status)) {
    return (
      <DataState
        kind="empty"
        title="Esta organización está archivada"
        description="Una organización archivada ya no admite ediciones."
      />
    );
  }

  return (
    <>
      <PageHeader
        title={`Editar ${organization.name}`}
        breadcrumb={[
          { label: "Organizaciones", href: "/organizations" },
          {
            label: organization.name,
            href: `/organizations/${organization.id}`,
          },
          { label: "Editar" },
        ]}
      />
      <EditOrganizationForm organization={organization} />
    </>
  );
}
