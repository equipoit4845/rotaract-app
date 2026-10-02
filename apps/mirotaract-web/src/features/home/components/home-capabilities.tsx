import { ArrowLeftRight, Building2, ShieldCheck, Users } from "lucide-react";

const CAPABILITIES = [
  {
    icon: Building2,
    title: "Organizaciones y clubes",
    description:
      "Estructura de distritos y clubes, con jerarquía y datos institucionales.",
  },
  {
    icon: Users,
    title: "Personas y membresías",
    description:
      "Registro de personas y su relación de membresía con cada organización.",
  },
  {
    icon: ShieldCheck,
    title: "Autoridades y períodos",
    description:
      "Cargos, designaciones y períodos de gestión de cada organización.",
  },
  {
    icon: ArrowLeftRight,
    title: "Solicitudes y transferencias",
    description:
      "Solicitudes de membresía y transferencias de personas entre organizaciones.",
  },
] as const;

export function HomeCapabilities() {
  return (
    <section
      id="capacidades"
      className="scroll-mt-16 border-y border-border bg-muted/40 px-4 py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-wider text-primary">
            Todo en un solo lugar
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Herramientas para que el club avance.
          </h2>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map(({ icon: Icon, title, description }) => (
            <article
              key={title}
              className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-xs transition-shadow hover:shadow-md"
            >
              <span className="mb-4 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mb-2 font-semibold text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
