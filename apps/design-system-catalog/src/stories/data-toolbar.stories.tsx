import { DataToolbar } from "@mirotaract/admin-shell";
import { Button, Input } from "@mirotaract/ui";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof DataToolbar> = {
  title: "admin-shell/DataToolbar",
  component: DataToolbar,
};
export default meta;

type Story = StoryObj<typeof DataToolbar>;

export const Default: Story = {
  render: () => (
    <DataToolbar
      search={
        <Input placeholder="Buscar personas..." aria-label="Buscar personas" />
      }
      filters={
        <>
          <Button variant="outline" size="sm">
            Estado
          </Button>
          <Button variant="outline" size="sm">
            Cargo
          </Button>
        </>
      }
      actions={<Button size="sm">Nueva persona</Button>}
    />
  ),
};
