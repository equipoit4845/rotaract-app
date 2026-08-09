"use client";

import { DashboardContainer } from "@/features/dashboard/containers/dashboard-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";

/**
 * Fase 1 del producto administrativo (docs/09-administrative-web.md,
 * US-DASH-01/02): panel real por scope (DISTRICT/CLUB), datos reales del
 * Kernel vía hooks públicos, cero fetch directo. No es un placeholder.
 */
export default function DashboardPage() {
  return (
    <DashboardShell activePath="/dashboard">
      <DashboardContainer />
    </DashboardShell>
  );
}
