"use client";

import { AppCatalogContainer } from "@/features/governance/containers/app-catalog-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";

export default function DeveloperCatalogPage() {
  return (
    <DashboardShell activePath="/developer/catalog">
      <AppCatalogContainer />
    </DashboardShell>
  );
}
