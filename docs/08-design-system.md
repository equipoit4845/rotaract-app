# Design System

Conjunto de paquetes puramente visuales, distribuibles y compartidos entre la
Web Shell (`apps/mirotaract-web`) y módulos externos. Ningún paquete de este
árbol resuelve sesión, permisos, organización activa, período, módulos ni
feature flags — eso sigue siendo responsabilidad de la Web Shell. Los
componentes reciben ese contexto ya resuelto por props.

Para consumo desde un módulo externo (fuera de este monorepo), ver
[`module-ui-contract.md`](module-ui-contract.md).

## Arquitectura

```text
          @equipoit4845/design-tokens
             /                  \
@equipoit4845/icons          @equipoit4845/ui
             \                  /
            @equipoit4845/admin-shell
                    ↓
                  apps/*
```

| Paquete | Depende de | Contenido |
| --- | --- | --- |
| `@equipoit4845/design-tokens` | (nada) | `tokens.css`, `reset.css` (opt-in) y tipos TS de tema/tono. |
| `@equipoit4845/icons` | `react` (peer) | Logo y estados visuales genéricos (`StatusIcon`). |
| `@equipoit4845/ui` | `design-tokens`; primitivas Radix; `react`/`react-dom` (peer) | Primitivas de interfaz. |
| `@equipoit4845/admin-shell` | `design-tokens`, `ui`, `icons`; `react`/`react-dom` (peer) | Patrones de administración construidos sobre `ui`. |

### Boundaries automáticos

`pnpm contracts:design-system-boundaries` (parte de `pnpm contracts:validate`,
script en [`scripts/validate-design-system-boundaries.mjs`](../scripts/validate-design-system-boundaries.mjs))
recorre el `src/` de los cuatro paquetes y falla si encuentra:

- un import fuera del allow-list declarado por paquete (p. ej. `ui` sólo
  puede importar `react`, `react-dom`, `@equipoit4845/design-tokens` y
  `@radix-ui/*`);
- un import de Next.js, el Kernel SDK/contratos, `@mirotaract/auth-middleware`,
  `@prisma/client`, o cualquier ruta bajo `apps/`, sin importar el paquete;
- uso de `fetch(...)`, `localStorage`, `sessionStorage` o
  `document.cookie` en el código fuente de cualquiera de los cuatro
  paquetes.

Es una validación de texto (regex sobre imports y globals), no un
type-checker de grafo de dependencias — deliberado, para que corra sin
compilar y quede en la misma familia que el resto de `scripts/validate-*.mjs`.

## Theming

La API pública es explícita; ningún paquete lee `prefers-color-scheme` ni
cambia de tema por su cuenta — el host decide:

```tsx
<div className="mr-theme" data-mr-theme="light">
  <App />
</div>
```

`@equipoit4845/design-tokens` exporta un helper de conveniencia para esto:

```tsx
import { mrThemeProps } from "@equipoit4845/design-tokens";

<div {...mrThemeProps("dark")}>
  <App />
</div>;
```

Los tokens se declaran en `.mr-theme[data-mr-theme="light"|"dark"]`, nunca en
`:root`. Todos los selectores públicos usan el prefijo `.mr-`. Ningún paquete
aplica estilos a elementos HTML sueltos; el único reset disponible es
`@equipoit4845/design-tokens/reset.css`, opt-in y separado de `tokens.css`.

### Tokens públicos

Semánticos, no escalas de color crudas:

- **Canvas/surface**: `--mr-color-canvas`, `--mr-color-surface`,
  `--mr-color-surface-muted`, `--mr-color-surface-raised`.
- **Texto**: `--mr-color-text`, `--mr-color-text-muted`,
  `--mr-color-text-on-action`.
- **Borde**: `--mr-color-border`, `--mr-color-border-strong`.
- **Acción**: `--mr-color-action`, `--mr-color-action-hover`,
  `--mr-color-focus-ring`.
- **Estados** (`neutral`, `info`, `success`, `warning`, `danger`), cada uno
  con sufijo `-text`, `-surface`, `-border`.
- Fundamentos no cromáticos: `--mr-font-sans`, `--mr-radius-*`,
  `--mr-shadow-*`, `--mr-space-*`.

Los tonos genéricos de `@equipoit4845/icons` (`active`, `inactive`, `pending`)
son alias visuales de esos cinco estados, resueltos en el componente — nunca
tokens CSS adicionales.

