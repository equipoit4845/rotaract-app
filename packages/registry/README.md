# @mirotaract/registry

Registro [shadcn](https://ui.shadcn.com/docs/registry) de **Mi Rotaract**:
el tema y los componentes del producto, para que la app de un comité se vea
como parte de Mi Rotaract con `npx shadcn add`.

```bash
npx shadcn@latest add https://developers.rotaract4845.com/r/mirotaract-theme.json
npx shadcn@latest add https://developers.rotaract4845.com/r/data-table.json
```

| Ítem | Qué instala |
| --- | --- |
| `mirotaract-theme` | Variables CSS (claro/oscuro), radios, `success`/`warning`, tipografía. |
| `mirotaract-ui` | Componentes base del producto en `components/mirotaract/ui.tsx` (+ `link.tsx`). |
| `app-shell` | Barra lateral con grupos, barra superior, menú en el celular. |
| `page-header` | `PageHeader`, `Breadcrumbs`, `SectionHeader`. |
| `data-table` | Tabla con barra de herramientas, carga, vacío/error y paginación por cursor. |
| `status-badge` | `StatusBadge` con el catálogo de estados del kernel. |
| `confirm-dialog` | `ConfirmationDialog`. |
| `empty-state` | `DataState`, `StatCard`, `DataToolbar`, `DataPagination`. |

Todo se genera desde el producto (`apps/mirotaract-web`): `node scripts/build.mjs`
lee `globals.css`, los componentes y el catálogo de estados, reescribe los
imports y escribe `dist/r/registry.json` + `dist/r/<ítem>.json`
(`--base-url` para servirlo en otro lado, `--out` para otra carpeta). El
portal de desarrolladores copia `dist/r` y lo sirve en `/r/`.

Guía: [`docs/developers/kit-de-ui.md`](../../docs/developers/kit-de-ui.md).
