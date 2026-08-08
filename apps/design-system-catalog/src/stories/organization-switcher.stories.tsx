import { OrganizationSwitcher } from "@equipoit4845/admin-shell";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

const meta: Meta<typeof OrganizationSwitcher> = {
  title: "admin-shell/OrganizationSwitcher",
  component: OrganizationSwitcher,
};
export default meta;

type Story = StoryObj<typeof OrganizationSwitcher>;

const organizations = [
  { id: "org-1", name: "Rotaract Buenos Aires" },
  { id: "org-2", name: "Rotaract Córdoba" },
  { id: "org-3", name: "Distrito 4895" },
];

function Demo() {
  const [activeId, setActiveId] = useState("org-1");
  return (
    <OrganizationSwitcher
      organizations={organizations}
      activeOrganizationId={activeId}
      onSelect={setActiveId}
    />
  );
}

export const Default: Story = { render: () => <Demo /> };