## Componentes

### `@equipoit4845/ui`

Button, IconButton, Badge, Alert, Toast (+`ToastProvider`/`ToastViewport`),
Tooltip (+`TooltipProvider`), Spinner, Progress, Skeleton, Input, Select,
Textarea, FormField, Checkbox, Switch, Card, Dialog, Tabs, Dropdown,
Separator, Table — todo el inventario original del paquete está
implementado. Dialog/Tabs/Dropdown/Toast/Tooltip/Checkbox/Switch/Progress
envuelven las primitivas Radix correspondientes (`@radix-ui/react-*`), que
son `dependencies` reales del paquete — foco, ARIA y navegación de teclado
los resuelve Radix, no una reimplementación propia. Todo componente que
renderiza un único nodo DOM interactivo (`Button`, `Input`, `Select`,
`Textarea`, `IconButton`, y cada wrapper Radix) usa `forwardRef`.

### `@equipoit4845/admin-shell`

PageHeader, StatCard, DataState (variantes `empty`/`error`; una variante de
carga se compone aparte con `Skeleton` de `ui`), Breadcrumbs (extraído de
`PageHeader`, que ahora lo usa internamente), Avatar, PeriodIndicator
(`status: "active" | "inactive" | "pending"`, nunca un enum de Kernel),
DataToolbar, DataPagination (cursor-shaped: `hasPrevious`/`hasNext`, no
numeración de página — así calza con la paginación por cursor real del
Kernel), OrganizationSwitcher, AdminFrame y ModuleFrame.

`AdminFrame` recibe navegación ya filtrada (`navItems`), organización,
período, usuario y acciones — no interpreta permisos ni sabe qué es un rol.
`ModuleFrame` es deliberadamente mínimo: nombre del módulo, organización,
período, `backHref` y contenido; sin sidebar, refresh, sesión, autorización,
descubrimiento de módulos ni navegación institucional. El contrato completo
para consumirlo desde un módulo externo está en
[`module-ui-contract.md`](module-ui-contract.md).

### `@equipoit4845/icons`

`Logo` (placeholder, pendiente de asset final de marca) y `StatusIcon`
(tonos `success`/`warning`/`danger`/`info`/`neutral`/`active`/`inactive`/`pending`).

## Accesibilidad

Todo componente interactivo soporta teclado, foco visible
(`:focus-visible` con `--mr-color-focus-ring`), `ref` forwarding y
`className` pasante, y ARIA básico o heredado de Radix. `Separator` expone
`role="separator"` + `aria-orientation`; `FormFieldError` usa `role="alert"`;
`IconButton` exige `label` (no hay botón sólo-ícono sin nombre accesible);
`Alert` usa `role="alert"` para `danger` y `role="status"` para el resto;
`Toast` hereda la región `aria-live` de Radix.

### Accesibilidad automatizada

