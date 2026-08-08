import { Progress } from "@equipoit4845/ui";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof Progress> = {
  title: "ui/Progress",
  component: Progress,
};
export default meta;

type Story = StoryObj<typeof Progress>;

export const Values: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        width: 240,
      }}
    >
      <Progress value={20} />
      <Progress value={60} />
      <Progress value={100} />
    </div>
  ),
};
