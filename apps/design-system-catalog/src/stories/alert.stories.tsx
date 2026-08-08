import { Alert } from "@mirotaract/ui";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof Alert> = {
  title: "ui/Alert",
  component: Alert,
  args: {
    title: "Solicitud enviada",
    description: "Vas a recibir una notificación cuando se apruebe.",
  },
};
export default meta;

type Story = StoryObj<typeof Alert>;

export const Info: Story = { args: { tone: "info" } };
export const Success: Story = {
  args: { tone: "success", title: "Membresía activada" },
};
export const Warning: Story = {
  args: { tone: "warning", title: "Período por vencer" },
};
export const Danger: Story = {
  args: { tone: "danger", title: "No se pudo procesar" },
};
