# Contrato de UI para módulos externos

Este documento es para quien construye un **módulo externo** (una app o
repo separado que se embebe en, o navega desde, la Web Shell de Mi
Rotaract) y necesita que su interfaz se vea consistente sin importar código
fuente de la Web Shell ni de otro módulo. Si estás construyendo dentro de
este monorepo, ver en cambio
[`08-design-system.md`](08-design-system.md).

## Qué instala un módulo

Sólo paquetes públicos, versionados independientemente, publicados en
GitHub Packages bajo el scope `@mirotaract`. `react`/`react-dom` son
`peerDependencies` en los cuatro — el módulo aporta su propia copia,
`^19.0.0`:

```bash
npm install @mirotaract/design-tokens @mirotaract/ui @mirotaract/admin-shell react@^19 react-dom@^19
```

`@mirotaract/icons` es opcional — sólo hace falta si el módulo usa
`StatusIcon`/`Logo` directamente en vez de recibir íconos por props.

### Autenticación contra el registry

GitHub Packages exige un token para *instalar*, no sólo para publicar
(incluso en paquetes públicos del repo). En el `.npmrc` del módulo:

```ini
@mirotaract:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

`GITHUB_PACKAGES_TOKEN` es un PAT (classic o fine-grained) con
`read:packages`, provisto por variable de entorno — nunca hardcodeado en
el `.npmrc` commiteado. En CI, `GITHUB_TOKEN` (el token efímero que
GitHub Actions ya inyecta) alcanza si el workflow corre en el mismo repo o
tiene acceso al paquete.

Un módulo **nunca** instala ni importa:

- el Kernel SDK o sus contratos (`@mirotaract/kernel-sdk`,
  `@mirotaract/kernel-contracts`);
- Prisma, `@mirotaract/auth-middleware`, o cualquier paquete que hable con
  la base de datos directamente;
- código fuente de `apps/mirotaract-web` o de otro módulo.

Toda esa integración (sesión, permisos, organización activa, período,
feature flags) la resuelve la Web Shell y llega al módulo como **props ya
resueltas** — nunca como un import.

## CSS isolation

Cada paquete expone su hoja de estilos como export propio; no hay un solo
bundle "todo incluido":

```ts
import "@mirotaract/design-tokens/tokens.css";
import "@mirotaract/ui/styles.css";
import "@mirotaract/admin-shell/styles.css";
```

- Todo selector público está bajo el prefijo `.mr-` y ningún paquete aplica
  estilos a elementos HTML sueltos — un módulo puede convivir con su propio
  CSS (o el de otro framework) sin colisión de especificidad ni de reset.
- `@mirotaract/design-tokens/reset.css` es opt-in: sólo impórtalo si el
  módulo no trae ya un reset propio. Nunca se carga automáticamente.
- El tema se aplica explícitamente, envolviendo el árbol del módulo (o de
  toda la página, si el módulo controla el documento):

  ```tsx
  import { mrThemeProps } from "@mirotaract/design-tokens";

  <div {...mrThemeProps("light")}>
    <ModuleApp />
  </div>;
  ```

  Un módulo no debe leer `prefers-color-scheme` para decidir esto — el
  tema activo se lo pasa la Web Shell (o, si el módulo corre standalone
  durante desarrollo, lo elige el propio módulo, pero de forma explícita).
- Los tokens están scopeados a `.mr-theme[data-mr-theme]`, no a `:root`, así
  que dos árboles con temas distintos pueden coexistir en la misma página
  sin que uno pise las variables del otro.

## `ModuleFrame`

Es el único punto de integración estructural entre la Web Shell y un
módulo. Deliberadamente mínimo:

```tsx
import { ModuleFrame } from "@mirotaract/admin-shell";

<ModuleFrame
  moduleName="Eventos"
  organizationName={organization.name}
  periodLabel={period?.label}
  backHref="/admin"
>
  {/* contenido propio del módulo */}
