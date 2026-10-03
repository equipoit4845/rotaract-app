# Kit de UI: que tu app se vea como Mi Rotaract

Los componentes de Mi Rotaract (el marco con la barra lateral, las tablas,
los badges de estado, el diálogo de confirmación, los estados vacíos) están
publicados como un **registro de [shadcn](https://ui.shadcn.com)**. Con
`npx shadcn add` se copian a tu proyecto: el código queda en tu repo y lo
podés adaptar.

Requisitos: React 19, Tailwind CSS v4 y un proyecto con shadcn inicializado
(`npx shadcn@latest init`). Probado con Next.js 15.

## Instalar

```bash
# 1. El tema (colores, radios, tipografía; claro y oscuro)
npx shadcn@latest add https://developers.rotaract4845.com/r/mirotaract-theme.json

# 2. Lo que necesites (cada uno trae sus dependencias)
npx shadcn@latest add https://developers.rotaract4845.com/r/app-shell.json
npx shadcn@latest add https://developers.rotaract4845.com/r/data-table.json
npx shadcn@latest add https://developers.rotaract4845.com/r/status-badge.json
npx shadcn@latest add https://developers.rotaract4845.com/r/confirm-dialog.json
npx shadcn@latest add https://developers.rotaract4845.com/r/page-header.json
npx shadcn@latest add https://developers.rotaract4845.com/r/empty-state.json
```

Para escribir menos, registralo en `components.json`:

```json
{ "registries": { "@mirotaract": "https://developers.rotaract4845.com/r/{name}.json" } }
```

y después `npx shadcn@latest add @mirotaract/data-table`.

Todo se instala en `components/mirotaract/`, así que no pisa tus
`components/ui`. El índice completo está en
`https://developers.rotaract4845.com/r/registry.json`.

| Ítem | Archivo | Qué trae |
|---|---|---|
| `mirotaract-theme` | `globals.css` | Variables del tema (primario arándano, neutros, `success`, `warning`), modo oscuro con la clase `dark`. |
| `mirotaract-ui` | `ui.tsx`, `link.tsx` | Los componentes base del producto: `Button`, `Badge`, `Card`, `Dialog`, `Table`, `Input`, `Select`, `Tabs`, `Switch`, `Checkbox`, `Alert`, `Skeleton`... |
| `app-shell` | `app-shell.tsx`, `brand.tsx` | `AppShell`: barra lateral con grupos plegables, barra superior, menú en el celular. `Logo`: el logo oficial de Rotaract Distrito 4845 (`variant="mark"` es la rueda sola; `tone="current"` lo pinta con el color del texto; en oscuro usa `--brand-logo`, blanco con el tema). |
| `page-header` | `page-header.tsx` | `PageHeader`, `Breadcrumbs`, `SectionHeader`. |
| `data-table` | `data-table.tsx` | `DataTable`: tabla, barra de herramientas, carga, vacío/error, paginación. |
| `status-badge` | `status-badge.tsx` | `StatusBadge` con los estados del kernel. |
| `confirm-dialog` | `confirm-dialog.tsx` | `ConfirmationDialog`. |
| `empty-state` | `data-display.tsx` | `DataState`, `StatCard`, `DataToolbar`, `DataPagination`. |

## Tipografía

Mi Rotaract usa **Public Sans**. En Next.js:

```tsx
// app/layout.tsx
import { Public_Sans } from "next/font/google";
const publicSans = Public_Sans({ subsets: ["latin"], variable: "--font-public-sans" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={publicSans.variable}>
      <body>{children}</body>
    </html>
  );
}
```

Sin eso, el tema usa la fuente del sistema.

## Ejemplo

```tsx
"use client";
import { Home, Users } from "lucide-react";
import { AppShell } from "@/components/mirotaract/app-shell";
import { Logo } from "@/components/mirotaract/brand";
import { PageHeader } from "@/components/mirotaract/page-header";
import { DataTable } from "@/components/mirotaract/data-table";
import { StatusBadge } from "@/components/mirotaract/status-badge";

export default function Socios({ socios }: { socios: Member[] }) {
  return (
    <AppShell
      brand={
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Logo size={28} /> Reuniones
        </span>
      }
      mark={<Logo variant="mark" size={26} />}
      title="Socios"
      navItems={[
        { label: "Inicio", href: "/", icon: <Home /> },
        { label: "Socios", href: "/socios", icon: <Users />, active: true },
      ]}
    >
      <PageHeader title="Socios" description="Padrón del club, leído de Mi Rotaract." />
      <DataTable
        rows={socios}
        getRowId={(s) => s.membershipId}
        columns={[
          { key: "nombre", header: "Nombre", cell: (s) => s.person.displayName },
          { key: "estado", header: "Estado",
            cell: (s) => <StatusBadge kind="membership" status={s.status} /> },
        ]}
        empty={{ title: "Todavía no hay socios" }}
      />
    </AppShell>
  );
}
```

Estados propios de tu módulo: `<StatusBadge label="Votación abierta" tone="info" />`
(`tone`: `neutral`, `info`, `success`, `warning`, `danger`).

## Navegación en Next.js

Los componentes navegan con `MrLink` (`components/mirotaract/link.tsx`), un
`<a>` común para que funcionen en cualquier app React. En Next.js cambiá su
contenido por `export { default as MrLink } from "next/link";` y la
navegación pasa a ser del lado del cliente.

## Pautas para que se sienta parte de Mi Rotaract

- Textos en español simple, en voseo ("Elegí", "Completá"), sin jerga
  técnica ni códigos de permisos en pantalla.
- Una acción que cambia el estado de algo se confirma con
  `ConfirmationDialog`; las destructivas con `confirmVariant="danger"`.
- Mostrá estados con `StatusBadge`, nunca el valor crudo (`ACTIVE`).
- Las listas vacías explican qué falta y qué hacer (`DataState`).
- No dupliques datos del kernel: leelos con la API de datos.

## Actualizar

Volvé a correr `npx shadcn@latest add <ítem> --overwrite`. Como el código es
tuyo, revisá el diff antes de confirmar si lo modificaste.

> Este kit reemplaza al contrato anterior basado en los paquetes
> `@equipoit4845/*` ([module-ui-contract.md](../module-ui-contract.md)).
