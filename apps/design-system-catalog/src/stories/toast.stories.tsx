import {
  Button,
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastTitle,
} from "@mirotaract/ui";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

const meta: Meta<typeof Toast> = { title: "ui/Toast", component: Toast };
export default meta;

type Story = StoryObj<typeof Toast>;

function ToastDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Mostrar notificación</Button>
      <Toast tone="success" open={open} onOpenChange={setOpen}>
        <ToastTitle>Membresía activada</ToastTitle>
        <ToastDescription>Se notificó a la persona por email.</ToastDescription>
        <ToastAction asChild altText="Deshacer">
          <Button variant="outline" size="sm">
            Deshacer
          </Button>
        </ToastAction>
        <ToastClose />
      </Toast>
    </>
  );
}

export const Default: Story = {
  render: () => <ToastDemo />,
};
