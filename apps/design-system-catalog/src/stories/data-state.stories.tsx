import { DataState } from "@mirotaract/admin-shell";
import { Button } from "@mirotaract/ui";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof DataState> = {
  title: "admin-shell/DataState",
  component: DataState,
};
export default meta;

type Story = StoryObj<typeof DataState>;

export const Empty: Story = {
  args: {
    kind: "empty",
    title: "Sin resultados",
    description: "No hay personas que coincidan con el filtro aplicado.",
    action: (
      <Button variant="outline" size="sm">
        Limpiar filtros
      </Button>
    ),
  },
};

export const ErrorState: Story = {
  args: {
    kind: "error",
    title: "No se pudo cargar",
    description: "Ocurrió un error al consultar el Kernel. Intentá nuevamente.",
    action: <Button size="sm">Reintentar</Button>,
  },
};
