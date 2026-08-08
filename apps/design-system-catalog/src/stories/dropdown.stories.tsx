import {
  Button,
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from "@equipoit4845/ui";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof Dropdown> = {
  title: "ui/Dropdown",
  component: Dropdown,
};
export default meta;

type Story = StoryObj<typeof Dropdown>;

export const Default: Story = {
  render: () => (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button variant="outline">Acciones</Button>
      </DropdownTrigger>
      <DropdownContent align="start">
        <DropdownLabel>Membresía</DropdownLabel>
        <DropdownItem>Activar</DropdownItem>
        <DropdownItem>Poner en licencia</DropdownItem>
        <DropdownSeparator />
        <DropdownItem>Dar de baja</DropdownItem>
      </DropdownContent>
    </Dropdown>
  ),
};
