import { PageHeader } from "@equipoit4845/admin-shell";
import { Button } from "@equipoit4845/ui";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof PageHeader> = {
  title: "admin-shell/PageHeader",
  component: PageHeader,
};
export default meta;

type Story = StoryObj<typeof PageHeader>;

export const Default: Story = {
  args: {
    title: "Personas",
    description: "Gestioná las personas de tu organización.",
    breadcrumb: [{ label: "Inicio", href: "#" }, { label: "Personas" }],
    actions: <Button>Nueva persona</Button>,
  },
};
