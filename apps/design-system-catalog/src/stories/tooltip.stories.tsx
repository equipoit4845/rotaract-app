import { Button, Tooltip } from "@equipoit4845/ui";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof Tooltip> = { title: "ui/Tooltip", component: Tooltip };
export default meta;

type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  render: () => (
    <Tooltip content="Elimina la solicitud">
      <Button variant="outline">Eliminar</Button>
    </Tooltip>
  ),
};
