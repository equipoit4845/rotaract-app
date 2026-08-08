import { Separator } from "@equipoit4845/ui";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof Separator> = {
  title: "ui/Separator",
  component: Separator,
};
export default meta;

type Story = StoryObj<typeof Separator>;

export const Horizontal: Story = {
  render: () => (
    <div style={{ width: 240 }}>
      <p>Arriba</p>
      <Separator />
      <p>Abajo</p>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        height: 48,
        alignItems: "center",
        gap: "0.75rem",
      }}
    >
      <span>Izquierda</span>
      <Separator orientation="vertical" />
      <span>Derecha</span>
    </div>
  ),
};
