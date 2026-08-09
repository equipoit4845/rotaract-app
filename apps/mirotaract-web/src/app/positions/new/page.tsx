"use client";

import { CreatePositionContainer } from "@/features/positions/containers/create-position-container";
import { DashboardShell } from "@/features/shell/dashboard-shell";

export default function CreatePositionPage() {
  return (
    <DashboardShell activePath="/positions">
      <CreatePositionContainer />
    </DashboardShell>
  );
}
