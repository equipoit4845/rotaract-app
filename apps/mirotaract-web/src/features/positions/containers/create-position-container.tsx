"use client";

import { useCan } from "@/lib/api";
import { DataState, PageHeader } from "@equipoit4845/admin-shell";

import { useActiveOrganizationContext } from "@/features/shell/active-organization-context";

import { CreatePositionForm } from "../forms/create-position-form";

export function CreatePositionContainer() {
  const activeOrganization = useActiveOrganizationContext();
  const canCreate = useCan("kernel.position.create", {
    scopeType: "ORGANIZATION_TREE",
    scopeId: activeOrganization.organizationId,
  });

  if (!canCreate) {
    return (
      <DataState
        kind="error"
        title="No tenés permisos para crear cargos en este distrito."
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Crear cargo"
        description="Da de alta un cargo configurable para el catálogo distrital."
        breadcrumb={[
          { label: "Cargos", href: "/positions" },
          { label: "Crear cargo" },
        ]}
      />
      <CreatePositionForm />
    </>
  );
}
