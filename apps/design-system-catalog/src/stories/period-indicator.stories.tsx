import { PeriodIndicator } from "@mirotaract/admin-shell";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof PeriodIndicator> = {
  title: "admin-shell/PeriodIndicator",
  component: PeriodIndicator,
};
export default meta;

type Story = StoryObj<typeof PeriodIndicator>;

export const Statuses: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <PeriodIndicator
        label="2025-2026"
        status="active"
        detail="hasta jun. 2026"
      />
      <PeriodIndicator
        label="2026-2027"
        status="pending"
        detail="inicia jul. 2026"
      />
      <PeriodIndicator label="2024-2025" status="inactive" detail="cerrado" />
    </div>
  ),
};
