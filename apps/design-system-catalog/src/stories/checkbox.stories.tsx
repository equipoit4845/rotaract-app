import { Checkbox } from "@mirotaract/ui";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof Checkbox> = {
  title: "ui/Checkbox",
  component: Checkbox,
};
export default meta;

type Story = StoryObj<typeof Checkbox>;

export const States: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
      <Checkbox aria-label="Sin marcar" />
      <Checkbox aria-label="Marcado" defaultChecked />
      <Checkbox aria-label="Deshabilitado" disabled />
    </div>
  ),
};
