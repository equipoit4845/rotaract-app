import { Tabs, TabsContent, TabsList, TabsTrigger } from "@equipoit4845/ui";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof Tabs> = { title: "ui/Tabs", component: Tabs };
export default meta;

type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="active" style={{ width: 320 }}>
      <TabsList>
        <TabsTrigger value="active">Activos</TabsTrigger>
        <TabsTrigger value="pending">Pendientes</TabsTrigger>
        <TabsTrigger value="inactive">Inactivos</TabsTrigger>
      </TabsList>
      <TabsContent value="active">128 miembros activos.</TabsContent>
      <TabsContent value="pending">4 solicitudes pendientes.</TabsContent>
      <TabsContent value="inactive">12 miembros inactivos.</TabsContent>
    </Tabs>
  ),
};
