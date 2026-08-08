import { IconButton } from "@mirotaract/ui";
import type { Meta, StoryObj } from "@storybook/react";

const PencilIcon = () => (
  <svg
    width={16}
    height={16}
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M11.5 2 14 4.5 5.5 13 2 14l1-3.5L11.5 2Z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
);

const meta: Meta<typeof IconButton> = {
  title: "ui/IconButton",
  component: IconButton,
  args: { icon: <PencilIcon />, label: "Editar" },
};
export default meta;

type Story = StoryObj<typeof IconButton>;

export const Default: Story = {};
export const Variants: Story = {
  render: (args) => (
    <div style={{ display: "flex", gap: "0.5rem" }}>
      <IconButton {...args} variant="primary" />
      <IconButton {...args} variant="outline" />
      <IconButton {...args} variant="ghost" />
      <IconButton {...args} variant="danger" />
    </div>
  ),
};
