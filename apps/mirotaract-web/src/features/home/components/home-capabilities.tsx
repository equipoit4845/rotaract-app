import { Card, CardContent, CardTitle } from "@equipoit4845/ui";

const CAPABILITIES = [
  {
    title: "Organizaciones y clubes",
    description:
      "Estructura de distritos y clubes, con jerarquía y datos institucionales.",
  },
  {
    title: "Personas y membresías",
    description:
      "Registro de personas y su relación de membresía con cada organización.",
  },
  {
    title: "Autoridades y períodos",
    description:
      "Cargos, designaciones y períodos de gestión de cada organización.",
  },
  {
    title: "Solicitudes y transferencias",
    description:
      "Solicitudes de membresía y transferencias de personas entre organizaciones.",
  },
] as const;

export function HomeCapabilities() {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--mr-space-4)",
        padding: "var(--mr-space-6)",
        maxWidth: 960,
        margin: "0 auto",
      }}
    >
      <h2 style={{ margin: 0, fontSize: "1.25rem", textAlign: "center" }}>
        Qué permite administrar
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "var(--mr-space-4)",
        }}
      >
        {CAPABILITIES.map((capability) => (
          <Card key={capability.title}>
            <CardContent>
              <CardTitle style={{ fontSize: "1rem" }}>
                {capability.title}
              </CardTitle>
              <p
                style={{
                  margin: "var(--mr-space-2) 0 0",
                  color: "var(--mr-color-text-muted)",
                  fontSize: "0.875rem",
                }}
              >
                {capability.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
