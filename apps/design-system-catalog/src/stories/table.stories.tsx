import { Badge } from "@equipoit4845/ui";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@equipoit4845/ui";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof Table> = { title: "ui/Table", component: Table };
export default meta;

type Story = StoryObj<typeof Table>;

const rows = [
  {
    name: "Ada Lovelace",
    role: "Presidente",
    status: "success" as const,
    label: "Activa",
  },
  {
    name: "Grace Hopper",
    role: "Secretaria",
    status: "warning" as const,
    label: "Pendiente",
  },
  {
    name: "Alan Turing",
    role: "Tesorero",
    status: "danger" as const,
    label: "Inactiva",
  },
];

export const Default: Story = {
  render: () => (
    <Table>
      <TableCaption>Cargos vigentes del período 2025-2026.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Cargo</TableHead>
          <TableHead>Membresía</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.name}>
            <TableCell>{row.name}</TableCell>
            <TableCell>{row.role}</TableCell>
            <TableCell>
              <Badge tone={row.status}>{row.label}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};
