import { mrThemeProps } from "@equipoit4845/design-tokens";
import {
  DataState,
  ModuleFrame,
  PageHeader,
  PeriodIndicator,
  StatCard,
} from "@equipoit4845/admin-shell";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Separator,
  ToastProvider,
  ToastViewport,
  TooltipProvider,
} from "@equipoit4845/ui";
import { useState } from "react";

/**
 * Smoke test for external consumption of the design system packages
 * through the pnpm workspace protocol: real package boundaries (no
 * relative imports into packages/*), real CSS entry points, a real build,
 * and — per the design system's definition of done — a screen that
 * compiles ModuleFrame as an external module author would use it.
 */
export function App() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  return (
    <div
      {...mrThemeProps(theme)}
      style={{ minHeight: "100vh", background: "var(--mr-color-canvas)" }}
    >
      <TooltipProvider>
        <ToastProvider>
          <div
            style={{
              maxWidth: "64rem",
              margin: "0 auto",
              padding: "var(--mr-space-8)",
            }}
          >
            <PageHeader
              title="Consumer example"
              description="Renders @equipoit4845/ui and @equipoit4845/admin-shell as an installed dependency, not a relative import."
              actions={
                <Button
                  variant="outline"
                  onClick={() =>
                    setTheme((t) => (t === "light" ? "dark" : "light"))
                  }
                >
                  Cambiar a {theme === "light" ? "oscuro" : "claro"}
                </Button>
              }
            />

            <div
              style={{
                display: "grid",
                gap: "var(--mr-space-4)",
                gridTemplateColumns: "repeat(3, 1fr)",
              }}
            >
              <StatCard label="Miembros activos" value="128" tone="success" />
              <StatCard
                label="Solicitudes pendientes"
                value="4"
                tone="warning"
              />
              <StatCard label="Períodos vencidos" value="0" tone="neutral" />
            </div>

            <Separator style={{ margin: "var(--mr-space-6) 0" }} />

            <Card>
              <CardHeader>
                <CardTitle>Estado de la membresía</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge tone="success">Activa</Badge>{" "}
                <Badge tone="warning">Pendiente</Badge>{" "}
                <Badge tone="danger">Inactiva</Badge>
                <div style={{ marginTop: "var(--mr-space-4)" }}>
                  <PeriodIndicator
                    label="2025-2026"
                    status="active"
                    detail="hasta jun. 2026"
                  />
                </div>
              </CardContent>
            </Card>

            <div style={{ marginTop: "var(--mr-space-6)" }}>
              <DataState
                kind="empty"
                title="Sin resultados"
                description="No hay personas que coincidan con el filtro."
              />
            </div>
          </div>

          <ModuleFrame
            moduleName="Eventos"
            organizationName="Rotaract Buenos Aires"
            periodLabel="2025-2026"
            backHref="#"
          >
            <Card>
              <CardHeader>
                <CardTitle>Módulo externo</CardTitle>
              </CardHeader>
              <CardContent>
                Este bloque simula el contenido de un módulo consumido a través
                de ModuleFrame — sin sidebar, sesión, autorización ni navegación
                institucional propias.
              </CardContent>
            </Card>
          </ModuleFrame>

          <ToastViewport />
        </ToastProvider>
      </TooltipProvider>
    </div>
  );
}
