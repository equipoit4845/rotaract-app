import { Spinner } from "@equipoit4845/ui";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof Spinner> = { title: "ui/Spinner", component: Spinner };
export default meta;

type Story = StoryObj<typeof Spinner>;

export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <Spinner size={16} />
      <Spinner size={24} />
      <Spinner size={32} />
    </div>
  ),
};
