import { DataPagination } from "@equipoit4845/admin-shell";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof DataPagination> = {
  title: "admin-shell/DataPagination",
  component: DataPagination,
};
export default meta;

type Story = StoryObj<typeof DataPagination>;

export const Default: Story = {
  args: {
    summary: "Mostrando 1–20 de 128",
    hasPrevious: false,
    hasNext: true,
  },
};

export const MiddlePage: Story = {
  args: {
    summary: "Mostrando 21–40 de 128",
    hasPrevious: true,
    hasNext: true,
  },
};
