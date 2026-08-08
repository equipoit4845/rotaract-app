import { Breadcrumbs } from "@equipoit4845/admin-shell";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof Breadcrumbs> = {
  title: "admin-shell/Breadcrumbs",
  component: Breadcrumbs,
};
export default meta;

type Story = StoryObj<typeof Breadcrumbs>;

export const Default: Story = {
  args: {
    items: [
      { label: "Inicio", href: "#" },
      { label: "Personas", href: "#" },
      { label: "Ada Lovelace" },
    ],
  },
};
