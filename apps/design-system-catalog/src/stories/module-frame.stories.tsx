import { ModuleFrame } from "@equipoit4845/admin-shell";
import { Card, CardContent } from "@equipoit4845/ui";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof ModuleFrame> = {
  title: "admin-shell/ModuleFrame",
  component: ModuleFrame,
};
export default meta;

type Story = StoryObj<typeof ModuleFrame>;

export const Default: Story = {
  args: {
    moduleName: "Eventos",
    organizationName: "Rotaract Buenos Aires",
    periodLabel: "2025-2026",
    backHref: "#",
  },
  render: (args) => (
    <ModuleFrame {...args}>
      <Card>
        <CardContent>Contenido propio del módulo externo.</CardContent>
      </Card>
    </ModuleFrame>
  ),
};
