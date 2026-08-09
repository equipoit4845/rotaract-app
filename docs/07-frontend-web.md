# Frontend Web

`apps/mirotaract-web` es un consumidor separado del Kernel (Next.js 15, App
Router, React 19). No comparte Prisma ni accede a la base de datos: todo el
acceso a datos pasa por la capa `src/lib/api`, que consume
[`kernel-openapi.yaml`](../kernel-openapi.yaml) directamente. `src/app`
tiene el layout raíz, un shell autenticado (`src/features/shell/`, ver
[`08-design-system.md`](08-design-system.md#componentes)) que valida
sesión, organización activa, período y navegación filtrada sobre
`AdminFrame`, y las pantallas de negocio de la Web administrativa
institucional descritas en
[`09-administrative-web.md`](09-administrative-web.md) — Fase 1
(Dashboard), Fase 2 (Organizaciones), Fase 3 (Personas), Fase 4
(Membresías), Fase 5 (Autoridades / Cargos), Fase 6 (Períodos), Fase 7
(Solicitudes de membresía) y Fase 8 (Transferencias) están cerradas,
incluida la integración cruzada entre Personas y Membresías (ver
"Integración Personas ↔ Membresías" en ese documento) y entre Períodos
y Cargos (ver "Integración Período ↔ Appointment"); el resto sigue el
gate de fases.

### Rutas públicas (Auth / Access)

No pasan por `AuthGate` ni `DashboardShell`/`AdminFrame` — usan
`AuthShell` (`features/auth/components/auth-shell.tsx`), un layout público
sin sidebar/organization switcher. Detalle historia por historia
(AUTH-01…10) en
[`09-administrative-web.md`](09-administrative-web.md#área-transversal--auth--access).

| Ruta | Contenido | Indexable |
| --- | --- | --- |
| `/` | Landing institucional (`features/home/`) si `AuthStatus=UNAUTHENTICATED`; redirige a `/dashboard` si `AUTHENTICATED`; skeleton mínimo mientras `BOOTSTRAPPING` | Sí |
| `/login` | Formulario de acceso (email + password vía BFF), soporta `?next=<ruta interna>` | Sí |
| `/register` | Alta de cuenta pública (`POST /auth/register`, confirmado real en `kernel-openapi.yaml`) — crea `Person`+`UserAccount` sin `Membership`; unirse a un club/distrito sigue requiriendo una `MembershipApplication` (Fase 7) | Sí |
| `/verify-email/[token]` | Confirma el email de una cuenta recién registrada | No |
| `/invite/[token]` | Acepta una invitación existente (`POST /auth/invitations/accept`) y define password — sin preview de organización/persona, ver `BLOCKED_API` en docs/09 | No |
| `/forgot-password` | Solicita recuperación de contraseña; respuesta `202` genérica siempre, nunca confirma si el email existe | Sí |
| `/reset-password/[token]` | Define una nueva contraseña con el token recibido por email | No |

`src/app/robots.ts` (convención `MetadataRoute.Robots` de Next.js)
deshabilita el crawling de `/invite/`, `/reset-password/`,
`/verify-email/` y de todas las rutas administrativas; los tres layouts
token-bearing (`invite/[token]/layout.tsx`,
`reset-password/[token]/layout.tsx`, `verify-email/[token]/layout.tsx`)
agregan además `<meta name="robots" content="noindex">` por página — el
`robots.txt` sólo evita el crawling, el meta tag evita la indexación
aunque alguien comparta el link directo.

### Rutas protegidas

| Ruta | Fase | Contenido |
| --- | --- | --- |
| `/dashboard` | 1 | Panel distrital o de club según el tipo de la organización activa |
| `/organizations` | 2 | Listado de organizaciones (filtros `type`/`status`/`query` en la URL, paginación por cursor) |
| `/organizations/[organizationId]` | 2 | Detalle: resumen, jerarquía (ancestros/hijos), tab "Socios" que enlaza a Membresías, acciones de ciclo de vida |
| `/organizations/[organizationId]/edit` | 2 | Edición de una organización |
| `/persons` | 3 | Listado/búsqueda de personas (filtro `query` en la URL, paginación por cursor) |
| `/persons/[personId]` | 3 | Detalle: Identidad, Membresías (sólo lectura, cada fila linkea a `/memberships/[id]`), Cuenta (`BLOCKED_API`, ver `docs/09-administrative-web.md`), Historial |
| `/persons/[personId]/edit` | 3 | Edición de una persona |
| `/memberships` | 4 | Listado de membresías de una organización (filtros `organization`/`status` en la URL, paginación por cursor real) |
| `/memberships/[membershipId]` | 4 | Detalle: resumen (persona y organización como links a sus propios detalles), historial inmutable de transiciones, acciones de ciclo de vida individuales (activar/licencia/reanudar/desactivar/graduar/reactivar) |
| `/authorities` | 5 | Autoridades vigentes (`useCurrentAuthorities`) de la organización activa |
| `/appointments` | 5 | Listado de cargos (filtros reales en la URL); separa Actuales/Futuras/Históricas a partir del `status` real, sin pseudo-estados inventados |
| `/appointments/[appointmentId]` | 5 | Detalle: persona, cargo, organización, período, estado, acciones de ciclo de vida (nominar/electo/activar/finalizar/revocar), sin optimistic update |
| `/positions` | 5 | Catálogo de `PositionDefinition` |
| `/positions/new` | 5 | Crear cargo distrital |
| `/positions/[positionDefinitionId]` | 5 | Detalle/edición de un cargo, permisos asociados (adjuntar/desadjuntar) — `BLOCKED_API`: no hay endpoint para leer qué permisos tiene adjuntos hoy (ver `docs/09-administrative-web.md`) |
| `/periods` | 6 | Listado de períodos institucionales, scope de organización explícito en la URL (`?organization=`) con fallback a la organización activa del Shell, sin cambiarla nunca |
| `/periods/[periodId]` | 6 | Detalle: organización, fechas, estado, acciones de ciclo de vida (programar/activar/cerrar/cancelar) — cerrar sólo llama la operación real del Kernel, nunca finaliza Appointments manualmente |
| `/applications` | 7 | Listado de solicitudes de ingreso (filtros `organization`/`status` en la URL; `GET /membership-applications` es un array plano del Kernel, sin cursor — no hay paginación) |
| `/applications/[applicationId]` | 7 | Detalle: persona, organización, estado, motivo, acciones de ciclo de vida (enviar/aprobar/rechazar/cancelar) — aprobar ejecuta únicamente `useApproveMembershipApplication()`, nunca crea/reactiva la Membership manualmente |
| `/transfers` | 8 | Listado de transferencias (filtros `membership`/`from`/`to`/`status` en la URL; `GET /membership-transfers` también es un array plano, sin paginación) |
| `/transfers/[transferId]` | 8 | Detalle: timeline del workflow (`TransferWorkflowTimeline`, componente DOMAIN local), acciones gateadas por permiso + scope de organización (aceptar en destino, confirmar/completar en origen) — completar ejecuta únicamente `useCompleteMembershipTransfer()`, nunca muta Membership/Appointment manualmente |

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

### Ciclo de vida de `AuthStatus` y redirects

`useAuthStatus()` (`src/lib/api/client/use-auth-status.ts`) expone tres
estados (`token-manager.ts`):

- **`BOOTSTRAPPING`** — valor inicial de cada proceso de navegador, antes
  de que el refresh silencioso de `session-bootstrap.tsx` resuelva.
  Tanto `AuthGate` (rutas protegidas) como `LoginContainer`/
  `HomeContainer`/`RegisterContainer` renderizan únicamente un spinner en
  este estado — nunca deciden "mostrar login" ni "mostrar landing"
  todavía, para no parpadear entre un estado transitorio y el real.
- **`AUTHENTICATED`** — sesión válida. `AuthGate` renderiza los hijos;
  `/login`, `/register` y `/` redirigen (`router.replace`) en vez de
  mostrar su propio contenido.
- **`UNAUTHENTICATED`** — sin sesión (logout explícito, nunca hubo
  sesión, o un refresh que terminó fallando de verdad —
  `refresh-manager.ts` llama `tokenManager.clearSession()`, que produce
  este mismo estado sea cual sea la causa). `AuthGate` redirige a
  `/login?next=<ruta+query actual, URL-encoded>`; `/` muestra la
  landing pública.

`features/shell/auth-gate.tsx` es el único punto que decide "sesión
requerida → a `/login`". No reemplaza la validación de permisos: un
`403` de un endpoint específico (`KernelApiError.isForbidden`) se
muestra inline vía `describeKernelError()` dentro de la propia pantalla,
nunca dispara este redirect — `401` (sesión) y `403` (autorización) son
señales distintas y nunca comparten manejo (product spec §27).

`resolveSafeNext()` (`features/auth/utils/safe-redirect.ts`) es el
único lugar que lee un `?next=` y decide si es seguro seguirlo: exige
que empiece con `/` (una sola barra — `//evil.com` se rechaza),
rechaza cualquier `\` (WHATWG trata la barra invertida como equivalente
a `/` para esquemas especiales, así que `/\evil.com` normaliza a
`//evil.com` en el navegador — el bypass clásico de un chequeo que sólo
mira `//` literal) y rechaza cualquier cosa con `://`. Cualquier valor
que no pase cae a `/dashboard`. `AuthGate` en cambio *construye* el
`next` a partir de `usePathname()`/`useSearchParams()` (nunca lee un
valor no confiable), así que sólo `LoginContainer` necesita esta
validación.

Logout (`useLogout()`) y logout-all (`useLogoutAllSessions()`) limpian
el token en memoria, la cookie httpOnly (vía la ruta BFF
correspondiente) y todo el `QueryClient` (`queryClient.clear()`), y
navegan a `/` — nunca `window.location.reload()`.

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
ejecutar archivos `.tsx` reales fuera del compilador de Next). 248 tests,
contra los módulos y componentes reales (no regex sobre archivos), en dos
capas (incluye `test/runtime/persons-memberships.integration.test.ts`,
`test/runtime/applications-membership.integration.test.ts` y
`test/runtime/transfers-membership-appointment.integration.test.ts`, las
suites de integración cruzada entre Personas/Membresías/Solicitudes/
Transferencias/Autoridades — ver "Integración Personas ↔ Membresías" en
[`09-administrative-web.md`](09-administrative-web.md); y siete suites de
Auth/Home —`auth-login`, `auth-register`, `auth-invitation`,
`auth-password-reset`, `auth-logout`, `home`,
`protected-routes.runtime.test.ts` — ver "Área transversal — Auth /
Access" en ese mismo documento):

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

`test/runtime/render.ts` también expone `renderWithRouter()` (contextos
`AppRouterContext`/`SearchParamsContext`/`PathnameContext` de
`next/dist/shared/lib/*.shared-runtime` — no hay router real bajo
`node --test`) para pantallas que usan `useRouter()`/`useSearchParams()`;
su `push`/`replace` mock actualiza de verdad el `SearchParamsContext`, así
que un componente que lee filtros de la URL ve el cambio en el mismo
render — correcto para filtros/paginación, pero
`protected-routes.runtime.test.ts` necesita su propio helper local
inerte (`replace` que sólo registra la llamada) para probar el redirect
de `AuthGate`: ese efecto deriva el destino de `pathname`/`searchParams`
y a la vez llama `replace`, así que con el `replace` "real" del mock
cada redirect vuelve a disparar el efecto con un `next=` cada vez más
largo (bucle infinito hasta agotar memoria) — algo que nunca pasa en
Next.js real porque navegar a `/login` desmonta la página que `AuthGate`
protegía. `test/runtime/bootstrap.ts` fue extendido con varios globals de
jsdom (`self`, `MutationObserver`, `Event`/`CustomEvent`, `NodeFilter`,
`HTMLInputElement` y afines) que Radix UI (`Dialog`, `Tabs`) y
`next/link` necesitan y que Node no expone — sin ellos, componentes que
renderizan un Dialog abierto o un `<Link>` fallan con `ReferenceError`s
crípticos ajenos al código de la feature bajo test. También hay que
importar `./bootstrap.ts` antes que `@testing-library/react` en cualquier
archivo de test que importe ese paquete directamente (no sólo a través de
`render.ts`) — si se invierte el orden, react-dom carga sin
`document`/`window` y los `onChange` de formularios controlados quedan
mudos sin ningún error visible.

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
