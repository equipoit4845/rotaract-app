"use client";

import {
  KernelApiError,
  useOrganization,
  useOrganizationAncestors,
} from "@/lib/api";
import { DataState, PageHeader } from "@equipoit4845/admin-shell";
import {
  Button,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@equipoit4845/ui";
import Link from "next/link";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { OrganizationActionsRow } from "../components/organization-actions-row";
import { OrganizationFutureTab } from "../components/organization-future-tab";
import { OrganizationHierarchyTab } from "../components/organization-hierarchy-tab";
import { OrganizationSummaryCard } from "../components/organization-summary-card";

/**
 * `organizationId` is the route's resource, never
 * `activeOrganizationId` — this container never touches
 * `useActiveOrganization`/`useActiveOrganizationContext`, so opening a
 * detail page can't change the Shell's active organization (product
 * spec §4).
 */
export function OrganizationDetailContainer({
  organizationId,
}: {
  organizationId: string;
}) {
  const organizationQuery = useOrganization(organizationId);
  const ancestorsQuery = useOrganizationAncestors(organizationId);

  if (organizationQuery.isLoading) {
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

  if (organizationQuery.isError) {
    const error = organizationQuery.error;
    if (error instanceof KernelApiError && error.isNotFound) {
      return (
        <DataState
          kind="empty"
          title="Organización no encontrada"
          description="No encontramos la organización que buscás. Puede haber sido movida o el enlace estar desactualizado."
        />
      );
    }
    return <DataState kind="error" {...describeKernelError(error)} />;
  }

  const organization = organizationQuery.data;
  if (!organization) return null;

  const ancestors = ancestorsQuery.data ?? [];
  const breadcrumb = [
    { label: "Organizaciones", href: "/organizations" },
    ...ancestors.map((ancestor) => ({
      label: ancestor.name,
      href: `/organizations/${ancestor.id}`,
    })),
    { label: organization.name },
  ];

  return (
    <>
      <PageHeader
        title={organization.name}
        description={organization.code}
        breadcrumb={breadcrumb}
        actions={<OrganizationActionsRow organization={organization} />}
      />
      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="hierarchy">Jerarquía</TabsTrigger>
          <TabsTrigger value="members">Socios</TabsTrigger>
          <TabsTrigger value="authorities">Autoridades</TabsTrigger>
          <TabsTrigger value="periods">Períodos</TabsTrigger>
        </TabsList>
        <TabsContent value="summary">
          <OrganizationSummaryCard organization={organization} />
        </TabsContent>
        <TabsContent value="hierarchy">
          <OrganizationHierarchyTab
            organization={organization}
            ancestors={ancestors}
          />
        </TabsContent>
        <TabsContent value="members">
          {/* Fase 4 (Membresías) owns `/memberships/**` — this only links
              into that scoped list, it never embeds Membresías UI here
              (product spec §13/§32). */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--mr-space-3)",
              alignItems: "flex-start",
            }}
          >
            <p>Los socios de esta organización se gestionan en Membresías.</p>
            <Link href={`/memberships?organization=${organization.id}`}>
              <Button variant="secondary">Ver membresías</Button>
            </Link>
          </div>
        </TabsContent>
        <TabsContent value="authorities">
          <OrganizationFutureTab description="La gestión de autoridades y cargos estará disponible en la Fase 5 (Autoridades / Cargos)." />
        </TabsContent>
        <TabsContent value="periods">
          <OrganizationFutureTab description="La gestión de períodos institucionales estará disponible en la Fase 6 (Períodos)." />
        </TabsContent>
      </Tabs>
    </>
  );
}
