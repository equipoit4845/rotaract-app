import { buttonVariants } from "@/components/ui";
import Link from "next/link";

const STEPS = [
  {
    title: "Tu organización te habilita",
    description:
      "El acceso se otorga a miembros habilitados por su club o distrito.",
  },
  {
    title: "Recibís una invitación",
    description: "Seguí el enlace del correo para crear tu cuenta.",
  },
  {
    title: "Ingresás con tu rol",
    description:
      "Cada persona ve las herramientas que corresponden a su cargo.",
  },
] as const;

export function HomeAccessModel() {
  return (
    <section id="acceso" className="scroll-mt-16 px-4 py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="mb-3 text-sm font-medium uppercase tracking-wider text-primary">
            Acceso seguro
          </p>
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Una plataforma para cada rol.
          </h2>
          <p className="mb-8 text-muted-foreground">
            El acceso es otorgado a miembros habilitados por su organización. Si
            recibiste una invitación por correo, seguí el enlace para crear tu
            cuenta; si ya tenés una, ingresá con tus credenciales.
          </p>
          <Link href="/login" className={buttonVariants({ size: "lg" })}>
            Ya tengo cuenta
          </Link>
        </div>
        <ol className="space-y-4">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex gap-4 rounded-2xl border border-border bg-card p-5 shadow-xs"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {index + 1}
              </span>
              <div>
                <h3 className="font-semibold text-foreground">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
