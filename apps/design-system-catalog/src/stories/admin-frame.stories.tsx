import {
  AdminFrame,
  Avatar,
  PeriodIndicator,
  StatCard,
} from "@equipoit4845/admin-shell";
import { Button } from "@equipoit4845/ui";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof AdminFrame> = {
  title: "admin-shell/AdminFrame",
  component: AdminFrame,
};
export default meta;

type Story = StoryObj<typeof AdminFrame>;

export const Default: Story = {
  render: () => (
    <AdminFrame
      brand={<span>Mi Rotaract</span>}
      navItems={[
        { label: "Panel", href: "#", active: true },
        { label: "Personas", href: "#" },
        { label: "Membresías", href: "#" },
        { label: "Períodos", href: "#" },
      ]}
      periodIndicator={<PeriodIndicator label="2025-2026" status="active" />}
      actions={<Button size="sm">Nueva persona</Button>}
      user={<Avatar name="Ada Lovelace" size="sm" />}
    >
      <div
        style={{
          display: "grid",
          gap: "0.75rem",
          gridTemplateColumns: "repeat(3, 1fr)",
        }}
      >
        <StatCard label="Miembros activos" value="128" tone="success" />
        <StatCard label="Solicitudes pendientes" value="4" tone="warning" />
        <StatCard label="Total histórico" value="512" tone="neutral" />
      </div>
    </AdminFrame>
  ),
};