</ModuleFrame>;
```

| Prop | Tipo | Nota |
| --- | --- | --- |
| `moduleName` | `string` | Nombre visible del módulo, no un slug técnico. |
| `organizationName` | `string` | Ya resuelto por quien monta `ModuleFrame` — el módulo no lo busca. |
| `periodLabel` | `string?` | Igual: texto ya formateado, no un objeto Kernel. |
| `backHref` | `string` | Vuelve a la Web Shell. `ModuleFrame` no sabe a dónde lleva más allá del link. |
| `children` | `ReactNode` | Todo el contenido del módulo. |

`ModuleFrame` **no** tiene: sidebar, navegación institucional, refresh de
sesión, descubrimiento de otros módulos, ni lógica de autorización. Si tu
módulo necesita algo de eso, es una señal de que ese algo pertenece a la
Web Shell (que te lo debe pasar resuelto) — no algo para agregarle a
`ModuleFrame`. Comparar con `AdminFrame`
([08-design-system.md](08-design-system.md#componentes)): ese sí tiene
sidebar/nav, pero es exclusivo de la Web Shell — un módulo externo nunca lo
monta directamente.

## Accesibilidad

Los componentes de `@mirotaract/ui`/`admin-shell` ya cumplen: teclado,
foco visible, ARIA (nativo o heredado de Radix), y — desde el cierre de
v1 — pasan un suite automatizado (`axe-core` vía
`@storybook/test-runner`) que corre en CI sobre cada story del catálogo.
Eso cubre los componentes en sí, **no** el contenido que un módulo pone
adentro de `ModuleFrame`: jerarquía de encabezados, texto alternativo de
imágenes propias, y foco inicial al navegar dentro del módulo siguen
siendo responsabilidad del módulo.

## Actualización y deprecaciones

- Los cuatro paquetes publican changelog vía Changesets (ver
  [`08-design-system.md`](08-design-system.md#publicación)) — leelo antes
  de subir la versión mínima soportada, especialmente ante un bump `major`.
- Una API que se va a remover se marca `@deprecated` en su tipo/JSDoc al
  menos una versión `minor` antes del `major` que la remueve; no hay
  remociones silenciosas sin ese aviso previo.
- Fijá rangos semver normales (`^0.2.0`), nunca `*`/`latest`: un módulo que
  no fija versión puede romper sin previo aviso ante un `major` publicado.

## Compatibilidad de versiones

- Los cuatro paquetes se versionan juntos vía Changesets: un cambio que
  rompe la API pública de cualquiera de ellos es `major` para los cuatro
  (`updateInternalDependencies: patch` en `.changeset/config.json` sólo
  cubre bumps automáticos por dependencia interna, no reemplaza declarar
  `major` cuando corresponde).
- Un módulo fija rangos semver normales (`^0.2.0`, etc.) — no `workspace:*`
  ni un path relativo a este repo.
- Antes de levantar la versión mínima soportada, confirmá en el changelog
  de cada paquete (generado por Changesets) que no hay cambios `major`
  pendientes de migrar.

## Reglas de PR para un módulo

Cada PR de un módulo que toca UI debe:

1. Declarar qué versión de `@mirotaract/design-tokens` / `ui` /
   `admin-shell` está usando (el diff de `package.json` alcanza).
2. Incluir una captura visual (o el link al preview de Storybook del
   catálogo, si el componente que se está evaluando vive ahí) de la
   pantalla afectada, en claro y oscuro si el módulo soporta ambos.
3. No introducir ningún selector CSS con prefijo `.mr-` propio — ese
   namespace es de los paquetes compartidos.
4. No copiar código fuente de `@mirotaract/ui` o `@mirotaract/admin-shell`
   dentro del módulo "para ajustarlo": un componente que casi sirve pero no
   del todo es una señal para pedir el cambio en el paquete compartido, no
   para bifurcarlo.
5. No importar nada de la lista de "Qué instala un módulo" marcada como
   prohibida arriba, ni asumir acceso a `fetch`/`localStorage` provisto por
   los paquetes compartidos (ninguno lo expone).

## Ejemplo completo

Todo lo de arriba junto, copiable — instalación ya asumida:

```tsx
// main.tsx (o el entrypoint que arme el documento)
import "@mirotaract/design-tokens/tokens.css";
import "@mirotaract/design-tokens/reset.css"; // opt-in: sólo si el módulo no trae reset propio
import "@mirotaract/ui/styles.css";
import "@mirotaract/admin-shell/styles.css";

import { mrThemeProps } from "@mirotaract/design-tokens";
import { ModuleFrame } from "@mirotaract/admin-shell";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@mirotaract/ui";
import { createRoot } from "react-dom/client";

// La Web Shell le pasa esto ya resuelto (via query string, postMessage,
// props de un host component, lo que use su mecanismo de embebido) — el
// módulo no lo decide ni lo busca.
type ModuleContext = {
  theme: "light" | "dark";
  organizationName: string;
  periodLabel: string;
};

function MeetingsModule({ theme, organizationName, periodLabel }: ModuleContext) {
  return (
    <div {...mrThemeProps(theme)}>
      <ModuleFrame
        moduleName="Eventos"
        organizationName={organizationName}
        periodLabel={periodLabel}
        backHref="/admin"
      >
        <Card>
          <CardHeader>
            <CardTitle>Próxima reunión</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge tone="info">Programada</Badge>
            <Button>Ver detalle</Button>
          </CardContent>
        </Card>
      </ModuleFrame>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <MeetingsModule theme="light" organizationName="Rotaract Buenos Aires" periodLabel="2025-2026" />,
  );
}
```

## Estado actual

Este contrato ya es ejecutable, con dos niveles de evidencia:

1. `apps/design-system-consumer`, dentro de este monorepo, instala los
   cuatro paquetes por `workspace:*` (mismo `package.json#exports`, mismo
   `dist/` real, mismo grafo de peers que vería un consumidor externo) y
   monta `ModuleFrame` con contenido real.
2. Publicación real (no simulada) a un registry npm efímero (Verdaccio):
   los cuatro paquetes se publicaron de verdad con `pnpm publish`, y un
   consumidor separado — fuera del workspace, sin `workspace:*`/`file:`/
   `link:` — los instaló con `npm install` puro, verificó una sola copia
   de `react`/`react-dom` (sin duplicados vía `npm ls`), hizo SSR en claro
   y oscuro, y compiló producción con Vite.

Pendiente — necesita credenciales reales que este entorno no tiene, ver
[`08-design-system.md`](08-design-system.md#pendientes) —: el primer
publish real a `npm.pkg.github.com`, y un repositorio de módulo externo de
referencia (separado de este monorepo) consumiendo esa versión publicada
en lugar de la simulación con Verdaccio.
