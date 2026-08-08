import { Switch } from "@equipoit4845/ui";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof Switch> = { title: "ui/Switch", component: Switch };
export default meta;

type Story = StoryObj<typeof Switch>;

export const States: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
      <Switch aria-label="Apagado" />
      <Switch aria-label="Encendido" defaultChecked />
      <Switch aria-label="Deshabilitado" disabled />
    </div>
  ),
};