`pnpm --filter @mirotaract/design-system-catalog test:a11y` corre
[`@storybook/test-runner`](https://github.com/storybookjs/test-runner) +
`axe-playwright` contra el catálogo *construido* (no el dev server) —
navega cada story en Chromium headless e inyecta axe-core, fallando el
build ante cualquier violación WCAG 2.0/2.1 A/AA real. La configuración
vive en `apps/design-system-catalog/.storybook/test-runner.ts` (el archivo
tiene que estar ahí, no en la raíz del proyecto — `@storybook/test-runner`
sólo lo resuelve desde `<configDir>/test-runner`).

Sólo cubre el tema claro (el decorator global no varía tema por test
todavía) y excluye `Foundations/Tokens` (una grilla de swatches sin
estructura semántica que revisar). Esta pipeline encontró y forzó a
corregir dos bugs reales del propio design system durante su puesta en
marcha:

1. `reset.css` fijaba `color: inherit` en `.mr-theme button` — con
   especificidad (0,1,1), le ganaba a `.mr-button--primary { color: ... }`
   (0,1,0) y forzaba todo botón de vuelta al color de texto ambiente,
   rompiendo el contraste blanco-sobre-azul de los botones primarios. El
   reset ahora sólo normaliza `font`, nunca `color`.
2. `--mr-color-text-muted` / `--mr-color-state-neutral-text` (`#64748b`)
   medían ~4.3:1 sobre `--mr-color-surface-muted` — por debajo del mínimo
   AA de 4.5:1 para texto normal. Se oscurecieron a `#475569` (~6.9:1).

También se agregó un `aria-label` por defecto ("Progreso") a `Progress`:
un `role="progressbar"` sin nombre accesible es una violación real
(`aria-progressbar-name`), no hipotética.

## Visual regression

`pnpm --filter @mirotaract/design-system-catalog test:visual` corre
[Playwright](https://playwright.dev) contra el catálogo construido,
capturando una matriz curada (no exhaustiva) de componentes:

- **`visual/components.spec.ts`**: Button, Badge, Card, Input (FormField),
  Table, PageHeader, StatCard, OrganizationSwitcher, AdminFrame,
  ModuleFrame y Dialog (abierto) — claro y oscuro, viewport desktop.
- **`visual/admin-mobile.spec.ts`**: AdminFrame, PageHeader, DataToolbar,
  Table, OrganizationSwitcher, ModuleFrame — viewport mobile (390×844),
  sólo tema claro (el eje claro/oscuro ya está cubierto en desktop).

Cada captura está recortada al elemento raíz que la propia story renderiza
(`.mr-theme > *`, primer hijo), no a `#storybook-root` ni a la página
completa — ambos son de altura `100vh` por el decorator global, así que un
regresión real en un componente chico (p. ej. un color de fondo) queda
diluida muy por debajo del umbral de diferencia si se compara sobre esa
área. Confirmado en la puesta en marcha: un cambio deliberado de color
pasó igual con captura de página completa y con `#storybook-root`, hasta
recortar al elemento real.

Baselines committeados en `apps/design-system-catalog/visual/__screenshots__/`.

```bash
pnpm --filter @mirotaract/design-system-catalog test:visual          # compara contra baseline
pnpm --filter @mirotaract/design-system-catalog test:visual:update   # regenera baseline
```

**Política de aprobación**:

- Un PR que cambia una captura debe explicar *por qué* en la descripción
  (qué componente, qué cambió visualmente) — el diff de imagen no
  reemplaza esa explicación.
- Actualizar baselines (`test:visual:update`) es un paso manual y explícito
  del autor del cambio, nunca un paso automático de CI: CI sólo compara,
  nunca reescribe baselines por su cuenta. Si CI reescribiera baselines
  automáticamente, una regresión real se auto-aprobaría en vez de fallar.
- Un PR que sólo actualiza baselines sin cambiar código de `packages/*`
  amerita revisión visual explícita del reviewer (mirar el PNG nuevo, no
  sólo confiar en que el test ahora pasa).

## Catálogo (Storybook)

`apps/design-system-catalog` es un Storybook standalone (Vite, sin Next),
con una story por componente implementado (22 archivos de story) más una
página de fundamentos (`Foundations/Tokens`). Incluye
`@storybook/addon-a11y`, un toggle de tema en la toolbar, y
`TooltipProvider`/`ToastProvider` montados globalmente en el decorator para
que las stories de `Tooltip` y `Toast` no necesiten boilerplate propio.

```bash
pnpm --filter @mirotaract/design-system-catalog dev    # http://localhost:6006
pnpm --filter @mirotaract/design-system-catalog build   # storybook-static/
```

## Publicación

Los cuatro paquetes compilan a `dist/` real (no se exporta `src/` sin
compilar): `tsc -p tsconfig.build.json` emite `.js`/`.d.ts`/`.map`, y
`scripts/copy-package-css.mjs` copia las hojas de estilo (`tokens.css`,
`reset.css`, `styles.css`) que `tsc` no toca. `package.json#exports` apunta
a `dist/*`, no a `src/*`.

- **Changesets** gestiona versión y changelog. `.changeset/config.json`
  ignora todo lo que no sea uno de los cuatro paquetes (`mirotaract-web`,
  `institutional-kernel-api`, `kernel-sdk`, `kernel-contracts`,
  `auth-middleware`, el catálogo y el consumidor de ejemplo nunca se
  versionan por Changesets).
- **Registry**: GitHub Packages (`https://npm.pkg.github.com`), configurado
  vía `publishConfig` en cada `package.json` y `@equipoit4845:registry=...`
  en `.npmrc` — este último sólo importa para instalar/publicar desde
  *fuera* del workspace; dentro del monorepo todo resuelve por
  `workspace:*`.
- **CI**: [`.github/workflows/design-system-release.yml`](../.github/workflows/design-system-release.yml)
  corre `changesets/action` en cada push a `main` que toque alguno de los
  cuatro paquetes o `.changeset/**` — sin changesets pendientes abre/actualiza
  una PR de versión; al mergearla, publica. Requiere que el `GITHUB_TOKEN`
  del repo tenga permiso `packages: write` (ya solicitado en el workflow);
  no hace falta ningún paso manual de `npm publish`.
- **Validado end-to-end** con un registry npm real: se levantó un
  Verdaccio efímero, se publicaron los cuatro paquetes de verdad
  (`pnpm publish`), y se instalaron con `npm install` puro (no
  `workspace:*`) en un consumidor separado que compiló y renderizó
  `ModuleFrame` — confirmando que el contrato de publicación funciona antes
  de intentarlo contra GitHub Packages real.

```bash
pnpm changeset              # documentar un cambio publicable
pnpm changeset status       # ver qué se liberaría
pnpm version-packages        # aplicar los changesets pendientes (bump + changelog)
pnpm release                 # build + changeset publish (lo corre CI, no manual)
```

## Consumidor externo de ejemplo

`apps/design-system-consumer` es una app Vite mínima que instala
`design-tokens`, `ui` y `admin-shell` como dependencias de workspace,
importa cada hoja de estilos por separado, y monta `ModuleFrame` con
contenido real (`Card`, `Badge`) — la misma forma en que lo haría un módulo
externo, sólo que resuelto vía `workspace:*` en vez de una versión
publicada.

```bash
pnpm --filter @mirotaract/design-system-consumer-example build
```

## Contribución

- Todo cambio visual nuevo entra primero a `ui` o `admin-shell` según la
  clasificación:

  ```text
  GENERIC       → @equipoit4845/ui
  ADMIN_PATTERN → @equipoit4845/admin-shell
  DOMAIN        → app o módulo correspondiente
  ```

- Un componente `DOMAIN` (que conoce strings o tipos de negocio) no entra a
  estos paquetes, sin excepción — ver `PeriodIndicator` como ejemplo del
  límite (tri-estado visual, nunca un enum de Kernel).
- CSS nuevo siempre usa variables de `design-tokens`, nunca colores
  literales, y siempre bajo un selector `.mr-*` con clase.
- Antes de subir un cambio: `pnpm --filter @equipoit4845/<paquete> typecheck`,
  `... lint` (Prettier) y `pnpm contracts:design-system-boundaries` desde la
  raíz deben pasar. Un cambio en un componente publicable necesita
  `pnpm changeset`.

## Cierre v1 — estado por objetivo

Al cierre de esta fase:

```text
Foundation                  DONE
Component inventory         DONE
Admin shell primitives      DONE
Automated boundaries        DONE
Storybook catalog           DONE
Local external-consumer     DONE
Publishability               DONE
Changesets/release flow     DONE
External module contract    DONE
Real Web Shell integration  DONE
A11y CI automation           DONE
Visual regression            DONE

Real GitHub Packages publish       READY FOR INITIAL REGISTRY RELEASE
External module reference repo     PENDING (blocked by the above)
```

Detalle completo, con comandos y resultados reales, en
[`design-system-v1-validation.md`](design-system-v1-validation.md).

## Pendientes

Sólo quedan dos puntos, y ambos dependen de lo mismo — una credencial real
que este entorno no tiene, no de trabajo de ingeniería sin hacer:

- **Primer publish real a GitHub Packages**: el pipeline
  (Changesets + `design-system-release.yml`) está completo y se validó de
  punta a punta contra un registry npm real (Verdaccio efímero: publish
  real, install real fuera del workspace, SSR en ambos temas, sin React
  duplicado). Lo único que falta es que este código llegue a `main` con un
  `GITHUB_TOKEN`/PAT con `packages: write` disponible — no hay ningún paso
  manual de `npm publish` pendiente de diseñar, sólo de ejecutar.
- **Repositorio de módulo externo de referencia**: un repo separado de
  este monorepo, consumiendo la versión publicada en GitHub Packages real.
  Bloqueado por el punto anterior — no puede apuntar a una versión que
  todavía no existe en el registry real.

Fuera de esos dos, no hay pendientes de arquitectura, componentes,
boundaries, catálogo, a11y, visual regression o integración: todo eso está
implementado, corrido y con evidencia (ver el reporte de validación).
