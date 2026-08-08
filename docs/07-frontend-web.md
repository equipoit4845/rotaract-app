# Frontend Web

`apps/mirotaract-web` es un consumidor separado del Kernel (Next.js 15, App
Router, React 19). No comparte Prisma ni accede a la base de datos: todo el
acceso a datos pasa por la capa `src/lib/api`, que consume
[`kernel-openapi.yaml`](../kernel-openapi.yaml) directamente. Todavía no
existen pantallas de negocio (miembros, cargos, períodos, solicitudes,
transferencias) — `src/app` tiene el layout raíz, la home de scaffolding,
y un primer shell autenticado (`/dashboard`, ver
[`08-design-system.md`](08-design-system.md#componentes) y
`src/features/shell/`) que valida sesión, organización activa, período y
navegación filtrada sobre `AdminFrame`, sin contenido de negocio todavía.
Esta capa está lista para que los componentes `.tsx` de negocio la
consuman a medida que se construyan.

## Arquitectura de capas

```
Componentes .tsx (a construir)
        ↓
Hooks de dominio (TanStack Query)      src/lib/api/<dominio>/*.hooks.ts
        ↓
Servicios de dominio (fetch tipado)    src/lib/api/<dominio>/*.api.ts
        ↓
apiClient (auth, errores, retry)       src/lib/api/client/http-client.ts
        ↓
Institutional Kernel API
```

Los componentes sólo deben importar desde el barrel público
`src/lib/api/index.ts`. Nunca deben importar `client/*`, un `*.api.ts` de
dominio, ni `schema.ts` directamente — eso mantiene la implementación HTTP
reemplazable sin tocar UI.

## Tipos generados

`src/lib/api/client/schema.ts` se genera con `openapi-typescript` a partir de
`kernel-openapi.yaml`:

```bash
pnpm --filter @mirotaract/mirotaract-web api:types
```

Los tipos de cada dominio (`*.types.ts`) derivan de `components["schemas"]`;
no hay DTOs escritos a mano que dupliquen un schema existente. El archivo
generado está excluido de Prettier (`apps/mirotaract-web/.prettierignore`)
para que la regeneración sea reproducible byte a byte — antes de eso, un
`prettier --write` amplio reformateaba el archivo generado y rompía esa
garantía (ver [`kernel-api-consumption-validation.md`](kernel-api-consumption-validation.md)).

## Cliente HTTP (`src/lib/api/client`)

| Archivo | Responsabilidad |
| --- | --- |
| `http-client.ts` | Cliente `openapi-fetch` + `apiRequest()`: adjunta el access token, agrega `Idempotency-Key`/`X-Correlation-Id` a mutaciones, reintenta una sola vez ante 401 tras un refresh exitoso, normaliza cualquier error (HTTP o de red) a `KernelApiError`. |
| `api-error.ts` | `KernelApiError`: normaliza el Problem Details del Kernel (`type`, `title`, `status`, `code`, `detail`, `instance`, `traceId`) y expone helpers (`isInvalidTransition`, `isForbidden`, `isNotFound`) basados en `code`, no en texto humano. |
| `token-manager.ts` | Access token únicamente en memoria (vida útil 10 min, kernel-openapi.yaml `bearerAuth`). Expone un `epoch` que se incrementa en cada `setSession`/`clearSession`, usado para descartar un refresh en vuelo que quedó obsoleto (p. ej. por un logout concurrente). |
| `refresh-manager.ts` | Refresh *single-flight*: llamadas concurrentes que reciben 401 esperan el mismo `POST /api/auth/refresh` en lugar de disparar refreshes en paralelo. |
| `session-cookie.server.ts` | Server-only (`import "server-only"`). Define la cookie httpOnly que guarda el refresh token. |
| `use-is-authenticated.ts` | Hook (`useSyncExternalStore`) para reaccionar a cambios de sesión sin acoplar componentes a `token-manager`. |

### Reintento sin perder idempotencia

El reintento ante 401 no reconstruye la request (eso generaría un
`Idempotency-Key`/`X-Correlation-Id` nuevo y rompería la idempotencia). En su
lugar, `onRequest` clona la request ya encabezada antes de que se consuma el
body, y `onResponse` reintenta con `fetch()` directo sobre ese clon —
evitando además el pipeline de middleware, por lo que un segundo 401 nunca
dispara otro reintento.

## Autenticación (BFF)

El refresh token nunca llega al navegador. `POST /auth/login`,
`POST /auth/refresh`, `POST /auth/logout` y `POST /auth/logout-all` se
resuelven mediante Route Handlers server-only en
`src/app/api/auth/{login,refresh,logout,logout-all}/route.ts`, que:

1. reciben la respuesta del Kernel con `AuthTokens` (`accessToken`,
   `refreshToken`, `expiresIn`);
2. guardan `refreshToken` en una cookie `httpOnly`, `secure` (producción),
   `sameSite: strict`, con `path: /api/auth`;
3. devuelven al navegador sólo `accessToken`/`expiresIn`.

El resto de las 103 operaciones no relacionadas con sesión se llaman
directamente al Kernel vía `httpClient` — no se duplica el resto del
contrato en el BFF.

`src/lib/api/auth/session-bootstrap.tsx`, montado una vez en
`app/providers/query-provider.tsx`, dispara un refresh silencioso al montar
la app: como el access token vive sólo en memoria, sin este paso cada
recarga de página aparecería como sesión cerrada aunque la cookie de refresh
siguiera vigente.

## Dominios

Cada dominio en `src/lib/api/<dominio>/` sigue el mismo patrón:
`*.types.ts` (tipos derivados de OpenAPI), `*.keys.ts` (factory de query
keys jerárquica), `*.api.ts` (llamadas HTTP tipadas) y `*.hooks.ts` (queries
y mutations de TanStack Query, marcados `"use client"`).

| Dominio | Cubre |
| --- | --- |
| `auth` | Registro, login/logout/refresh (vía BFF), cuenta propia, sesiones, administración de cuentas |
| `persons` | Personas e invitaciones |
| `organizations` | CRUD, ciclo de vida, árbol jerárquico (`children`/`ancestors`/`descendants`), `useActiveOrganization` |
| `memberships` | Ciclo de vida completo de membresía (activar, licencia, reanudar, desactivar, graduar, reactivar) |
| `periods` | Períodos institucionales y transiciones |
| `positions` | Definiciones de cargo y permisos asociados |
| `appointments` | Cargos ocupados y autoridades vigentes (`useCurrentAuthorities` es la única fuente de "quién es presidente" — no hay flags `isPresident`) |
| `authorization` | Permisos, roles, asignaciones, `useCan()` |
| `applications` | Solicitudes de ingreso |
| `transfers` | Transferencias de membresía entre organizaciones |
| `modules` | Catálogo e instalación de módulos externos |

Cobertura verificada: **107/107** operaciones browser-facing implementadas,
**0** operaciones `x-service-only` referenciadas fuera de `schema.ts` (que
sólo aporta tipos, sin código en runtime). El detalle operación por
operación está en
[`kernel-api-consumption-validation.md`](kernel-api-consumption-validation.md).

## TanStack Query

- Un único `QueryClient` por sesión de navegador (`app/providers/query-provider.tsx`,
  creado con `useState(() => new QueryClient(...))`, nunca recreado por render).
- Reintento acotado a 2 intentos adicionales, y sólo para errores de red
  (`status 0`) o `5xx`; los errores institucionales (401 ya resuelto,
  403, 404, 409, `KERNEL_INVALID_TRANSITION`, etc.) no se reintentan.
- `useCan(permission, scope)` no hace una request por botón: se apoya en
  `useEffectivePermissions`, cacheada por `(personId, organizationId,
  periodId)`, que TanStack deduplica automáticamente entre todos los
  `useCan()` de una misma pantalla.
- Las mutations invalidan sólo las queries que afectan, nunca
  `invalidateQueries()` global (la única excepción intencional es
  `useLogout`, que limpia todo el cache por ser un cambio de sesión). Las
  transiciones de cargo, período, membresía, aprobación de solicitud y
  transferencia también invalidan `authorizationKeys.allEffectivePermissions()`
  cuando pueden alterar permisos efectivos (rol derivado de un cargo, cierre
  de período, cambio de estado de membresía, etc.).
- Listados paginados por cursor (`persons`, `organizations`) usan
  `useInfiniteQuery` con `initialPageParam`/`getNextPageParam`; un cambio de
  filtros produce una `queryKey` distinta, así que el cursor se reinicia
  solo.

## Testing

```bash
pnpm --filter @mirotaract/mirotaract-web test
```

Corre con `tsx --tsconfig test/tsconfig.json --test --test-force-exit` (no
`node --test`: el loader nativo de Node no resuelve imports relativos sin
extensión de TypeScript ni con `--experimental-strip-types`; el tsconfig
propio de `test/` sólo sobreescribe `jsx: "react-jsx"` para que `tsx` pueda
ejecutar archivos `.tsx` reales fuera del compilador de Next). 39 tests,
contra los módulos y componentes reales (no regex sobre archivos), en dos
capas:

**Módulo (`test/*.test.mjs`)** — llaman directamente a `token-manager`,
`refresh-manager`, `http-client`, sin React:

- refresh *single-flight*, reintento único, preservación de
  `Idempotency-Key`/`X-Correlation-Id` en el reintento, normalización de
  errores de red (`test/http-client.retry.test.mjs`);
- una carrera logout-vs-refresh-en-vuelo (`test/session-race.test.mjs`);
- normalización de Problem Details (`test/api-error.test.mjs`);
- que el refresh token nunca se referencia fuera del código server-only
  (`test/token-isolation.test.mjs`);
- que ningún path `/service/*` ni operationId `x-service-only` aparece fuera
  del schema generado (`test/service-only-exclusion.test.mjs`);
- determinismo y jerarquía de las query key factories
  (`test/query-keys.test.mjs`).

**Runtime (`test/runtime/*.runtime.test.ts`)** — renderizan los hooks de
verdad con `@testing-library/react` + `jsdom` contra un backend mock con
estado (rota tokens, rechaza bearer tokens vencidos como el Kernel real):
bootstrap de sesión, concurrencia de refresh (10 queries → 1 refresh),
carrera logout/refresh a través de `useLogout()`, invalidación de permisos
efectivos tras activar/finalizar un cargo, desactivar una membresía,
completar una transferencia o cerrar un período, aislamiento de cache entre
usuarios, errores de dominio (409), paginación por cursor, y una pantalla
de humo que sólo importa del barrel público `@/lib/api`. Detalle completo en
[`kernel-api-runtime-validation.md`](kernel-api-runtime-validation.md).

## Estado y pendientes

Dos auditorías completas de esta capa viven en `docs/`:
[estructural](kernel-api-consumption-validation.md) (cobertura OpenAPI línea
por línea, aislamiento de `x-service-only`, seguridad de tokens,
condiciones de carrera, invalidación de cache) y
[runtime](kernel-api-runtime-validation.md) (los mismos escenarios,
ejercitados con render real de hooks/componentes). Pendiente conocido: no
hay timeout de request por defecto (depende de una decisión de producto
sobre la duración); la invalidación de permisos efectivos es amplia por
dominio en vez de estar acotada a la persona afectada (trade-off
documentado, no es un bug).

No se deben integrar componentes directamente a `fetch`/Axios/el cliente
OpenAPI generado: siempre a través de los hooks públicos de
`src/lib/api/index.ts`.
