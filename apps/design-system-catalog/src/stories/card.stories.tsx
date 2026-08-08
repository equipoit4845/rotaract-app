import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@equipoit4845/ui";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof Card> = {
  title: "ui/Card",
  component: Card,
};
export default meta;

type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card style={{ maxWidth: 360 }}>
      <CardHeader>
        <div>
          <CardTitle>Período 2025-2026</CardTitle>
          <CardDescription>Ciclo institucional vigente</CardDescription>
        </div>
      </CardHeader>
      <CardContent>Contenido del cuerpo de la card.</CardContent>
      <CardFooter>
        <Button variant="outline" size="sm">
          Ver detalle
        </Button>
      </CardFooter>
    </Card>
  ),
};
