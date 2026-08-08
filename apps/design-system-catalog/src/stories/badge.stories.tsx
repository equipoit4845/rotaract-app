import { Badge, type BadgeTone } from "@equipoit4845/ui";
import type { Meta, StoryObj } from "@storybook/react";

const tones: BadgeTone[] = ["neutral", "info", "success", "warning", "danger"];

const meta: Meta<typeof Badge> = {
  title: "ui/Badge",
  component: Badge,
};
export default meta;

type Story = StoryObj<typeof Badge>;

export const AllTones: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "0.5rem" }}>
      {tones.map((tone) => (
        <Badge key={tone} tone={tone}>
          {tone}
        </Badge>
      ))}
    </div>
  ),
};
