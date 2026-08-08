import { FormField, Input, Select, Textarea } from "@equipoit4845/ui";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta = { title: "ui/FormField" };
export default meta;

type Story = StoryObj;

export const TextInput: Story = {
  render: () => (
    <FormField
      label="Nombre"
      hint="Nombre completo tal como figura en el DNI."
      htmlFor="name"
    >
      <Input id="name" placeholder="Ada Lovelace" />
    </FormField>
  ),
};

export const WithError: Story = {
  render: () => (
    <FormField
      label="Email"
      error="El email ya está en uso."
      htmlFor="email"
      required
    >
      <Input id="email" defaultValue="ada@example.com" />
    </FormField>
  ),
};

export const SelectField: Story = {
  render: () => (
    <FormField label="Rol" htmlFor="role">
      <Select id="role" defaultValue="member">
        <option value="member">Miembro</option>
        <option value="president">Presidente</option>
      </Select>
    </FormField>
  ),
};

export const TextareaField: Story = {
  render: () => (
    <FormField label="Notas" htmlFor="notes">
      <Textarea id="notes" placeholder="Notas adicionales" />
    </FormField>
  ),
};
