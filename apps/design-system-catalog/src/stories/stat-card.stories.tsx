import { StatCard } from "@equipoit4845/admin-shell";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof StatCard> = {
  title: "admin-shell/StatCard",
  component: StatCard,
};
export default meta;

type Story = StoryObj<typeof StatCard>;

export const Tones: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gap: "0.75rem",
        gridTemplateColumns: "repeat(2, minmax(180px, 1fr))",
      }}
    >
      <StatCard label="Miembros activos" value="128" tone="success" />
      <StatCard label="Solicitudes pendientes" value="4" tone="warning" />
      <StatCard label="Errores de sincronización" value="1" tone="danger" />
      <StatCard label="Total histórico" value="512" tone="neutral" />
    </div>
  ),
};
