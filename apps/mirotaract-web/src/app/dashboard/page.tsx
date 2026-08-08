"use client";

import { PageHeader } from "@mirotaract/admin-shell";
import { Card, CardContent } from "@mirotaract/ui";

import { DashboardShell } from "@/features/shell/dashboard-shell";

/**
 * First real Web Shell integration, not a business feature: proves session
 * restore, organization switching, period display, filtered navigation and
 * theme all work together through `AdminFrame`. Content below the header is
 * deliberately generic placeholder — members/appointments/periods
 * management are separate, later cuts.
 */
export default function DashboardPage() {
  return (
    <DashboardShell activePath="/dashboard">
      <PageHeader
        title="Panel"
        description="Vista general de tu organización."
      />
      <Card>
        <CardContent>
          Contenido institucional de referencia — placeholder mientras se
          incorporan las primeras funcionalidades reales sobre este shell.
        </CardContent>
      </Card>
    </DashboardShell>
  );
}
