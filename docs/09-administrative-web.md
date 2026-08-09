# Web administrativa institucional

Matriz de historias de usuario para la Web administrativa real de
`apps/mirotaract-web`, requerida antes de construir cualquier pantalla.
Cubre las siete áreas funcionales objetivo más el Dashboard (fase 1).

## Orden de autoridad

```text
kernel-spec.md          — fuente normativa (§§1–10, §17, §21 leídas en full)
    ↓
kernel-openapi.yaml     — contrato HTTP; verificado vía el tipo generado
                          apps/mirotaract-web/src/lib/api/client/schema.ts,
                          que ES ese contrato compilado a TypeScript
    ↓
@/lib/api (capa pública) — único punto de entrada permitido para features
    ↓
frontend (features/*)
```

Si UI, OpenAPI y `kernel-spec.md` divergen para una historia: esa
capacidad se detiene, se marca `BLOCKED_CONTRACT` en la columna Status, y
la divergencia se documenta en la sección de esa historia — nunca se
implementa un workaround de negocio en el frontend para disimularla.

## Formato de cada historia

Un bloque por historia, no una tabla de 15 columnas (ilegible en
Markdown real). Cada bloque cubre, en orden: ruta, actor, scope,
permiso, hook público, operationId, request, response, criterio
CA-\*/regla del Kernel, estados UI, errores visibles, si es mutation,
qué queries invalida, y status.

**Estados posibles**: `NOT_STARTED`, `READY`, `IN_PROGRESS`, `DONE`,
`BLOCKED_CONTRACT`, `BLOCKED_API`.

## Restricciones que aplican a las 59 historias sin excepción

Ver `docs/07-frontend-web.md` y `docs/08-design-system.md` para el
detalle; resumen operativo:

- Hooks y tipos sólo desde `@/lib/api` — nunca `client/*`, `*.api.ts` ni
  `schema.ts` importados por una feature o componente.
- UI sólo desde `@equipoit4845/design-tokens`, `/icons`, `/ui`,
  `/admin-shell`.
- `Appointment` es la única fuente de autoridad — nunca
  `Membership.title`, `isPresident` ni strings de cargo.
- Todo error es `KernelApiError` (`.status`, `.code`, `.isForbidden`,
  `.isNotFound`, `.isAuthError`, `.isInvalidTransition`) — nunca
  `error.response.data`.
- Mutaciones sensibles (listadas en cada historia) no usan optimistic
  update: se espera la confirmación del Kernel.
- `activeOrganizationId` (contexto global del Shell) ≠ `organizationId`
  de una ruta de detalle — abrir un detalle no cambia la organización
  activa.

---

## Área 0 — Dashboard (Fase 1)

### US-DASH-01 — Panel distrital

Ruta `/dashboard` (scope `DISTRICT`) · Actor: persona con membresía
activa y sesión válida cuya `activeOrganizationId` resuelve a una
organización `type=DISTRICT` · Permiso: ninguno explícito para ver el
panel (lectura ya cubierta por pertenecer a la organización activa vía
`useActiveOrganization`); cada acción específica dentro del panel se
gatea con su propio permiso · Hooks: `useActiveOrganization`,
`useCurrentPeriod`, `useOrganizationChildren`, `useCurrentAuthorities`,
`usePositionDefinitions` · Operations: `getOrganization`,
`getCurrentPeriod`, `listOrganizationChildren`,
`getCurrentAuthorities`, `listPositionDefinitions` · Requests: `GET
/organizations/{id}`, `GET /organizations/{id}/periods/current`, `GET
/organizations/{id}/children`, `GET
/organizations/{id}/authorities/current`, `GET /position-definitions` ·
Responses: `Organization`, `InstitutionalPeriod`, `Organization[]`,
`Appointment[]`, `PositionDefinition[]` · Regla: invariantes 6.3
(jerarquía), 6.6 (cargos — `Appointment` como única fuente), §18 del
producto (anti-N+1: cada dato viene de un único request acotado, nunca
`list clubs → GET members/appointments per club`) · Estados: loading
(Skeleton), empty (sin clubes hijos), error (`DataState` con mensaje),
forbidden (no aplica a nivel panel — no hay permiso de lectura propio),
success · Errores visibles: red/5xx → "No se pudo cargar la
información del distrito" · Mutation: no · Queries afectadas: n/a ·
**Status: DONE**

Nombres de personas en la tabla de autoridades distritales se resuelven
con un número acotado de requests (bounded por la cantidad de cargos
distritales vigentes, típicamente < 15 — nunca por la cantidad de
clubes del distrito). Ver `QUERY_PROJECTION_CANDIDATE` más abajo para lo
que quedó deliberadamente fuera de esta fase.

### US-DASH-02 — Panel de club

Ruta `/dashboard` (scope `CLUB`) · Actor: persona con membresía activa
cuya `activeOrganizationId` resuelve a `type=CLUB` · Permiso: igual a
US-DASH-01 · Hooks: `useActiveOrganization`, `useCurrentPeriod`,
`useOrganizationMemberships`, `useCurrentAuthorities`,
`usePositionDefinitions`, `useMembershipApplications`,
`useMembershipTransfers` · Operations: `getOrganization`,
`getCurrentPeriod`, `listOrganizationMemberships`,
`getCurrentAuthorities`, `listPositionDefinitions`,
`listMembershipApplications`, `listMembershipTransfers` · Requests: `GET
/organizations/{id}`, `GET /organizations/{id}/periods/current`, `GET
/organizations/{id}/memberships?status=ACTIVE&limit=100`, `GET
/organizations/{id}/authorities/current`, `GET /position-definitions`,
`GET /membership-applications?organizationId={id}&status=SUBMITTED`,
`GET /membership-transfers?fromOrganizationId={id}&status=REQUESTED`,
`GET /membership-transfers?toOrganizationId={id}&status=REQUESTED` ·
Responses: `Organization`, `InstitutionalPeriod`, `MembershipPage`,
`Appointment[]`, `PositionDefinition[]`, `MembershipApplication[]`,
`MembershipTransfer[]` (× 2, unidas y deduplicadas) · Regla: igual a
US-DASH-01 + invariante 6.8.1 (una solicitud abierta por persona/org),
6.9.3 (una transferencia abierta por membresía) · Estados: igual a
US-DASH-01 · Errores visibles: igual a US-DASH-01 · Mutation: no ·
Queries afectadas: n/a · **Status: DONE**

`Membresías activas` es un conteo **acotado, no exacto**: un único
request con `limit=100`; si `pageInfo.hasMore` es `true` se muestra
`100+` en vez de fabricar una segunda página. Documentado en el
componente, no oculto.

### Verificación de cierre — Fase 1 (Dashboard)

Ejecutado el 2026-08-08 sobre `apps/mirotaract-web`:

- `pnpm typecheck` (`tsc --noEmit`) — verde.
- `pnpm lint` (`prettier --check src`) — verde.
- `pnpm test` (`tsx --test`, suite completa) — **43/43** tests verdes,
  incluye `test/runtime/dashboard.runtime.test.ts` (4 tests nuevos:
  `ClubDashboard` success/empty/forbidden, `DistrictDashboard` success)
  contra un `MockBackend` que simula Kernel + BFF, cubriendo: resolución
  acotada de nombre de autoridad (membership→person), estado vacío
  (`DataState` "Sin autoridades vigentes"), 403 → mensaje institucional
  (nunca "Error 403"), y que el panel distrital nunca hace un GET por
  club (asserted explícitamente sobre `backend.kernelCalls`).
- `node scripts/validate-design-system-boundaries.mjs` — verde (4
  paquetes).
- `pnpm build` (`next build`, producción) — verde; ruta `/dashboard`
  compila a 42.6 kB (150 kB First Load JS).
- Auditoría §42 (grep global): sin ocurrencias de `axios`, `@prisma`,
  `kernel-sdk`, `/service/*`, `Membership.title`, `next/navigation`
  dentro de `@equipoit4845/*`, ni imports de `*.api.ts`/`client/*` desde
  `src/features`. El único `fetch(` vive en la capa BFF sancionada
  (`src/lib/api/auth/auth.api.ts`). La única mención de `isPresident`
  fuera del schema generado es un comentario que documenta la regla, no
  un uso real.

Fase 1 (Dashboard) queda **DONE y verde**. Por regla de gate (§39 del
producto), recién ahora se habilita el trabajo sobre Fase 2
(Organizaciones) — no antes.

---

## `QUERY_PROJECTION_CANDIDATE` (dashboard)

Métricas evaluadas y **no implementadas** en esta fase porque no existe
un endpoint/list query que las resuelva con un número acotado de
requests:

- **Solicitudes/transferencias pendientes a nivel distrital,
  agregadas across todos los clubes descendientes.** `ApplicationFilters`
  y `TransferFilters` sólo aceptan un `organizationId` exacto, no un
  árbol. Calcularlo hoy exigiría un request por club descendiente
  (`list clubs → GET applications per club` — exactamente el patrón
  prohibido). Candidato futuro: un endpoint tipo
  `district_summary`/`institutional_dashboard` que agregue del lado del
  Kernel.
- **Total exacto de miembros de un club** (no acotado a una página):
  `MembershipPage` no expone un `total`, sólo `items` + `pageInfo`. Se
  usa una aproximación acotada (`100+`) en vez de paginar hasta el final.

---

## Área 1 — Organizaciones (Fase 2)

Revisión previa a código (2026-08-08): las 8 historias tienen regla de
Kernel clara, `operationId` existente, hook público existente en
`@/lib/api/organizations/*`, permiso identificado y DTO disponible en
`schema.ts`. Ninguna diverge del contrato. Todas pasan a `READY`.

Dos precisiones encontradas en esta revisión (no son `BLOCKED_*`, son
lecturas más precisas del contrato real):

- **No existe `kernel.organization.deactivate`.** `kernel-spec.md`
  §10.1 sólo define `kernel.organization.activate`.
  `kernel-openapi.yaml` (`/organizations/{id}/deactivate`) ya lo
  documenta explícitamente como una decisión asumida: "`kernel-spec.md`
  §10.1 no define un permiso distinto para desactivar; se asume que
  reutiliza `kernel.organization.activate`". US-ORG-06 usa ese mismo
  permiso para ambas acciones — no es una invención de esta fase, ya
  estaba resuelto en el contrato.
- **La máquina de estados (§7.2) no permite `ACTIVE → ARCHIVED`
  directo.** Transiciones válidas: `DRAFT→ACTIVE`, `ACTIVE→INACTIVE`,
  `INACTIVE→ACTIVE`, `DRAFT→ARCHIVED`, `INACTIVE→ARCHIVED`. La acción
  "Archivar" del detalle sólo se ofrece cuando `status` es `DRAFT` o
  `INACTIVE`; una organización `ACTIVE` debe desactivarse primero. El
  Kernel es quien re-valida esto en cualquier caso (409
  `KERNEL_INVALID_TRANSITION` si se intenta igual).

### US-ORG-01 — Listar organizaciones

Ruta `/organizations` · Actor con `kernel.organization.read` ·
Hook `useOrganizations(filters)` (infinite, cursor) · Operation
`listOrganizations` → `GET /organizations` · Request query `type,
status, parentId, query, cursor, limit` · Response `OrganizationPage` ·
Regla: invariante 6.3.1 (`code`/`slug` únicos) · Estados: loading,
empty, error, forbidden, success · Errores: 403 → mensaje
institucional · Mutation: no · Filtros en URL search params (§13) ·
**Status: DONE**

### US-ORG-02 — Detalle de organización (resumen)

Ruta `/organizations/[organizationId]` · Actor con
`kernel.organization.read` en el scope de esa organización (no
necesariamente la activa) · Hook `useOrganization(organizationId)` ·
Operation `getOrganization` → `GET /organizations/{id}` · Response
`Organization` · Estados: loading/not-found/forbidden/success ·
**Status: DONE**

### US-ORG-03 — Jerarquía (children/ancestors/descendants)

Misma ruta, tab "Jerarquía" · Hooks `useOrganizationChildren`,
`useOrganizationAncestors` · Operations
`listOrganizationChildren`/`Ancestors` · Cada tab consulta sólo cuando
está activo (§21 del producto) · `useOrganizationDescendants` queda
disponible en `@/lib/api` pero no se invoca desde esta UI: el tab
"Jerarquía" resuelve ancestros (para el breadcrumb, reutilizados sin
segunda request) + hijos directos, que ya cubre el criterio real "poder
entender District → Clubs" sin agregar una request sin consumidor ·
**Status: DONE**

### US-ORG-04 — Crear organización

Dialog desde `/organizations` · Actor con `kernel.organization.create`
· Hook `useCreateOrganization()` · Operation `createOrganization` →
`POST /organizations` · Request `CreateOrganizationRequest` · Response
`Organization` · Regla: 6.3.3 (`CLUB` requiere ancestro `DISTRICT`) ·
Errores: la operación en `kernel-openapi.yaml` sólo documenta `201`
explícitamente, sin catálogo de error por operación — se normalizan
igual por status HTTP genérico (RFC 9457): 409 → código/slug duplicado,
422 → jerarquía/datos inválidos, 403 → sin permiso · Mutation: sí, sin
optimistic update · Invalida `organizationKeys.lists()` · **Status:
DONE**

### US-ORG-05 — Editar organización

Ruta `/organizations/[organizationId]/edit` · Actor con
`kernel.organization.update` en esa organización · Hook
`useUpdateOrganization()` · Operation `updateOrganization` → `PATCH
/organizations/{id}` · Campos aceptados por `UpdateOrganizationRequest`:
`name`, `countryCode`, `region`, `city`, `timezone`, `contactEmail`,
`contactPhone`, `logoUrl`, `description`, `attributes` —
`type`/`code`/`slug`/`parentId` no son parte de este DTO y no se
ofrecen en el formulario (`parentId` cambia sólo vía `move`). El
formulario expone `name`, `countryCode`, `region`, `city`,
`contactEmail`, `contactPhone`, `description`; `timezone`/`logoUrl` no
tienen UI dedicada todavía (no hay input de zona horaria ni de subida
de logo en esta fase) y `attributes` es JSON de forma libre sin UI
definida — ninguno se pierde: al no incluirse en el `payload`, el
`PATCH` simplemente no los toca · Mutation: sí · Invalida detail +
lists · **Status: DONE**

### US-ORG-06 — Activar / Desactivar organización

Dialog de confirmación en el detalle · Actor con
`kernel.organization.activate` (mismo permiso para ambas acciones, ver
nota arriba) · Hooks `useActivateOrganization()`,
`useDeactivateOrganization()` · Operations `activateOrganization`,
`deactivateOrganization` · Regla: invariante 6.3.4 (sólo `ACTIVE` acepta
membresías/períodos/módulos nuevos); máquina de estados §7.2 (ver nota
arriba) · Mutation: sí, sin optimistic update · **Status: DONE**

### US-ORG-07 — Archivar organización

Dialog de confirmación, acción destructiva-a-nivel-visual (no elimina
físicamente) · Actor con `kernel.organization.archive` · Hook
`useArchiveOrganization()` · Operation `archiveOrganization` · Regla:
invariante 6.3.5 (con historial no se elimina, se archiva); `ARCHIVED`
es terminal y sólo alcanzable desde `DRAFT`/`INACTIVE` (§7.2, ver nota
arriba) · **Status: DONE**

### US-ORG-08 — Mover organización (cambiar padre)

Dialog desde el detalle · Actor con `kernel.organization.move` · Hook
`useMoveOrganization()` · Operation `moveOrganization` · Regla: 6.3.6
(no generar ciclos) · Errores: `kernel-openapi.yaml` documenta un `409`
explícito en este endpoint específico para el ciclo jerárquico
(CA-ORG-03), sin `code` estable enumerado — el frontend distingue este
caso por status+endpoint (no por `code`, que no existe todavía), nunca
detectando ciclos por sí mismo · **Status: DONE**

### Verificación de cierre — Fase 2 (Organizaciones)

Ejecutado el 2026-08-08 sobre `apps/mirotaract-web`:

- `pnpm typecheck` (`tsc --noEmit`) — verde.
- `pnpm lint` (`prettier --check src`) — verde.
- `pnpm test` (`tsx --test`, suite completa) — **62/62** tests verdes
  (43 de fases previas + 19 nuevos en
  `test/runtime/organizations.runtime.test.ts`): listado
  (loading/empty/success/403/filtro de tipo/paginación cursor
  ida-y-vuelta/anti-N+1), detalle (success/404/403/tab Jerarquía bajo
  demanda/independencia de `ActiveOrganizationContext`), crear
  (success/409/422), editar (success), y ciclo de vida
  (activar/desactivar/archivar/mover, incluyendo el 409 de ciclo en
  `move` y un 409 `KERNEL_INVALID_TRANSITION` en `archive` que no
  aplica cambios locales).
- `node scripts/validate-design-system-boundaries.mjs` — verde.
- `pnpm build` (`next build`, producción) — verde; `/organizations`
  6.54 kB, `/organizations/[organizationId]` 7.58 kB,
  `/organizations/[organizationId]/edit` 2.38 kB.
- `pnpm contracts:validate` (raíz del repo: OpenAPI, eventos, cobertura
  HTTP, boundaries del Design System) — verde.
- Auditoría de arquitectura sobre `src/features/organizations` (grep):
  0 ocurrencias de `fetch(`, `axios`, imports de `*.api`/`client/`/
  `schema`, `@prisma`, `kernel-sdk`, `/service/`, `isPresident`,
  `Membership.title`. Re-verificado también a nivel de todo `src/`: los
  únicos resultados son las excepciones ya sancionadas en la Fase 1
  (BFF `fetch` en `src/lib/api/auth/auth.api.ts`, las rutas BFF y
  `query-provider.tsx` importando `client/*` directamente).

**Hallazgos de infraestructura de testing** (no son bugs de la
feature, son gaps del arnés de tests que esta fase fue la primera en
exponer — documentados en detalle en
[`07-frontend-web.md`](07-frontend-web.md#testing)):

- `test/runtime/bootstrap.ts` no exponía varios globals de jsdom que
  Radix UI (`Dialog`, `Tabs`) y `next/link` necesitan (`self`,
  `MutationObserver`, `Event`/`CustomEvent`, `NodeFilter`,
  `HTMLInputElement` y otros `HTMLXxxElement`) — se agregaron, son
  aditivos y no afectan ningún test previo (los 43 tests de fases
  anteriores siguen verdes).
- `@testing-library/react`/react-dom deben cargarse **después** de
  `bootstrap.ts` — si un archivo de test importa
  `@testing-library/react` directamente antes que `./render.ts` (que
  internamente importa `bootstrap.ts`), react-dom configura su sistema
  de eventos sintéticos sin `document`/`window` reales, y los
  `onChange` de inputs controlados dejan de dispararse sin ningún
  error visible. `organizations.runtime.test.ts` ahora importa
  `./bootstrap.ts` explícitamente primero.
- `@testing-library/react`'s auto-cleanup no se registra bajo
  `node:test` (sólo detecta globals de Jest/Vitest) — sin un
  `afterEach(cleanup)` explícito, el DOM de un test queda montado para
  el siguiente dentro del mismo archivo, y una query por un label que
  se repite entre componentes (p. ej. "Filtrar por tipo") encuentra
  múltiples coincidencias. Agregado en
  `organizations.runtime.test.ts`.
- `test/runtime/render.ts` ganó `renderWithRouter()`: monta los
  contextos reales de App Router (`next/dist/shared/lib/*.shared-runtime`)
  con un router mock cuyo `push`/`replace` actualiza de verdad
  `SearchParamsContext` — necesario para probar cualquier pantalla que
  lea filtros de la URL, no sólo Organizaciones.

**`QUERY_PROJECTION_CANDIDATE` (Organizaciones):**

- **Nombre de la organización padre en el listado.** `Organization`/
  `OrganizationSummary` sólo exponen `parentId`, no un nombre
  denormalizado, y no existe un endpoint de resolución batch
  (`GET /organizations?ids=...`). `OrganizationParentCell` resuelve
  esto con un request por `parentId` **distinto** en la página
  actual (acotado por el `limit` de paginación, nunca por el total de
  organizaciones — mismo patrón que `AuthorityRow` de la Fase 1), y
  TanStack Query dedupe automáticamente cuando varias filas comparten
  el mismo padre (verificado explícitamente en el test anti-N+1). En
  el caso patológico de una página donde cada fila tiene un padre
  distinto, esto sí emite un request por fila — acotado por `limit`,
  no por el dataset completo, pero no es gratis. Candidato futuro: que
  `OrganizationPage`/`OrganizationSummary` incluya `parentName`
  denormalizado, o un endpoint de resolución batch por ids.
- **Mensajes de error de organización no cubiertos por caso especial**
  (404 en `create`/`update`, 5xx en cualquier mutation) reutilizan
  `describeKernelError` genérico de la Fase 1 en vez de un mensaje
  específico del dominio — no hace falta un endpoint nuevo, sólo
  quedó documentado por si una fase futura decide especializarlos.

Fase 2 (Organizaciones) queda **DONE y verde**. Por regla de gate
(§39 del producto), recién ahora se habilita el trabajo sobre Fase 3
(Personas) — no antes.

---

## Área 2 — Personas (Fase 3)

Revisión previa a código (2026-08-08): las 6 historias tienen regla de
Kernel clara, `operationId` real, hook público real en
`@/lib/api/persons/*` (y `usePersonMemberships` desde
`@/lib/api/memberships/*` — capa de consumo pública, distinta de
`features/memberships/**`, que este track no toca), permiso real y DTO
real en `schema.ts`. Ninguna diverge del contrato. Las 6 pasan a
`READY`.

Precisiones encontradas en esta revisión (no son `BLOCKED_*`):

- **Acceso propio ("self") está explícitamente en el contrato, no es
  una política inventada.** `kernel-openapi.yaml` documenta,
  literalmente: `getPerson` — "Requiere `kernel.person.read`, o
  `kernel.person.read.self` si `personId` corresponde a la persona
  vinculada a la cuenta autenticada"; `updatePerson` — "Requiere
  `kernel.person.manage`, o `kernel.person.update.self` sobre la
  propia persona"; `listPersonMemberships` — mismo patrón con
  `kernel.membership.read`. Los cuatro permisos
  (`kernel.person.read`, `kernel.person.read.self`,
  `kernel.person.manage`, `kernel.person.update.self`) están en
  `kernel-spec.md` §10.1. `createPerson`/`archivePerson`/
  `invitePersonToCreateAccount` sólo aceptan `kernel.person.manage`,
  sin variante self.
- **No existe una vista de `Person` reducida para el navegador.**
  `GET /persons` y `GET /persons/{id}` devuelven siempre el DTO
  `Person` completo (incluye `primaryEmail`, `phone`, `birthDate`);
  `PersonSummary` (sin email) está documentado explícitamente como
  "vista mínima... para consumo entre servicios" (`/service/*`), no
  para estas rutas. El contrato no define un permiso de campo
  separado (no existe `kernel.person.read.sensitive` ni similar) — la
  minimización real ocurre en el gate de acceso al recurso completo
  (`kernel.person.read`/`.self`), no campo por campo dentro de una
  respuesta ya autorizada. La UI **no inventa** una máscara de campos
  adicional sobre una respuesta 200 ya autorizada por el Kernel; sí
  clasifica visualmente los campos en `basic` (nombre, avatar),
  `institucional` (referencia externa, metadata — sin UI dedicada,
  ver US-PER-03/04) y `sensible` (email, teléfono, fecha de
  nacimiento, agrupados aparte en el detalle) para que la sensibilidad
  quede clara sin fingir un control de acceso que el contrato no
  define.
- **No existe un endpoint de historial de Person** (a diferencia de
  Membership, que sí tiene `GET /memberships/{id}/history`). El tab
  "Historial" del detalle se acota a los timestamps que el propio DTO
  `Person` ya expone (`createdAt`/`updatedAt`/`archivedAt`), no a un
  log de auditoría — no hay una fuente real para más que eso.
- **`invitePersonToCreateAccount` exige `membershipId`, no sólo
  `personId`.** La acción de invitar sólo tiene sentido si la persona
  ya tiene al menos una membresía; la UI debe resolver/seleccionar una
  antes de habilitar el botón (§21 del producto: guiar/deshabilitar en
  frontend, el Kernel valida en definitiva).
- **`BLOCKED_API` parcial — el sub-tab "Cuenta" de US-PER-02 no tiene
  forma de resolverse contra un `personId` arbitrario.** Revisado
  `kernel-openapi.yaml` completo: no existe ningún operationId que
  resuelva `UserAccount` a partir de un `personId` — `GET /auth/me`
  sólo devuelve la cuenta propia del actor autenticado, y
  `/auth/accounts/{accountId}/{suspend,reactivate,disable}` requieren
  ya conocer un `accountId`, que nada expone a partir de un
  `personId`. El comando `LinkAccountToPerson` está listado en
  kernel-spec.md §8.2 pero no tiene ruta HTTP. Tampoco existe un `GET`
  para listar invitaciones de una persona (`/persons/{id}/invitations`
  sólo acepta `POST`), así que no hay forma de reconstruir el estado
  "vinculada/no vinculada" ni siquiera indirectamente vía historial de
  invitaciones. Esto **no bloquea toda la historia** — Identidad,
  Membresías (sólo lectura) e Historial (timestamps del propio
  `Person`) sí son completamente implementables — así que US-PER-02
  cierra `DONE` con el sub-tab "Cuenta" marcado `BLOCKED_API` y
  explicado en la UI, no fingido ni omitido en silencio. US-PER-06
  (invitar) no depende de esto: no necesita leer el estado de cuenta
  primero, sólo crear la invitación.

### US-PER-01 — Buscar/listar personas

Ruta `/persons` · Actor con `kernel.person.read` · Hook
`usePersons(filters)` (infinite, cursor) · Operation `listPersons` →
`GET /persons?query=&cursor=&limit=` · Response `PersonPage` · Filtros
en URL · Estados: loading, empty, error, forbidden, success · **Status:
DONE**

### US-PER-02 — Detalle de persona

Ruta `/persons/[personId]`, tabs Identidad/Membresías/Cuenta/Historial
· Hooks `usePerson(personId)`, `usePersonMemberships(personId)` ·
Operations `getPerson`, `listPersonMemberships` · Ver precisión de PII
arriba: no hay máscara de campo adicional, sí clasificación visual ·
Membresías es de sólo lectura (ninguna acción de ciclo de vida de
Membership vive en esta feature) · Cuenta: `BLOCKED_API` (ver
precisión arriba — no hay operationId que resuelva `UserAccount` desde
`personId`; la UI lo explicita en vez de fingir un estado) · Historial
acotado a timestamps del propio DTO · Estados:
loading/404/403/error/success · **Status: DONE**

### US-PER-03 — Crear persona

Dialog desde `/persons` · Actor con `kernel.person.manage` · Hook
`useCreatePerson()` · Operation `createPerson` → `POST /persons` ·
Campos: exactamente `CreatePersonRequest` (`firstName`, `lastName`,
`primaryEmail`, `phone`, `birthDate`; `externalReference`/`metadata`
sin UI, mismo criterio que `attributes` en Organizaciones) · No crea
`UserAccount` ni `Membership` automáticamente (comandos separados) ·
**Status: DONE**

### US-PER-04 — Editar persona

Ruta `/persons/[personId]/edit` · Actor con `kernel.person.manage` o
`kernel.person.update.self` sobre la propia persona · Hook
`useUpdatePerson()` · Operation `updatePerson` → `PATCH /persons/{id}`
· Campos: `UpdatePersonRequest` (`firstName`, `lastName`,
`displayName`, `primaryEmail`, `phone`, `birthDate`) · **Status: DONE**

### US-PER-05 — Archivar persona

Dialog de confirmación · Actor con `kernel.person.manage` · Hook
`useArchivePerson()` · Operation `archivePerson` · Regla: invariante
6.2.3 (persona archivada no recibe membresías/cargos/roles nuevos);
6.2.2 (no elimina historial) · Sin optimistic update · **Status:
DONE**

### US-PER-06 — Invitar a crear cuenta

Acción desde el detalle de persona, requiere una membresía existente
(ver precisión arriba) · Actor con `kernel.person.manage` · Hook
`useInvitePerson()` · Operation `invitePersonToCreateAccount` →
`POST /persons/{id}/invitations` · Request `{membershipId, email}` ·
Regla: §7.9 (máquina de estados de invitación:
`PENDING→ACCEPTED/EXPIRED/REVOKED`, terminal) · **Status: DONE**

### Verificación de cierre — Fase 3 (Personas)

Ejecutado el 2026-08-09 sobre `apps/mirotaract-web`. Esta fase corrió en
paralelo con Fase 4 (Membresías, otro track sobre
`src/features/memberships/**` y `src/lib/api/memberships/**`) — el
resultado de estos comandos incluye ambos tracks porque
typecheck/test/build corren sobre el repo completo, pero cada hallazgo
se atribuye a su track real, no se le adjudica a Personas lo que no le
pertenece.

- `pnpm typecheck` (`tsc --noEmit`) — **verde para
  `src/features/persons/**`, `src/app/persons/**` y
  `test/runtime/persons.runtime.test.ts`** (0 errores). Durante el
  desarrollo aparecieron y luego se resolvieron por sí solos dos
  errores transitorios fuera de este track —
  `club-dashboard.tsx`/dos tests contra `useOrganizationMemberships`
  cuando Fase 4 lo migró de `useQuery` a `useInfiniteQuery` — y quedó
  uno persistente ajeno a Personas:
  `src/features/memberships/components/membership-summary-card.tsx`
  (`Cannot find name 'Skeleton'`) y
  `test/runtime/memberships.runtime.test.ts` (un `children` faltante
  en un mock de `useActiveOrganization`). Ninguno de los dos es un
  archivo de este track (`features/memberships/**`, prohibido tocar
  por consigna) — no se modificaron.
- `pnpm lint` (`prettier --check src`) — verde (repo completo).
- `pnpm test` (`tsx --test`, suite completa) — **103/103** tests
  verdes, incluye `test/runtime/persons.runtime.test.ts` (**18 tests
  nuevos**): listado (loading/empty/success/403/búsqueda con
  debounce/paginación cursor ida-y-vuelta), detalle
  (success/404/403/tab Cuenta mostrando el `BLOCKED_API` real, nunca
  un estado inventado), acceso propio (`kernel.person.update.self`
  muestra "Editar" sólo para la propia persona — dos tests separados,
  no uno con dos renders en el mismo test: renderizar dos árboles sin
  `cleanup()` entre medio colgó el proceso, ver hallazgo de
  infraestructura abajo), crear (success/409), editar (success, con
  aserción exacta del payload PATCH), archivar (confirmación real +
  409 `KERNEL_INVALID_TRANSITION` sin corrupción local), invitar (sin
  membresía → acción deshabilitada con explicación; con membresía →
  éxito con aserción exacta de `{membershipId, email}`).
- `node scripts/validate-design-system-boundaries.mjs` — verde.
- `pnpm build` (`next build`, producción) — verde tras un par de
  reintentos: dos builds consecutivos fallaron con `ENOENT` sobre
  archivos de `.next/` (`pages-manifest.json`,
  `app/api/auth/login/route.ts` bajo `.next/types/`) — colisión de
  escritura por otro proceso (`next build`/`next dev` de Fase 4)
  compilando el mismo directorio `.next` compartido al mismo tiempo,
  no un error de código; el tercer intento compiló limpio con ambos
  tracks juntos: `/persons` 2.55 kB, `/persons/[personId]` 4.53 kB,
  `/persons/[personId]/edit` 2.2 kB (y `/memberships`,
  `/memberships/[membershipId]` de Fase 4 en la misma build).
- `pnpm contracts:validate` (raíz del repo) — verde.
- Auditoría de arquitectura sobre `src/features/persons` (grep): 0
  ocurrencias de `fetch(`, `axios`, imports de `*.api`/`client/`/
  `schema`, `@prisma`, `kernel-sdk`, `/service/`, `isPresident`,
  `Membership.title`, o imports de `features/memberships` (la única
  mención de "features/memberships" es un comentario que documenta la
  decisión de no compartir, no un import real).

**Hallazgo de infraestructura de testing** (no es un bug de la
feature): renderizar dos árboles completos con `renderWithClient` en
el mismo test, sin `cleanup()` entre uno y otro, cuelga el proceso de
test indefinidamente hasta que `--test-force-exit` lo mata con
`SIGKILL` — sin ningún error legible en el camino. La causa exacta no
se investigó a fondo (probablemente una interacción entre dos
suscripciones simultáneas a los mismos singletons —`tokenManager`,
efectos de Radix `Dialog`/`FocusScope`— desde dos árboles React
montados a la vez); el patrón seguro y ya usado en todo el resto de la
suite es un `render` por test. Documentado acá para que la próxima
fase no repita el patrón.

Fase 3 (Personas) queda **DONE y verde**. `US-PER-02` incluye un
sub-alcance `BLOCKED_API` documentado (tab "Cuenta") que no bloquea el
resto de la historia. Por regla de gate (§39 del producto), el
siguiente track secuencial (Fase 5, Autoridades/Cargos) puede
habilitarse una vez que Fase 4 (Membresías, en curso en paralelo)
también cierre verde — no antes.

---

## Área 3 — Membresías (Fase 4)

Revisión previa a código (2026-08-09): la máquina real (§7.3) es

```text
PENDING  -> ACTIVE
PENDING  -> INACTIVE
ACTIVE   -> ON_LEAVE
ON_LEAVE -> ACTIVE
ACTIVE   -> INACTIVE
ACTIVE   -> GRADUATED
ACTIVE   -> TRANSFERRED
INACTIVE -> ACTIVE
```

US-MEM-04 a 08 se desagruparon y verificaron una por una contra
`kernel-openapi.yaml` (nunca inferidas del nombre del hook). Tres
lecturas no obvias del contrato real, encontradas en esta revisión:

- **"Graduar" y "Reactivar" no son un par.** `GRADUATED` y
  `TRANSFERRED` son terminales — no hay transición de salida
  documentada en §7.3. `reactivate` (`POST
  /memberships/{id}/reactivate`) sólo aplica desde `INACTIVE`;
  `kernel-openapi.yaml` lo dice explícitamente ("Sólo aplica desde
  `INACTIVE`... `GRADUATED`/`TRANSFERRED` no tienen retorno
  documentado"). La UI nunca ofrece "Reactivar" sobre una membresía
  `GRADUATED`.
- **`deactivate` también aplica desde `PENDING`**, no sólo desde
  `ACTIVE` (`PENDING -> INACTIVE` está en la máquina). El helper de
  presentación lo refleja.
- **No existe permiso propio para `leave`/`resume`/`graduate`/
  `reactivate`.** `kernel-spec.md` §10.1 sólo define
  `kernel.membership.activate` y `kernel.membership.deactivate` como
  permisos de transición; `kernel-openapi.yaml` asigna
  `x-required-permission: kernel.membership.update` a las cuatro
  transiciones restantes. No es una invención de esta fase: ya está
  resuelto así en el contrato.
- **`OrganizationMembership`/`CreateMembershipRequest` no tienen campo
  `type`/"tipo".** El agregado (`kernel-spec.md` §4.3, §5) no modela
  un tipo de membresía — sólo persona, organización, estado, vigencia
  e historial. La columna "tipo" y el campo homónimo mencionados en la
  historia original no se implementan: no hay de dónde derivarlos sin
  inventar contrato (§14 del producto: "Derivar sólo de
  `CreateMembershipRequest`").
- **`useOrganizationMemberships` no paginaba por cursor real.** Antes
  de esta fase el hook usaba `useQuery` con un tipo de filtros que
  omitía `cursor` — no había forma de pedir la página siguiente pese a
  que `MembershipPage.pageInfo` sí trae `nextCursor`/`hasMore`. Se
  convirtió a `useInfiniteQuery`, mismo patrón exacto que
  `useOrganizations` (misma query key, mismo `getNextPageParam`) — no
  es un rediseño de la capa pública, es completar un hook que ya
  declaraba el contrato correcto pero no lo cableaba.

Con estas precisiones, las 8 historias pasan a `READY`.

### US-MEM-01 — Listar membresías de una organización

Ruta `/memberships?organization=&status=` · Actor con
`kernel.membership.read` · Hook `useOrganizationMemberships(orgId,
{status})` (ahora `useInfiniteQuery`, ver nota arriba) · Operation
`listOrganizationMemberships` → `GET
/organizations/{id}/memberships?status=&cursor=&limit=` · Response
`MembershipPage` · Filtros `organization`/`status` en URL; `organization`
explícito en query param manda sobre `activeOrganizationId` (que sólo
se usa como default, nunca se muta automáticamente) · Columnas: persona
(resuelta por fila, ver nota), estado, fecha de inicio (`joinedAt`),
fecha de fin (`endedAt`, sólo si existe), acción → detalle. Sin columna
"tipo" (no existe en el contrato) ni columna "organización" por fila
(la lista siempre está escopeada a una sola organización, se muestra
una vez en el `PageHeader`, no repetida por fila) · Resolución de
persona: `TEMPORARY_BOUNDED_JOIN` — una request por `personId` distinto
en la página actual vía `usePerson`, deduplicada por el cache de
TanStack Query, acotada por el `limit` de la página (mismo patrón que
`OrganizationParentCell`); no hay `listPersons` por lote de IDs en el
contrato, así que no es viable evitarla sin modificar Persons/API ·
`DataPagination` del admin-shell, cursor real · Estados: loading, empty,
error, forbidden, success · **Status: DONE**

### US-MEM-02 — Detalle de membresía + historial

Ruta `/memberships/[membershipId]` · Actor con `kernel.membership.read`
· Hooks `useMembership(id)`, `useMembershipHistory(id)` · Operations
`getMembership`, `getMembershipHistory` → `GET /memberships/{id}`, `GET
/memberships/{id}/history` · Response `OrganizationMembership`,
`MembershipTransition[]` · Muestra persona (`usePerson`, un único
request extra — no es el patrón per-row de la lista), organización
(`useOrganization`), estado, `joinedAt`/`statusChangedAt`/`endedAt`,
historial inmutable ordenado localmente por `effectiveAt` ascendente
(el contrato no garantiza orden de `getMembershipHistory`, así que
ordenar client-side sobre datos ya reales está permitido por §11 del
producto; nunca se reconstruye el historial desde el estado actual) ·
Estados: loading, 404, 403, error, success · **Status: DONE**

### US-MEM-03 — Crear membresía

`CreateMembershipDialog` exportable (usable desde `/memberships` y
desde la tab "Socios" de `/organizations/[id]`, sin reescribir
Organizations) · Actor con `kernel.membership.create` · Hook
`useCreateMembership()` · Operation `createMembership` → `POST
/organizations/{organizationId}/memberships` (organización va en la
URL, no en el body) · Request `CreateMembershipRequest`: sólo
`personId` (requerido, buscador acotado contra `usePersons({query})`,
nunca la lista completa) y `memberNumber` (opcional); `metadata` sin UI
por ahora, igual que `attributes` en Organizations (US-ORG-05) · Regla:
invariante 6.4.1 (máximo una membresía por persona/organización) — la
UI no hace un request de verificación previo para reemplazar la
validación del Kernel (§15 del producto) · Errores: 409 → "Ya existe
una membresía para esta persona en esta organización." · Mutation: sí,
sin optimistic update · Invalida vía `memberships.hooks.ts` (ya
implementado) · **Status: DONE**

### US-MEM-04 — Activar

`PENDING -> ACTIVE` · Hook `useActivateMembership()` · Operation
`activateMembership` → `POST /memberships/{id}/activate` · Permiso
`kernel.membership.activate` · Body `{ joinedAt? }` (invariante 6.4.2:
`ACTIVE` requiere `joinedAt`; si se omite, la fecha efectiva la decide
el Kernel) · Error 409 `KERNEL_INVALID_TRANSITION` · Invalidaciones: ya
implementadas (`invalidateMembership` en `memberships.hooks.ts`) ·
**Status: DONE**

### US-MEM-05 — Poner en licencia

`ACTIVE -> ON_LEAVE` · Hook `usePutMembershipOnLeave()` · Operation
`putMembershipOnLeave` → `POST /memberships/{id}/leave` · Permiso
`kernel.membership.update` · Body `{ reasonText? }` (`reasonCode` no se
expone en el formulario: el contrato no enumera un catálogo de
códigos, no se inventa uno) · Error 409 · **Status: DONE**

### US-MEM-06 — Reanudar

`ON_LEAVE -> ACTIVE` · Hook `useResumeMembership()` · Operation
`resumeMembership` → `POST /memberships/{id}/resume` · Permiso
`kernel.membership.update` · Sin body · Error 409 · **Status: DONE**

### US-MEM-07 — Desactivar

`{PENDING, ACTIVE} -> INACTIVE` · Hook `useDeactivateMembership()` ·
Operation `deactivateMembership` → `POST /memberships/{id}/deactivate`
· Permiso `kernel.membership.deactivate` · Body `{ reasonText? }`
(invariante 6.4.3: `INACTIVE` requiere `endedAt`, decidido por el
Kernel) · Error 409 · **Status: DONE**

### US-MEM-08 — Graduar / Reactivar

Dos operaciones independientes, no una transición de ida y vuelta (ver
nota de la revisión arriba):

- **Graduar** — `ACTIVE -> GRADUATED`, terminal · Hook
  `useGraduateMembership()` · Operation `graduateMembership` → `POST
  /memberships/{id}/graduate` · Permiso `kernel.membership.update` ·
  Sin body · Error 409.
- **Reactivar** — `INACTIVE -> ACTIVE` únicamente (nunca ofrecida sobre
  `GRADUATED`/`TRANSFERRED`) · Hook `useReactivateMembership()` ·
  Operation `reactivateMembership` → `POST
  /memberships/{id}/reactivate` · Permiso `kernel.membership.update` ·
  Sin body · Error 409 · Invariante 6.4.7: preserva el mismo ID y
  agrega historial (nunca crea una membresía nueva).

**Status: DONE**

Para las seis: mutation sin optimistic update (estado visible
anterior se mantiene hasta success; botón deshabilitado mientras
pending); cada una invalida detail + history + organization lists +
person list + `authorizationKeys.allEffectivePermissions()` (ya
implementado así en `memberships.hooks.ts`, verificado con tests de
cross-feature cache); 409 `KERNEL_INVALID_TRANSITION` → "Esta
membresía no puede pasar a ese estado en este momento.", sin retry
automático ni transición alternativa. `getAvailableMembershipActions(status)`
en `features/memberships/adapters` reproduce exactamente la máquina de
arriba para decidir qué botón mostrar — el Kernel revalida cada
transición igual.

### Verificación de cierre — Fase 4 (Membresías)

Ejecutado el 2026-08-09 sobre `apps/mirotaract-web`. Esta fase corrió
en paralelo con Fase 3 (Personas, otro track sobre
`src/features/persons/**` y `src/app/persons/**`) — mismo repo
compartido para typecheck/test/build, cada hallazgo se atribuye a su
track real.

- `pnpm typecheck` (`tsc --noEmit`) — **verde, 0 errores**, repo
  completo (incluye `src/features/persons/**` de Fase 3, que corría en
  paralelo).
- `pnpm lint` (`prettier --check src`) — verde.
- `pnpm test` (`tsx --test`, suite completa) — **103/103** tests
  verdes, incluye `test/runtime/memberships.runtime.test.ts` (**23
  tests nuevos**): listado (loading/empty/success/403/sin organización
  en scope → 0 requests/filtro de estado + `?organization=` explícito
  ganándole a `activeOrganizationId`/paginación cursor ida-y-vuelta/
  anti-N+1 de personas), detalle (success con orden ascendente de
  historial verificado explícitamente pese a llegar del Kernel en
  orden inverso/404/403), crear (success con `CreateMembershipRequest`
  exacto/409 duplicado), y las seis transiciones probadas por separado
  con su propio test (activate visible sólo con permiso+`PENDING`,
  activate ausente sobre `ACTIVE`, leave con 409
  `KERNEL_INVALID_TRANSITION` sin mutación local, resume, deactivate
  desde `PENDING`, graduate, reactivate) más dos tests dedicados a la
  precisión del preflight ("Graduar"/"Reactivar" no son un par: una
  membresía `GRADUATED` no ofrece ninguna acción; una `INACTIVE` sólo
  ofrece reactivar, nunca graduar) y dos tests de invalidación de cache
  cross-feature contra el `QueryClient` real (activate y deactivate
  invalidan detail + history + organization lists + person list +
  effective permissions).
- `node scripts/validate-design-system-boundaries.mjs` — verde.
- `pnpm build` (`next build`, producción) — verde tras esperar a que
  terminara un `next build` concurrente de Fase 3 sobre el mismo
  `.next/` compartido (dos `ENOENT` transitorios por la colisión de
  escritura, no error de código); build final limpio con ambos tracks
  juntos: `/memberships` 3.45 kB, `/memberships/[membershipId]` 5.88
  kB.
- `pnpm contracts:validate` (raíz del repo: OpenAPI, eventos, cobertura
  HTTP, boundaries del Design System) — verde.
- Auditoría de arquitectura sobre `src/features/memberships` (grep): 0
  ocurrencias de `fetch(`, `axios`, imports de `*.api`/`client/`/
  `schema`, `@prisma`, `kernel-sdk`, `/service/`, `isPresident`,
  `Membership.title`, o lógica de autoridad/cargo derivada de
  Membership. Las únicas menciones de "features/persons" y
  "features/organizations" son comentarios que documentan la decisión
  de no importar de ahí (duplicación local deliberada, product spec
  §32), no imports reales.

**Efecto colateral documentado** (no es una desviación del alcance,
es una consecuencia directa de corregir un gap real de la capa
pública): `useOrganizationMemberships` pasó de `useQuery` a
`useInfiniteQuery` para soportar cursor real (ver nota de revisión al
inicio de esta Área). Esto cambia la forma de su `data` (de
`MembershipPage` a `{ pages: MembershipPage[] }`), que rompía dos
consumidores fuera de `features/memberships/**`:
`features/dashboard/containers/club-dashboard.tsx` (Fase 1, ya
shippeada) y dos tests compartidos
(`public-barrel-smoke.runtime.test.ts`,
`query-key-isolation.runtime.test.ts`). Los tres se ajustaron de forma
mecánica (leer `.data.pages[0]` en vez de `.data`), sin tocar lógica
de negocio de Dashboard — los 103/103 tests siguen verdes.

**`QUERY_PROJECTION_CANDIDATE` (Membresías):**

- **Nombre de persona en listado/historial/resumen.**
  `OrganizationMembership`/`MembershipTransition` sólo exponen
  `personId`, no un nombre denormalizado, y `PersonFilters` no soporta
  resolución batch por ids (`query`/`cursor`/`limit` únicamente). Se
  resuelve con `usePerson(personId)` por fila/entrada, deduplicado por
  TanStack Query (verificado con el test anti-N+1), acotado por el
  `limit` de la página — mismo patrón que `OrganizationParentCell`
  (Fase 2). Candidato futuro: `personName` denormalizado en
  `MembershipPage`/`MembershipTransition`, o un endpoint de resolución
  batch por ids.
- **`CreateMembershipRequest` no tiene `type`.** Documentado como
  hallazgo de contrato (no un `QUERY_PROJECTION_CANDIDATE` real): la
  historia original mencionaba un campo/columna "tipo" que no existe
  en `kernel-spec.md` §4.3 ni en el schema — no se inventó.

Fase 4 (Membresías) queda **DONE y verde**. Por regla de gate (§39 del
producto), el siguiente track secuencial (Fase 5, Autoridades/Cargos)
puede habilitarse una vez que Fase 3 (Personas, en curso en paralelo)
también cierre verde — no antes.

---

## Integración Personas ↔ Membresías

Ejecutado el 2026-08-09, después de que Fase 3 (Personas) y Fase 4
(Membresías) cerraran cada una por separado. Objetivo: cerrarlas como
un bloque coherente sin rediseñar arquitectura — auditar ambos tracks,
resolver inconsistencias reales, verificar navegación cruzada con
tests, sin avanzar a Fase 5+.

### Ownership

Sin cambios respecto al ya establecido en cada fase — esta integración
no movió ningún archivo entre features:

- `features/persons/**` — dueño del dominio `Person` y de su
  presentación (incluida la vista de sólo lectura de las membresías de
  una persona, `PersonMembershipList`).
- `features/memberships/**` — dueño del dominio `Membership` completo
  (lifecycle, historial, badges de estado).
- Ninguna de las dos importa componentes DOMAIN de la otra. Auditoría
  (grep, ambos features): 0 imports reales de `features/persons` desde
  `features/memberships` ni viceversa — las únicas menciones de la
  otra feature son comentarios que documentan la decisión de no
  importar.

### Navegación

Las tres direcciones pedidas ya existían parcialmente o se completaron
en esta integración:

- **Person → Membership**: ya existía. La tab "Membresías" de
  `/persons/[personId]` (`PersonMembershipList`, sólo lectura) usa
  `usePersonMemberships(personId)` y cada fila linkea a
  `/memberships/[membershipId]` (`PersonMembershipRow`). Ningún botón
  de lifecycle vive ahí — las acciones sólo están en el detalle de
  Membership, tal como pide la integración.
- **Membership → Person**: **faltaba**, se agregó en esta integración.
  `MembershipSummaryCard` (`features/memberships/components/`) ahora
  muestra "Persona" como link a `/persons/[personId]` (prop
  `linkToProfile` en `MembershipPersonCell`), mostrando sólo el
  nombre — nunca duplica el perfil completo de Person (sin
  email/teléfono/fecha de nacimiento).
- **Membership → Organization**: **faltaba**, se agregó en esta
  integración. El campo "Organización" del mismo `MembershipSummaryCard`
  ahora es un link a `/organizations/[organizationId]`.

Ninguno de los tres muta `activeOrganizationId`: son `next/link`
comunes, no `setActiveOrganizationId`. Verificado con un test explícito
(`activeOrganization stays put`, ver más abajo) que abre una Membership
de una organización distinta a la activa y confirma que el contexto no
cambia.

### Hallazgos de la auditoría (§3 del pedido) y su resolución

- **CONFLICT — `membershipStatusToTone()` duplicado con valores
  distintos.** Ambos features ya tenían su propio adapter local (patrón
  correcto, sin import cruzado), pero con **tonos incompatibles** para
  el mismo `MembershipStatus`: `PENDING` era `info` en Persons y
  `neutral` en Memberships; `INACTIVE` era `neutral` en Persons y
  `warning` en Memberships; `GRADUATED` era `neutral` en Persons y
  `info` en Memberships. Resuelto: se alinearon ambos archivos al
  mismo mapping (Memberships como dueño semántico del dominio), cada
  uno documentando que debe cambiarse junto con el otro si el mapping
  cambia — dos archivos, un solo significado visual.
- **INCONSISTENCY — labels de estado con género distinto.** Memberships
  usaba "Activo"/"Inactivo"/"Egresado"/"Transferido" (concordando con
  "el socio"); Persons ya usaba "Activa"/"Inactiva"/"Graduada"/
  "Transferida" (concordando con "la membresía", gramaticalmente más
  correcto y coincide con los propios labels de transición de
  Memberships — "Activada", "Desactivada" — que ya eran femeninos).
  Resuelto: Memberships adoptó los labels de Persons.
- **DUPLICATION interna (no cross-feature) — nombre de persona
  reimplementado 3 veces dentro de Memberships**, sin el `.trim()` que
  sí tiene el `personDisplayName()` canónico de Persons
  (`MembershipPersonCell`, `PersonPickerField`,
  `MembershipDetailContainer` cada uno con su propia expresión
  `displayName || firstName + lastName`). Resuelto: se consolidaron en
  `features/memberships/adapters/person-display-name.ts`, un helper
  local (no importado de Persons — product spec §11) con
  **exactamente el mismo comportamiento** que el de Persons, documentado
  como réplica intencional.
- **VALID_SHARED_PATTERN — `formatDate()` y `ConfirmationDialog`
  duplicados.** Ambos ya estaban duplicados a propósito en cada
  feature (mismo patrón que Organizations). No se tocaron: son
  triviales, agnósticos de dominio, y extraerlos a un módulo
  app-level no reduciría complejidad real en esta fase.

### Cross-feature cache invalidation

Ya estaba resuelto por construcción, no por esta integración: Persons
no tiene su propio hook de lectura de membresías — `PersonMembershipList`
usa `usePersonMemberships(personId)`, el mismo hook público de
`@/lib/api` (dueño: Memberships) que ya invalida `useCreateMembership`
y las seis mutations de lifecycle (`invalidateMembership` en
`memberships.hooks.ts`, con la key `membershipKeys.personList(personId)`).
Como ambas features comparten el mismo `QueryClient` de la app, una
mutación de Membership invalida automáticamente lo que ve Persons —
nunca hay una copia stale. Esto se verificó con tests reales (no sólo
inspeccionando el código), montando el diálogo de mutation y
`PersonMembershipList` en el mismo árbol:

- crear membresía → la tab Membresías de esa persona deja de mostrar
  "Sin membresías" sin ningún refetch manual.
- desactivar/graduar/reactivar → el badge de estado en la tab cambia
  al valor nuevo tras la mutación, sin recarga completa.
- desactivar → `authorizationKeys.allEffectivePermissions()` queda
  invalidado en el mismo `QueryClient` (invariante 6.4.6 — una
  membresía inactiva no habilita cargos activos).

### PII

`MembershipPersonCell`/`MembershipSummaryCard`/`PersonPickerField`
sólo muestran el nombre de la persona (vía `personDisplayName()`) —
nunca `primaryEmail`/`phone`/`birthDate`, aunque el DTO completo de
`Person` esté disponible en memoria tras el request. Verificado con un
test explícito que confirma que `ada@example.com` nunca aparece en el
detalle de una Membership. Las decisiones de qué PII de Person se
expone siguen bajo ownership de Persons/el contrato — Memberships no
decide mostrar más.

### `UserAccount` ≠ `Person`

`Person` no tiene un campo de cuenta (no hay `accountId`/`hasAccount`
en el schema) — Memberships nunca asumió su presencia. Verificado con
un test que renderiza el detalle de una Membership para una `Person`
sin `primaryEmail`/`phone`/`birthDate` y confirma que renderiza igual.

### `Person` ≠ `Membership`

Auditado: ninguna de las dos features lee `person.status` ni
`person.organizationId` como si existieran (no existen en el DTO de
`Person`). Una persona puede tener 0, 1 o N membresías — el listado de
`/memberships` nunca asume exactamente una, y `PersonMembershipList`
maneja el caso de 0 con un `DataState` "Sin membresías", no con un
crash ni un valor inventado.

### No inferencia de autoridad

Auditoría (grep, ambos features): 0 ocurrencias de `isPresident`,
`Membership.title`, o cualquier variante de "Presidente" derivada de
`MembershipStatus`. Los cargos llegan en Fase 5 vía `Appointment`.

### Bounded joins (sin empeorar durante la integración)

- `TEMPORARY_BOUNDED_JOIN` (ya documentado en Fase 4): nombre de
  persona por fila en `/memberships` — sigue igual, no se agregó
  ningún request nuevo por fila.
- `TEMPORARY_BOUNDED_JOIN` (ya documentado en Fase 3): nombre de
  organización por fila en la tab Membresías de Person
  (`PersonMembershipRow`, un `useOrganization` por membresía de esa
  persona, acotado por cuántas membresías tiene — normalmente pocas).
- Verificado con un test dedicado que, al integrar ambas features en
  una misma pantalla, **no aparece un N+1 nuevo**: una fila de
  Membership y la tab Membresías de Person compartiendo el mismo
  `personId` deduplican en **un solo** request a `/persons/{id}`
  gracias al `QueryClient` compartido (misma query key,
  `personKeys.detail(id)`, para ambas features).

### `QUERY_PROJECTION_CANDIDATE` (integración)

No surgió ninguno nuevo específico de la integración — los ya
documentados en Fase 3 y Fase 4 (nombre de persona/organización
denormalizado) siguen siendo los mismos candidatos, ahora confirmados
como el único punto de fricción real al combinar ambas pantallas.

### Filtros y deep links

`/persons?query=` y `/memberships?organization=&status=` siguen la
URL como única fuente de verdad (ninguna usa localStorage) — verificado
con un test que renderiza cada pantalla directamente con esos query
params y confirma que el input/selects los reflejan sin interacción
previa. La navegación real de "atrás" del browser no se probó
literalmente (el mock de router de test infra tiene `back()` como
no-op, mismo límite que en Fases 2/3) — la prueba real y suficiente es
que la URL sea la fuente de verdad, que sí está cubierta.

### Hallazgo de infraestructura de testing (nuevo en esta integración)

`waitFor(() => assert.equal(queryByText(...), null))` — esperar una
**ausencia** vía polling — cuelga el proceso de test hasta que
`--test-force-exit` lo mata con `SIGKILL` (~15s), incluso cuando el
cambio de estado subyacente ya resolvió en menos de 500ms (confirmado
reemplazando el `waitFor` por un `setTimeout` fijo durante el
debugging). La causa más probable es una interacción entre el ciclo de
animación de salida de `Dialog`/`Presence` de Radix en jsdom y el
polling de `waitFor` — no se investigó más a fondo. Corrección: todo
`waitFor` en
`test/runtime/persons-memberships.integration.test.ts` espera una
condición **positiva** (algo que aparece), nunca una ausencia vía
`queryByText(...) === null` dentro de un `waitFor`; una comprobación
de ausencia hecha una sola vez, fuera de `waitFor`, después de esperar
la condición positiva, es segura y se usó donde hacía falta. Documentado
acá para que la próxima fase no repita el patrón (mismo espíritu que
el hallazgo de infraestructura de Fase 2/Fase 3).

### Tests

`test/runtime/persons-memberships.integration.test.ts` — **13 tests
nuevos**: Person→Membership (listado + link), Membership→Person +
Membership→Organization (links, sin fuga de PII), create/deactivate/
graduate/reactivate actualizando la tab Membresías de Person sin
cache manual, invalidación de permisos efectivos compartida,
`activeOrganization` inalterado al abrir una Membership de otro scope,
Person sin PII de cuenta renderizando bien, 403 de Membresías acotado
a esa tab, 404 de Person sin romper el listado de Memberships (fila
cae a "—"), filtros sobreviviendo vía URL en ambas pantallas, y
anti-N+1 cruzado (dedupe de `/persons/{id}` entre ambas features vía
el mismo `QueryClient`). Suite completa del repo: **116/116** verde
(103 de Fases 1-4 + 13 de esta integración).

La integración Personas ↔ Membresías queda **DONE y verde**. No se
avanzó a Fase 5 (Autoridades/Cargos) ni a ninguna fase posterior.

---

## Área 4 — Autoridades / Cargos (Fase 5)

### US-POS-01 — Catálogo de cargos

Ruta `/positions` (filtro `?organizationType=`) · Hook
`usePositionDefinitions(organizationType?)` · Operation
`listPositionDefinitions` → `GET /position-definitions?organizationType=`
· `PositionDefinition[]` — sin cursor en el contrato, por lo que no hay
view-model de paginación (a diferencia de Organizaciones/Membresías).
Permiso: `kernel.position.read`. "Crear cargo" se gatea con
`kernel.position.create` (ver US-POS-02). **Status: DONE** — tests en
`test/runtime/positions.runtime.test.ts` (loading/success, empty, 403,
filtro por `organizationType`, visibilidad del link "Crear cargo" con y
sin permiso).

### US-POS-02 — Crear cargo distrital

Ruta `/positions/new` (sólo scope DISTRICT) · Hook
`useCreatePositionDefinition()` · Operation `createPositionDefinition`
→ `POST /position-definitions`, permiso real `kernel.position.create`
(**corrección**: el borrador original decía "Actor con
`editPermissionCode` del cargo" — eso es incorrecto, `editPermissionCode`
dinámico sólo aplica a `updatePositionDefinition` y a
`attach/detachPermissionToPosition`, nunca a la creación, que usa el
permiso fijo `kernel.position.create` según `kernel-openapi.yaml`).
`organizationType` queda fijo en `"DISTRICT"` (no es un campo editable
del formulario) y `ownerOrganizationId` es obligatorio — un distrito
`ACTIVE`, elegido de una lista acotada (`useOrganizations({type:
"DISTRICT", status: "ACTIVE"})`, invariante 6.6.1.1). Regla:
invariante 6.6.1 (catálogo distrital), CA-POS-01. **Status: DONE** —
test en `test/runtime/positions.runtime.test.ts` (éxito con el payload
exacto de `CreatePositionDefinitionRequest`, oculto sin permiso).

### US-POS-03 — Editar cargo + permisos

Ruta `/positions/[positionDefinitionId]` · Hooks
`useUpdatePositionDefinition()`, `useAttachPermissionToPosition()`,
`useDetachPermissionFromPosition()`. `listPositionDefinitions` es el
único hook de lectura de Positions (no hay `GET
/position-definitions/{id}` en el contrato) — el detalle busca la
posición dentro de la lista completa ya cacheada, un catálogo acotado
por diseño (igual que `positionsById` en el Dashboard), no un problema
de N+1. Gate de edición: `!position.isSystem && useCan(
position.editPermissionCode, { scopeType: "ORGANIZATION_TREE", scopeId:
position.ownerOrganizationId })` — el permiso real a chequear es el que
trae el propio registro (`dynamic:position.editPermissionCode` en
`kernel-openapi.yaml`), evaluado en el árbol del distrito propietario
(invariante 6.6.1.3); los cargos de sistema nunca muestran el
formulario de edición aunque el usuario tenga el permiso (invariante
6.6.1.2, CA-POS-03). Regla: CA-POS-02 (cargo sin `defaultRoleCode`
responde 409 al adjuntar/quitar un permiso).

**`BLOCKED_API` parcial** — el panel de permisos del cargo
(`PositionPermissionsPanel`) sólo puede *disparar* `attachPermissionToPosition`/
`detachPermissionFromPosition`; `kernel-openapi.yaml` no expone ningún
`GET` que devuelva los permisos actualmente adjuntos a un cargo o a su
`RoleDefinition` (`RoleDefinition` no tiene un campo `permissions`, y no
existe `GET /roles/{roleId}/permissions`). La UI no puede mostrar un
estado marcado/desmarcado por permiso — sólo ofrece adjuntar/quitar "a
ciegas" contra el catálogo completo de permisos (`usePermissions()`).
La historia cierra `DONE` igualmente porque las tres operaciones reales
(editar, adjuntar, quitar) están implementadas y probadas; el
sub-alcance de lectura del estado actual queda `BLOCKED_API` hasta que
el contrato agregue una proyección de lectura. **Status: DONE** (con el
sub-alcance `BLOCKED_API` de arriba) — tests en
`test/runtime/positions.runtime.test.ts` (edición exitosa, cargo de
sistema nunca muestra el formulario, CA-POS-02 sin rol técnico, adjuntar
con éxito, quitar con 409).

### US-APP-01 — Autoridades vigentes de una organización

Ruta `/authorities?organization=...` (si no hay query param, usa
`activeOrganizationId` del Shell como default sin escribirlo de vuelta
en la URL, mismo patrón que Membresías) · Hook
`useCurrentAuthorities(organizationId)` · Operation
`getCurrentAuthorities` → `GET
/organizations/{id}/authorities/current`, permiso
`kernel.appointment.read` · Regla: CA-APP-03/04 (`Appointment` como
única fuente, nunca `isPresident`). El nombre de la persona se resuelve
por fila con `AppointmentMembershipCell` (membership → person, un par de
lookups acotados y deduplicados por TanStack Query, mismo patrón que
`AuthorityRow` del Dashboard) — ver `TEMPORARY_BOUNDED_JOIN` más abajo.
**Status: DONE** — implementado como vista dedicada con navegación y
filtro de organización propios (distinta de las cards de
US-DASH-01/02) · tests en `test/runtime/appointments.runtime.test.ts`
(loading/success, empty, 403, anti-N+1 con tres filas compartiendo una
membership/person).

### US-APP-02 — Listar cargos (actuales/futuros/históricos)

Ruta `/appointments?organization=&period=&position=&status=` · Hook
`useAppointments(organizationId, filters)` · Operation real
`listAppointments` (**corrección**: el borrador decía
`listOrganizationAppointments`, ese operationId no existe en
`kernel-openapi.yaml`) → `GET
/organizations/{id}/appointments?periodId=&positionCode=&membershipId=&status=`,
permiso `kernel.appointment.read`.

**Corrección de alcance** — CA-APP-09, tal como está redactado en el
borrador ("Separación Actuales/Futuras/Históricas vía filtro `status`
en `NOMINATED|ELECTED` (futuras) / `ACTIVE` (actuales) /
`ENDED|REVOKED` (históricas)"), asume que el filtro `status` acepta un
conjunto de valores. El contrato real (`AppointmentFilters.status` en
`appointments.types.ts`, y el parámetro `status` de `listAppointments`
en `kernel-openapi.yaml`) sólo acepta **un** `AppointmentStatus` por
request, no una lista. La UI implementada expone el filtro real de
cinco estados individuales (`NOMINATED|ELECTED|ACTIVE|ENDED|REVOKED`)
en vez de tres grupos combinados — agrupar "futuras" (`NOMINATED` +
`ELECTED`) o "históricas" (`ENDED` + `REVOKED`) en una sola vista
requeriría dos requests fijos y fusionar client-side, lo que se dejó
deliberadamente afuera de esta pasada para no ampliar la superficie de
tests; no es un `BLOCKED_CONTRACT` (el filtro real funciona), es una
corrección del alcance original de la historia. **Status: DONE** —
tests en `test/runtime/appointments.runtime.test.ts` (loading/success
con posición/persona/período/estado resueltos, empty, filtro por
`status` re-consulta con el query real).

### US-APP-03 — Detalle de cargo

Ruta `/appointments/[appointmentId]` · Hook `useAppointment(id)` ·
Operation `getAppointment` → `GET /appointments/{appointmentId}`,
permiso `kernel.appointment.read`, 404 documentado. Resuelve posición
(desde el catálogo ya cacheado), organización, membership → person, y
período — todos bounded (un detalle = un conjunto fijo de lookups, no
un patrón por fila). Incluye `AppointmentActionsRow` con las cuatro
transiciones de ciclo de vida. **Status: DONE** — tests en
`test/runtime/appointments.runtime.test.ts` (éxito con todos los campos
resueltos, 404 "no encontrado", 403).

### US-APP-04 — Crear cargo (nominar)

Dialog (`CreateAppointmentDialog`, montado desde `/appointments`) ·
Actor con `kernel.appointment.create` (scope `ORGANIZATION` sobre la
organización objetivo) · Hook `useCreateAppointment()` · Operation
`createAppointment` → `POST /organizations/{id}/appointments`, siempre
crea en `NOMINATED` (§7.5) — el diálogo nunca deja elegir un estado
inicial. Regla: invariantes 6.6.1–6.6.4 (membresía habilitante activa y
del scope correcto). El picker de membresía
(`AppointmentMembershipPicker`) distingue: para un cargo `CLUB`/`OTHER`,
lista membresías `ACTIVE` de la organización objetivo directamente
(`useOrganizationMemberships`, primera página); para un cargo
`DISTRICT`, primero ofrece elegir un club descendiente
(`useOrganizationDescendants`, un solo request acotado) y luego lista
las membresías `ACTIVE` de ese club — nunca crea ni exige una membresía
distrital artificial (invariante 6.6.3). `startsAt`/`endsAt` se dejan
vacíos por defecto para que el Kernel los materialice desde los límites
del período (invariante 6.6.12). `createAppointment` no documenta un
`code` de error estable en `kernel-openapi.yaml` (sólo 201 está
documentado) — los 409/422 se normalizan sólo por status HTTP
(`describeCreateAppointmentError`), nunca inventando un `code`.
**Status: DONE** — tests en `test/runtime/appointments.runtime.test.ts`
(éxito con el payload exacto de `CreateAppointmentRequest` y navegación
al detalle, 422 con mensaje institucional y diálogo abierto, trigger
oculto sin permiso).

### US-APP-05 a US-APP-08 — Ciclo de vida del cargo

Marcar electo / activar / finalizar / revocar · Hooks
`useMarkAppointmentElected`, `useActivateAppointment`,
`useEndAppointment`, `useRevokeAppointment` · Regla: máquina §7.5
exacta (`NOMINATED→ELECTED`, `NOMINATED|ELECTED|ACTIVE→REVOKED`,
`ELECTED→ACTIVE`, `ACTIVE→ENDED`), CA-APP-02 (singleton: `activate`
puede devolver 409 si ya existe un titular `ACTIVE` para la misma
organización/período/posición), CA-APP-05 (revocar revoca el rol
técnico derivado si existía). Permisos reales por transición: `elect`
usa `kernel.appointment.create` (`kernel-openapi.yaml` lo documenta
como supuesto explícito — §10.1 no define un permiso propio para
"elect", así que este es el permiso correcto tal como está escrito en
el contrato, no una historia sin verificar), `activate` usa
`kernel.appointment.activate`, `end` usa `kernel.appointment.end`,
`revoke` usa `kernel.appointment.revoke` — los cuatro evaluados en
scope `ORGANIZATION` sobre `appointment.organizationId`. `revoke` exige
`revokeReason` (campo requerido en `RevokeAppointmentRequest`); el
diálogo no envía la mutation hasta que el campo esté completo. Ninguna
transición aplica optimistic update — el estado visible no cambia hasta
que el Kernel confirma. Mutation: sí, cada una invalida
`authorizationKeys.allEffectivePermissions()` (ya implementado en
`appointments.hooks.ts`, confirmado con los tests preexistentes de
`permission-invalidation.runtime.test.ts` para activate/end). Un 409 en
`activate`/`end`/`revoke`/`elect` no trae un `code` estable distinto de
`KERNEL_INVALID_TRANSITION` en el contrato (el singleton de CA-APP-02 y
una transición inválida comparten el mismo 409 sin discriminar) — se
normaliza por status/`isInvalidTransition` únicamente
(`describeAppointmentTransitionError`), nunca por un `code` inventado.
**Status: DONE** — tests en `test/runtime/appointments.runtime.test.ts`
(elect: éxito sin cambio de estado prematuro + oculto sin permiso;
activate: 409 singleton no aplica localmente + oculto sin permiso; end:
éxito; revoke: exige motivo antes de enviar + oculto sin permiso;
estados terminales ENDED/REVOKED no muestran ninguna acción).

## `TEMPORARY_BOUNDED_JOIN` (Autoridades / Cargos)

- `AppointmentMembershipCell`/`AppointmentMembershipOption`
  (`features/appointments/components`, `features/appointments/forms`):
  resuelven el nombre de la persona con `membershipId → membership →
  personId → person`, dos requests acotados por fila, deduplicados por
  TanStack Query — igual clase que `AuthorityRow` (Dashboard) y
  `MembershipPersonCell` (Membresías). `Appointment` no trae un nombre
  denormalizado (`kernel-openapi.yaml`).
- `AppointmentPeriodCell` (`features/appointments/components`): resuelve
  el nombre del período con `periodId → period`, un request acotado por
  fila (deduplicado si varias filas comparten período).

Ambos están bounded por el tamaño de la lista efectivamente renderizada
(el roster de una organización o los resultados filtrados de
`/appointments`), nunca por el total de membresías/períodos del sistema.

## `QUERY_PROJECTION_CANDIDATE` (Autoridades / Cargos)

- Si en el futuro se necesita un listado de cargos con nombre de persona
  ya resuelto para *toda* una organización grande (no sólo la página
  visible), o un merge server-side de `NOMINATED+ELECTED` /
  `ENDED+REVOKED` en una sola respuesta (ver la corrección de alcance en
  US-APP-02), la solución correcta es una proyección del Kernel
  (`Appointment` con `personDisplayName`/`positionName` denormalizados,
  o un `status: string[]` en `listAppointments`), no resolver cada fila
  con un hook — igual razonamiento que el `QUERY_PROJECTION_CANDIDATE`
  ya documentado para Dashboard/Membresías.

---

## Área 5 — Períodos (Fase 6)

Implementación en `src/features/periods/**`, rutas `src/app/periods/**`.
Patrón arquitectónico idéntico a Organizaciones (Fase 2), pero sin
jerarquía ni operación de mover: un período no tiene padre/hijos.
`usePeriods`/`periodsApi.list` devuelven un array plano (`listPeriods`
en kernel-openapi.yaml no tiene `PageInfo`, a diferencia de
Organizaciones/Membresías), así que la lista `/periods` no pagina.

Permisos reales confirmados contra kernel-spec.md §10.1
(`kernel.period.read/create/update/activate/close` — no existe
`kernel.period.schedule` ni `kernel.period.cancel` como códigos propios):
`createPeriod` → `kernel.period.create`; `listPeriods`/`getPeriod` →
`kernel.period.read`; `updateDraftPeriod`, `schedulePeriod` y
`cancelPeriod` → `kernel.period.update` (kernel-openapi.yaml documenta
esto explícitamente como un `(Supuesto)` para `cancelPeriod`, al no haber
un permiso dedicado); `activatePeriod` → `kernel.period.activate`;
`closePeriod` → `kernel.period.close`.

### US-PRD-01 — Listar períodos de una organización

Ruta `/periods?organization=` · Hook `usePeriods(organizationId,
status?)` · Operation real `listPeriods` → `GET
/organizations/{id}/periods?status=` (el nombre `listOrganizationPeriods`
del borrador original no existe en kernel-openapi.yaml; corregido).
Alcance organizacional: gana `?organization=` si está presente en la
URL; si no, se usa `activeOrganizationId` (vía
`useActiveOrganizationContext()`) sólo como default — nunca se escribe
de vuelta en la URL ni se llama `setActiveOrganizationId` desde esta
página. Filtro adicional por `status`. **Status: DONE**

### US-PRD-02 — Período actual

Ya usado por el Shell (`useCurrentPeriod`); vista dedicada con más
detalle en el dashboard (US-DASH-01/02) · **Status: DONE** (como parte
del dashboard; no hay ruta propia adicional prevista para esta fase)

### US-PRD-03 — Detalle de período

Ruta `/periods/[periodId]` · Hook `usePeriod(periodId)` · Nunca toca
`useActiveOrganization`/`useActiveOrganizationContext` (mismo aislamiento
que `OrganizationDetailContainer`) · Estados success/404/403 vía
`describeKernelError` · **Status: DONE**

### US-PRD-04 — Crear período (borrador)

Dialog (`CreatePeriodDialog`, dentro de la lista) · Actor con
`kernel.period.create` · Hook `useCreatePeriod()` · `organizationId` va
por path param (`POST /organizations/{id}/periods`), no en el body ·
Regla CA-PER-01/01a (1 de julio → 30 de junio del año siguiente exacto)
validada client-side con `isValidPeriodStartDate`/`isValidPeriodEndDate`
(`src/features/periods/utils/period-dates.ts`) antes de enviar — el
Kernel sigue siendo la autoridad final (422 si igual llega algo
inválido, vía `describePeriodDatesError`). **Status: DONE**

### US-PRD-05 — Editar borrador

Dialog (`EditDraftPeriodDialog`, en el detalle — no hay ruta `/edit`
separada para Períodos, a diferencia de Organizaciones) · Sólo con
`kernel.period.update` Y período en `DRAFT` (`canEditDraftPeriod`,
`src/features/periods/adapters/period-lifecycle.ts`, verificado con un
test que renderiza el diálogo sobre un período `SCHEDULED` y confirma
que no ofrece nada) · Hook `useUpdateDraftPeriod()` · Sólo envía los
campos de `UpdatePeriodRequest` (`name`/`startDate`/`endDate`; `code` y
`sequence` no son editables). **Status: DONE**

### US-PRD-06 a US-PRD-09 — Programar / Activar / Cerrar / Cancelar

Hooks `useSchedulePeriod`, `useActivatePeriod`, `useClosePeriod`,
`useCancelPeriod` (ya existían completos en
`src/lib/api/periods/periods.hooks.ts`, incluida la invalidación de
caché — ver más abajo) · Regla: máquina §7.4 exacta (`DRAFT ->
SCHEDULED`, `DRAFT -> CANCELLED`, `SCHEDULED -> ACTIVE`, `SCHEDULED ->
CANCELLED`, `ACTIVE -> CLOSED`; `CLOSED`/`CANCELLED` terminales),
reflejada 1:1 en `period-lifecycle.ts` · CA-PER-02/invariante 6.5.3 (no
dos `ACTIVE` por organización) y CA-PER-04/invariante 6.5.8 (cerrar
finaliza cargos activos en la misma transacción).

Activar: el 409 de `activatePeriod` (`InvalidTransition` en
kernel-openapi.yaml) no tiene un `code` documentado que distinga "no
está SCHEDULED" de "ya hay otro período ACTIVE" — ambas invariantes
comparten la misma respuesta, así que `describeActivatePeriodError`
(`src/features/periods/forms/period-mutation-errors.ts`) normaliza sólo
por status HTTP, nunca adivinando desde `error.detail`, y el frontend
nunca detecta/previene el conflicto de dos-ACTIVE antes de enviar (se
prueba con un test que fuerza ese 409 y verifica que el mensaje
institucional aparece, nunca el código crudo).

Cerrar es la acción más sensible (§31 del producto): el diálogo de
confirmación (`ClosePeriodDialog`) sólo lista la consecuencia que el
Kernel/spec garantizan explícitamente — finalizar los cargos activos de
la organización en la misma transacción (invariante 6.5.8) — y no
implica nada sobre Membresías, Solicitudes ni Transferencias. El
componente llama únicamente a la operación real `closePeriod`
(`useClosePeriod`); nunca invoca una mutación de Appointment
directamente — la cascada sobre cargos ocurre server-side. La
invalidación de caché que dispara el cierre (ya implementada en
`usePeriodTransitionMutation`, compartida por las 4 transiciones) es:
`periodKeys.detail(id)`, `periodKeys.lists()`,
`periodKeys.current(organizationId)`,
`appointmentKeys.currentAuthorities(organizationId)` y
`authorizationKeys.allEffectivePermissions()` — las dos últimas ya
exports públicos de `@/lib/api`, nunca importados desde
`src/features/appointments/**`. Se invalida
`allEffectivePermissions()` porque activar/cerrar un período cambia qué
cargos están `ACTIVE` y por lo tanto qué permisos efectivos tiene cada
persona en esa organización — mismo criterio que
`invalidateMembership()` en `src/lib/api/memberships/memberships.hooks.ts`
invalidando esa misma key ante un cambio de `MembershipStatus`. Probado
con un test que mockea `close` con una respuesta diferida: verifica que
el badge de estado sigue mostrando el valor viejo hasta que el mock
resuelve (sin optimistic update), que nunca se llama a ningún endpoint
`/appointments/*`, y que tras resolver hay una nueva request a
`effective-permissions` (prueba de la invalidación real).

Errores: 409 en cualquier transición inválida se muestra tal cual llega
en `error.detail` (vía `describeKernelError`), igual que
`ArchiveOrganizationDialog`. **Status: DONE**

---

## Integración Período ↔ Appointment

Ejecutado el 2026-08-09, después de que Fase 5 (Autoridades/Cargos) y
Fase 6 (Períodos) cerraran cada una por separado en dos agentes
paralelos con ownership disjunto. Objetivo: cerrarlas como un bloque
coherente sin rediseñar arquitectura — probar la integración real
(cierre de período ↔ cargos), completar navegación cruzada, auditar
ambos tracks, sin avanzar a Fase 7+.

### Ownership

Sin cambios respecto al ya establecido en cada fase — esta integración
no movió ningún archivo entre features, sólo agregó dos links y un
test a nivel raíz:

- `features/periods/**` — dueño del dominio `InstitutionalPeriod`
  completo (lifecycle, formularios).
- `features/positions/**` / `features/appointments/**` — dueños de
  `PositionDefinition`/`Appointment`.
- Ninguna de las tres importa componentes DOMAIN de las otras.
  Auditoría (grep) confirmó 0 imports reales cruzados — únicamente
  comentarios documentando la decisión de no importar (ver
  `TEMPORARY_BOUNDED_JOIN` de Autoridades/Cargos arriba).

### Navegación

- **Period → Appointment**: **faltaba**, se agregó en esta
  integración. `PeriodDetailContainer` ahora muestra un link "Ver
  cargos de este período" hacia
  `/appointments?period={periodId}&organization={organizationId}` —
  `useAppointmentListFilters` ya soportaba el filtro `period` desde
  Fase 5, sólo faltaba el link de entrada.
- **Appointment → Period**: **faltaba**, se agregó en esta
  integración. `AppointmentPeriodCell` (usada en la tabla de
  `/appointments`) mostraba el nombre del período como texto plano;
  ahora es un link a `/periods/{periodId}`.
- Ninguno de los dos muta `activeOrganizationId`.

### Cierre de período — la operación crítica de esta integración

`ClosePeriodDialog` (`features/periods/forms/close-period-dialog.tsx`)
llama únicamente a `useClosePeriod()` — nunca a una mutation de
Appointment. La cascada real (finalizar los cargos `ACTIVE` de esa
organización) ocurre server-side, en la misma transacción del Kernel
(kernel-spec.md invariante 6.5.8 / CA-PER-04). El frontend sólo confía
en la invalidación de query keys que ya vive en la capa pública
compartida (`usePeriodTransitionMutation`,
`src/lib/api/periods/periods.hooks.ts`): detail/list/current-period de
Período, `appointmentKeys.currentAuthorities(organizationId)` y
`authorizationKeys.allEffectivePermissions()` — ninguna de las dos
últimas importada desde `features/appointments/**`, son exports
públicos de `@/lib/api`.

Test dedicado agregado en esta integración:
`test/runtime/period-appointment-integration.runtime.test.ts` (vive en
la raíz de `test/runtime/`, no dentro de ninguna de las dos features,
justamente porque ninguna de las dos puede importar de la otra).
Verifica, contra un `MockBackend` real:

1. un período `ACTIVE` con un cargo `ACTIVE` vinculado;
2. se llama `useClosePeriod()` — la única mutation que el frontend
   dispara;
3. la respuesta mockeada de `POST /periods/{id}/close` modela el efecto
   transaccional real del Kernel (el cargo pasa a `ENDED` como parte
   de esa misma respuesta simulada, no de una segunda llamada);
4. `useCurrentAuthorities()` refleja el cambio sin refetch manual
   (prueba la invalidación real, no una simulación);
5. **0 llamadas** a cualquier endpoint `/appointments/*/{end,activate,
   revoke,mark-elected}` — aserción explícita de que el frontend nunca
   dispara una transición de Appointment como efecto secundario de
   cerrar un período;
6. `effective-permissions` se re-consulta (≥ 2 requests) tras el
   cierre, no queda cacheado con el valor viejo.

Complementa (no duplica) el test ya existente en
`test/runtime/permission-invalidation.runtime.test.ts` ("closing a
period... updates effective permissions"), que ya cubría el ángulo de
permisos efectivos pero no el de `useCurrentAuthorities` ni la
aserción explícita de "cero llamadas a Appointment".

### Verificación

`pnpm typecheck` / `pnpm lint` / `pnpm test` (**213/213** verdes,
suite completa del repo, todas las fases incluidas) / `pnpm build` /
`pnpm contracts:validate` — todos verdes tras agregar los dos links y
el test de integración. Auditoría de arquitectura repetida sobre
`features/positions`, `features/appointments` y `features/periods`: 0
violaciones reales.

**Integración: PASS.**

---

## Área 6 — Solicitudes de membresía (Fase 7)

Revisión previa a código (2026-08-09): la máquina real (§7.6) es

```text
DRAFT     -> SUBMITTED
DRAFT     -> CANCELLED
SUBMITTED -> APPROVED
SUBMITTED -> REJECTED
SUBMITTED -> CANCELLED
SUBMITTED -> EXPIRED
```

Esta fase corrió en paralelo con Fase 8 (Transferencias, otro track sobre
`src/features/transfers/**`) sobre el mismo working tree — sin
worktrees separados. Se evitó tocar `src/features/transfers/**`,
`src/features/persons/**`, `src/features/organizations/**`,
`src/features/memberships/**` (cerradas), `src/features/shell/use-shell-nav.ts`
y `docs/07-frontend-web.md` (el nav item y las rutas de navegación los
agrega el orquestador después, para no pisar el merge del otro track).

Hallazgos no obvios de esta revisión, verificados contra
`kernel-openapi.yaml`/`kernel-spec.md` (nunca inferidos del nombre del
hook):

- **`EXPIRED` es un valor real de `ApplicationStatus` sin operación de
  transición manual.** El enum lo incluye, pero no existe
  `POST /membership-applications/{id}/expire` (ni ningún otro operationId
  que transicione a `EXPIRED`) en `kernel-openapi.yaml`. La UI nunca
  ofrece un botón "Expirar" en ningún estado — `application-lifecycle.ts`
  no tiene `canExpireApplication`, y hay un test negativo explícito
  (`EXPIRED — no "Expirar" action is ever offered...`) que barre los seis
  valores del enum con permisos completos y confirma que ningún control
  de ese nombre se renderiza nunca.
- **`CreateMembershipApplicationRequest` no tiene `personId`.** A
  diferencia de `CreateMembershipDialog` (Membresías, que crea una
  membresía para otra persona), `createMembershipApplication` usa
  `x-required-permission: kernel.application.create.self` — el
  solicitante siempre es el actor autenticado. `CreateApplicationDialog`
  nunca ofrece un selector de persona.
- **`submitMembershipApplication` reutiliza el permiso de create.**
  `kernel-openapi.yaml` le asigna `kernel.application.create.self`, el
  mismo que `createMembershipApplication` — no es un typo del contrato
  copiado por error, `SubmitApplicationDialog` lo gatea así
  deliberadamente.
- **`GET /membership-applications` devuelve `MembershipApplication[]`
  plano, sin paginación.** No hay `cursor`/`limit`/`pageInfo` en el
  contrato (a diferencia de `MembershipPage` en Membresías) —
  `ApplicationsTable` nunca se envuelve en `DataPagination` del
  admin-shell; eso sería inventar un contrato de paginación que el
  Kernel no ofrece para este recurso. Es una característica real del
  contrato, no un gap a resolver.
- **`listMembershipApplications` tiene dos niveles de permiso reales,
  documentados en la propia descripción del operation:** con
  `kernel.application.review` el actor ve solicitudes de terceros; sin
  ese permiso, `kernel.application.read.self` limita el resultado a las
  propias y el filtro `personId` se ignora (el Kernel lo fuerza al
  actor). Por eso `useApplicationListFilters` acepta leer/escribir
  `organization`/`status` en la URL, pero deliberadamente **no** expone
  un control de filtro "persona" en el toolbar — ofrecerlo a cualquier
  actor sería engañoso, ya que para la mayoría no haría nada. Esto
  difiere del pedido original que sugería `?person=` como filtro de UI;
  se documenta acá como una simplificación consciente, no un olvido.
- **`organizationId` es opcional en `listMembershipApplications` — a
  diferencia de `listOrganizationMemberships`, no forma parte de la URL
  como segmento de ruta.** Por eso `ApplicationsListContainer` sigue la
  misma regla de resolución de scope que Membresías (`?organization=`
  explícito gana; si no, `activeOrganizationId` como default, nunca
  mutado) pero **no** bloquea el render con un `DataState` de "Elegí una
  organización" cuando ninguno de los dos resuelve — a diferencia de
  Membresías, listar sin organización sigue siendo una operación válida
  del contrato (por ejemplo, un actor de sólo `read.self` viendo sus
  propias solicitudes across-org). Crear una solicitud sí sigue
  necesitando una organización concreta, así que el botón "Solicitar
  ingreso" sólo se renderiza cuando `organizationId` resuelve a algo.

Con estas precisiones, las 7 historias pasan a `READY`.

### US-SOL-01 — Listar solicitudes

Ruta `/applications?organization=&status=` (sin `?person=`, ver nota
arriba) · Hook `useMembershipApplications(filters)` (ya existente en
`@/lib/api`, auditado — no requirió cambios) · Operation
`listMembershipApplications` → `GET
/membership-applications?organizationId=&personId=&status=` · Response
`MembershipApplication[]` (**array plano, sin cursor** — confirmado en
`client/schema.ts`; no se usa `DataPagination`) · Filtros
`organization`/`status` en URL; `organization` explícito en query param
manda sobre `activeOrganizationId` (default únicamente, nunca mutado) ·
Columnas: solicitante (resuelto por fila, `TEMPORARY_BOUNDED_JOIN` vía
`usePerson`, mismo patrón que `MembershipPersonCell` — una request por
`requesterPersonId` distinto en la página actual, deduplicada por el
cache de TanStack Query, acotada por cuántas solicitudes trajo el array
plano, nunca por el total), estado, fecha de envío (`submittedAt`),
acción → detalle · Estados: loading, empty, error, forbidden, success ·
**Status: DONE**

### US-SOL-02 — Detalle de solicitud

Ruta `/applications/[applicationId]` · Hook
`useMembershipApplication(id)` · Operation `getMembershipApplication` →
`GET /membership-applications/{id}` · Response `MembershipApplication` ·
Muestra solicitante (`usePerson`, único request extra — no es el patrón
per-row de la lista), organización (`useOrganization`), estado, mensaje,
fechas de envío/revisión, motivo de rechazo si existe, y un link a la
membresía resultante (`membershipId`) cuando la solicitud fue aprobada —
nunca duplica datos de la membresía acá, sólo apunta a
`/memberships/[id]` · Estados: loading, 404, 403, error, success ·
**Status: DONE**

### US-SOL-03 — Crear solicitud propia

`CreateApplicationDialog` (requiere `organizationId` del caller, sin
selector de persona — ver nota arriba) · Actor con
`kernel.application.create.self` · Hook
`useCreateMembershipApplication()` · Operation
`createMembershipApplication` → `POST /membership-applications` ·
Request `CreateMembershipApplicationRequest`: `organizationId`
(requerido, viene del contexto de la página, nunca elegido en el
formulario) y `message` (opcional) · Regla: invariante 6.8.1/6.8.2 (una
solicitud abierta por persona/organización; una persona ya activa no
puede solicitar de nuevo) — la UI no hace un request de verificación
previo, deja que el Kernel sea la única fuente de verdad · Errores: 409
→ "Ya tenés una solicitud abierta para esta organización." · Mutation:
sí, sin optimistic update · Invalida vía `applications.hooks.ts` (ya
implementado) · **Status: DONE**

### US-SOL-04 — Enviar (submit)

`DRAFT -> SUBMITTED` · Hook `useSubmitMembershipApplication()` ·
Operation `submitMembershipApplication` → `POST
/membership-applications/{id}/submit` · Permiso
`kernel.application.create.self` (mismo que create, ver nota arriba) ·
Sin body · Error 409 `KERNEL_INVALID_TRANSITION` · **Status: DONE**

### US-SOL-05 — Aprobar

`SUBMITTED -> APPROVED` · Actor con `kernel.application.review` · Hook
`useApproveMembershipApplication()` · Operation
`approveMembershipApplication` → `POST
/membership-applications/{id}/approve` · Regla: CA-SOL-02/invariante
6.8.3-4 (aprobar crea/reactiva membresía **dentro del Kernel**, misma
transacción) — `ApproveApplicationDialog` llama únicamente a
`useApproveMembershipApplication()`, nunca a `useCreateMembership()` ni
`useReactivateMembership()`; verificado con un test que espía
`backend.kernelCalls` y confirma que la única mutación disparada es
`POST .../approve` (nunca `/memberships/*`) · La invalidación de cache
(`membershipsAffected: true`, ya implementada en `applications.hooks.ts`)
refresca membership lists/detail y `authorizationKeys.allEffectivePermissions()`
· Error 409 · **Status: DONE**

### US-SOL-06 — Rechazar

`SUBMITTED -> REJECTED` · Actor con `kernel.application.review` · Hook
`useRejectMembershipApplication()` · Operation
`rejectMembershipApplication` → `POST
/membership-applications/{id}/reject` · Regla: CA-SOL-03/invariante
6.8.5 (`rejectionReason` `required` en el schema) —
`RejectApplicationDialog` nunca deja que un motivo vacío llegue a la
mutación: `onConfirm` marca el campo como tocado y corta en seco si el
valor recortado está vacío, mostrando "El motivo es obligatorio." en vez
de invocar `reject.mutate` (además de lo que el Kernel también
rechazaría) · Error 409 · **Status: DONE**

### US-SOL-07 — Cancelar

`{DRAFT, SUBMITTED} -> CANCELLED` · Actor con
`kernel.application.cancel.self` · Hook
`useCancelMembershipApplication()` · Operation
`cancelMembershipApplication` → `POST
/membership-applications/{id}/cancel` · Regla: invariante 6.8.6 (sólo se
cancela desde `DRAFT` o `SUBMITTED`) — `canCancelApplication` en
`application-lifecycle.ts` nunca devuelve `true` para
`APPROVED`/`REJECTED`/`CANCELLED`/`EXPIRED`, verificado con un test
explícito que recorre esos cuatro estados con permisos completos y
confirma que "Cancelar solicitud" nunca se renderiza · Error 409 ·
**Status: DONE**

Para las cuatro transiciones (submit/approve/reject/cancel): mutation
sin optimistic update (botón deshabilitado + "Procesando…" mientras
`isPending`, estado visible anterior se mantiene hasta el success real);
409 `KERNEL_INVALID_TRANSITION` → "Esta solicitud no puede pasar a ese
estado en este momento.", sin retry automático ni transición alternativa
(`describeApplicationTransitionError` en
`forms/application-mutation-errors.ts`).

### Verificación de cierre — Fase 7 (Solicitudes)

Ejecutado el 2026-08-09 sobre `apps/mirotaract-web`. Esta fase corrió en
paralelo con Fase 8 (Transferencias, otro track sobre
`src/features/transfers/**`) — mismo repo compartido para
typecheck/test, cada hallazgo se atribuye a su track real.

- **`pnpm typecheck`** (`tsc --noEmit`): exit 0, sin errores, sobre todo
  el proyecto (incluye los tracks en curso de Autoridades/Cargos y
  Transferencias).
- **`pnpm lint`** (`prettier --check src`): al arrancar esta fase, 33
  archivos ya reportaban issues de formato — todos fuera de este track
  (`src/features/appointments/**`, `src/features/positions/**`,
  `src/features/transfers/**`, tracks en curso de otros agentes en el
  mismo working tree). De los archivos propios de esta fase, dos tenían
  formato pendiente (`forms/create-application-dialog.tsx`,
  `forms/reject-application-dialog.tsx`); se corrigieron con
  `prettier --write` acotado a esos dos archivos (nunca `--write` sobre
  todo `src`, para no tocar el trabajo en curso del otro track). Un
  `prettier --check` acotado a `src/features/applications/**`,
  `src/app/applications/**` y el test runtime de esta fase: **All
  matched files use Prettier code style!**
- **`pnpm test`** — archivo propio
  (`test/runtime/applications.runtime.test.ts`, 20 tests: listar
  (loading/empty/success/403/filtro status/filtro organization explícito
  ganando a `activeOrganizationId`), detalle
  (success/404/403), crear (success con `CreateMembershipApplicationRequest`
  exacto/409 duplicado), enviar (DRAFT→SUBMITTED/gate por
  status/409), aprobar (SUBMITTED→APPROVED/gate por permiso/verificación
  de que la única mutación de red es `approve`, nunca `/memberships/*`),
  rechazar (motivo vacío bloquea sin request/motivo presente manda
  `{rejectionReason}`), cancelar (ofrecido sólo desde DRAFT/SUBMITTED,
  nunca desde los cuatro estados restantes), y el negativo de `EXPIRED`
  (ningún botón "Expirar" en ningún estado): **20/20 pass**. Suite
  completa (`pnpm test`, 189 tests): **175 pass, 14 fail** — las 14
  fallas están todas en `appointments.runtime.test.ts` (4),
  `positions.runtime.test.ts` (4) y `transfers.runtime.test.ts` (6),
  tracks de otros agentes en curso en el mismo working tree; ninguna
  falla está en `applications.runtime.test.ts`, `memberships.runtime.test.ts`,
  `organizations.runtime.test.ts`, `persons.runtime.test.ts`,
  `persons-memberships.integration.test.ts`, `dashboard.runtime.test.ts`
  ni en los tests de infraestructura (`bootstrap`/auth/service-boundary).
- **`pnpm build`**: no ejecutado en este track a propósito — corre el
  orquestador al final, para no colisionar con el build del track de
  Transferencias sobre el mismo `.next/`.
- **Auditoría de arquitectura** (`grep` sobre
  `src/features/applications/**`): 0 resultados para `fetch(`, `axios`,
  imports de `client/`/`*.api`/`schema`, `@prisma`, `kernel-sdk`,
  `/service/`, `isPresident`, `Membership.title`; 0 llamadas a
  `useCreateMembership`/`useActivateMembership`/`useReactivateMembership`
  ni ninguna mutation de Membresías (sólo lectura vía `usePerson`/
  `useOrganization`, ambos hooks públicos de `@/lib/api`); 0 imports de
  `features/persons/**`, `features/organizations/**`,
  `features/memberships/**`, `features/transfers/**`.

---

## Área 7 — Transferencias (Fase 8)

Revisión previa a código (2026-08-09): la máquina real (§7.7) es

```text
REQUESTED               -> ACCEPTED_BY_DESTINATION
REQUESTED               -> REJECTED
REQUESTED               -> CANCELLED
REQUESTED               -> EXPIRED

ACCEPTED_BY_DESTINATION -> CONFIRMED_BY_ORIGIN
ACCEPTED_BY_DESTINATION -> REJECTED
ACCEPTED_BY_DESTINATION -> CANCELLED
ACCEPTED_BY_DESTINATION -> EXPIRED

CONFIRMED_BY_ORIGIN     -> COMPLETED
CONFIRMED_BY_ORIGIN     -> REJECTED
CONFIRMED_BY_ORIGIN     -> CANCELLED
CONFIRMED_BY_ORIGIN     -> EXPIRED
```

`EXPIRED` es un valor real de `TransferStatus`, pero
`kernel-openapi.yaml` no documenta ninguna operación de transición
manual hacia él (no hay `POST .../expire`) — la UI nunca ofrece un
botón "Expirar", sólo muestra el estado si el Kernel lo entrega así
(cubierto con un test negativo explícito).

Hallazgos no obvios de esta revisión:

- **Gap real de invalidación de cache, corregido en la capa pública**
  (única excepción a "no tocar otras features" — mismo criterio que el
  fix de paginación cursor de `useOrganizationMemberships` en Fase 4):
  `useCompleteMembershipTransfer()` (`src/lib/api/transfers/transfers.hooks.ts`)
  invalidaba `membershipKeys`/`authorizationKeys` al completar pero
  **no** invalidaba ninguna cache de Appointments/autoridades, pese a
  que la invariante 6.9.5 garantiza que completar finaliza cargos
  activos incompatibles en la organización origen dentro de la misma
  transacción del Kernel. Se agregó, dentro de `invalidateTransfer`
  cuando `membershipsAffected: true`:
  `queryClient.invalidateQueries({ queryKey: appointmentKeys.currentAuthorities(transfer.fromOrganizationId) })`
  y `queryClient.invalidateQueries({ queryKey: appointmentKeys.lists() })`
  (import agregado: `appointmentKeys` desde `../appointments/appointments.keys`,
  mismo patrón relativo que ya usa el archivo para `membershipKeys`/
  `authorizationKeys`). Sin esto, una pantalla de "autoridades vigentes"
  de la organización origen podía quedar desactualizada después de
  completar una transferencia hasta un refetch no relacionado.
  Verificado con test dedicado contra un `QueryClient` real (mismo
  patrón que el test de invalidación de `effectivePermissions` en Fase
  4).
- **Permisos `complete`/`cancel` reutilizados, ya resueltos en el
  contrato — no es una ambigüedad de esta fase.** `kernel-spec.md`
  §10.1 sólo define `kernel.transfer.create.self`,
  `kernel.transfer.read.self`, `kernel.transfer.accept`,
  `kernel.transfer.confirm`, `kernel.transfer.reject`. `kernel-openapi.yaml`
  documenta explícitamente los dos supuestos sobre las operaciones que
  no tienen permiso propio: `completeMembershipTransfer` reutiliza
  `kernel.transfer.confirm` ("por ser la misma autoridad de origen
  quien completa") y `cancelMembershipTransfer` reutiliza
  `kernel.transfer.create.self` ("por ser el solicitante quien cancela
  su propia solicitud") — mismo precedente que el permiso `activate`
  reutilizado para `deactivate` en Organizations (Fase 2).
- **Gate por scope, no sólo por permiso — accept/confirm/complete son
  de un solo lado, nunca "el permiso en general".** `accept` es una
  acción de la organización DESTINO — gateada con
  `useCan("kernel.transfer.accept", {scopeType:"ORGANIZATION",
  scopeId: transfer.toOrganizationId})`. `confirm`/`complete` son de la
  organización ORIGEN — gateadas con `scopeId: transfer.fromOrganizationId`.
  Verificado con tests explícitos de "permiso otorgado en el scope
  equivocado no habilita el botón" para accept y para confirm.
- **`cancel` es un permiso `.self`, nunca organization-scoped — mismo
  patrón que `kernel.person.update.self` en `PersonActionsRow`
  (Personas, US-PER-04).** `CancelTransferDialog` gatea con
  `useCan("kernel.transfer.create.self")` (sin scope) ANDeado con una
  verificación de identidad real (`currentUser.personId ===
  transfer.requestedById`), nunca sólo el permiso — cubierto con un
  test explícito de que la transferencia de otra persona nunca ofrece
  el botón, aunque el permiso esté otorgado.
- **`reject` no tiene restricción de scope documentada en
  `kernel-openapi.yaml`** (a diferencia de accept/confirm, cuyas
  descripciones de operación sí atan explícitamente destino/origen) —
  se interpreta que una autoridad de cualquiera de los dos lados puede
  frenar la transferencia, así que `RejectTransferDialog` chequea el
  permiso en AMBOS scopes (`fromOrganizationId` OR `toOrganizationId`).
  Documentado como decisión de diseño explícita, no un hallazgo de
  contrato — el openapi simplemente no lo especifica.
- **`GET /membership-transfers` devuelve `MembershipTransfer[]` plano,
  sin `pageInfo`/`cursor`** (kernel-openapi.yaml) — `TransfersTable` no
  usa `DataPagination` del admin-shell, a diferencia de
  `MembershipsTable` (Fase 4).
- **No hay endpoint "mis membresías"** — el picker de "tu membresía"
  en `RequestTransferDialog` (US-TRA-03) se resuelve con
  `useCurrentUser().memberships` (`UserContext.memberships`, ya expone
  `membershipId`/`organizationId`/`status`), el mismo campo que
  `features/shell/use-organization-options.ts` ya usa para "mis
  organizations" — nunca un request de listado de membresías nuevo.
- **`MembershipTransfer` no tiene un array de historial** (a diferencia
  de `Membership`/`MembershipTransition`) — sólo pares
  timestamp+actor por paso directamente en el recurso
  (`acceptedAt`/`acceptedById`, etc). `TransferWorkflowTimeline`
  reconstruye la lista de pasos a partir de los campos realmente
  presentes, ordenados ascendente por timestamp — nunca muestra un
  paso cuyo campo de fecha sea `null`. Para `EXPIRED` no existe un
  campo `expiredAt` dedicado (sólo `expiresAt`, el plazo, no el
  evento); se usa `updatedAt` como aproximación documentada, nunca un
  timestamp inventado.

Con estas precisiones, las 8 historias pasan a `READY`.

### US-TRA-01 — Listar transferencias

Ruta `/transfers?membership=&from=&to=&status=` · Actor con
`kernel.transfer.read.self` · Hook `useMembershipTransfers(filters)` ·
Operation `listMembershipTransfers` → `GET
/membership-transfers?membershipId=&fromOrganizationId=&toOrganizationId=&status=`
· Response `MembershipTransfer[]` (**array plano, sin cursor** — ver
nota de revisión arriba) · Filtros `from`/`to`/`status` con selects
sobre `useTransferOrganizationCandidates()` (primera página de
organizaciones `ACTIVE`, mismo patrón que `useOrganizationCandidates`
de Membresías); `membership` sólo vía deep link en la URL (sin picker
dedicado en el toolbar — no hay un catálogo acotado razonable para
buscarlo). A diferencia de `/memberships`, esta lista **no** tiene una
historia de "organización activa por defecto": los tres filtros de
organización/estado son independientes y opcionales, nunca
derivados de `activeOrganizationId` — pedir una transferencia sólo
requiere `kernel.transfer.create.self`, un permiso `.self`, nunca
organization-scoped. Columnas: persona (resuelta vía
`TransferPersonCell`, encadena `useMembership`→`usePerson`), origen,
destino (ambas vía `TransferOrganizationCell`), estado, fecha de
solicitud, acción → detalle · Resolución de persona/organizaciones:
`TEMPORARY_BOUNDED_JOIN`, acotada por cuántas transferencias hay en la
página actual, deduplicada por TanStack Query (mismo patrón que
Membresías/Solicitudes) · Estados: loading, empty, error, forbidden,
success, filtros · **Status: DONE**

### US-TRA-02 — Detalle + workflow visual

Ruta `/transfers/[transferId]` · Hook `useMembershipTransfer(id)` ·
Operation `getMembershipTransfer` → `GET
/membership-transfers/{transferId}` · Response `MembershipTransfer` ·
`TransferSummaryCard` (persona, estado actual, ambas organizaciones
con link, fecha de solicitud, motivo, link a la membresía destino si
`destinationMembershipId` existe) + `TransferWorkflowTimeline`
(componente DOMAIN en `features/transfers/components`, nunca se mueve
al Design System — mismo criterio que `MembershipHistoryTimeline`,
Fase 4): reconstruye `REQUESTED → ACCEPTED_BY_DESTINATION →
CONFIRMED_BY_ORIGIN → COMPLETED` (y las ramas `REJECTED`/`CANCELLED`/
`EXPIRED` cuando corresponda) a partir de los campos timestamp+actor
reales del recurso, ordenados ascendente — nunca un estado inventado
(ver nota de revisión). Cada paso muestra un encabezado de acción
(p. ej. "Transferencia solicitada") deliberadamente distinto del label
de su Badge de estado (p. ej. "Solicitada") para no duplicar el mismo
texto dos veces por paso — mismo criterio que
`membershipTransitionToLabel` vs `membershipStatusToLabel` en
`MembershipHistoryTimeline` · Estados: loading, 404, 403, error,
success con orden ascendente verificado · **Status: DONE**

### US-TRA-03 — Solicitar transferencia

`RequestTransferDialog` (disparado desde `/transfers`) · Actor con
`kernel.transfer.create.self` · Hook `useRequestMembershipTransfer()`
· Operation `requestMembershipTransfer` → `POST /membership-transfers`
· Request `RequestMembershipTransferRequest`: `membershipId` +
`toOrganizationId` (ambos requeridos) + `reason` (opcional, se omite
del body si está vacío, nunca se manda `""`) · Picker de "tu
membresía": sólo las membresías `ACTIVE` propias
(`useOwnActiveMemberships()`, vía `useCurrentUser().memberships` — ver
nota de revisión, invariante 6.9.1) · Picker de organización destino:
vacío hasta elegir la membresía, luego excluye la organización de
origen (invariante 6.9.2) — ambos pickers sólo *guían* la UX, el
Kernel es la autoridad real · Error 409 → "Ya existe una transferencia
abierta para esta membresía." (invariante 6.9.3, `describeRequestTransferError`)
· Mutation: sí, sin optimistic update, navega a `/transfers/[id]` en
éxito · **Status: DONE**

### US-TRA-04 — Aceptar (destino)

`REQUESTED -> ACCEPTED_BY_DESTINATION` · `AcceptTransferDialog` ·
Actor con `kernel.transfer.accept` **scopeado a
`transfer.toOrganizationId`** (ver nota de revisión — nunca el permiso
"en general") · Hook `useAcceptTransferByDestination()` · Operation
`acceptTransferByDestination` → `POST
/membership-transfers/{transferId}/accept`, sin body · Error 409
`KERNEL_INVALID_TRANSITION` · Verificado con test explícito: el
permiso otorgado en la organización origen (el lado equivocado) nunca
habilita el botón · **Status: DONE**

### US-TRA-05 — Confirmar (origen)

`ACCEPTED_BY_DESTINATION -> CONFIRMED_BY_ORIGIN` ·
`ConfirmTransferDialog` · Actor con `kernel.transfer.confirm`
**scopeado a `transfer.fromOrganizationId`** · Hook
`useConfirmTransferByOrigin()` · Operation `confirmTransferByOrigin` →
`POST /membership-transfers/{transferId}/confirm`, sin body · Error
409 · Verificado con test explícito: el permiso otorgado en la
organización destino (el lado equivocado) nunca habilita el botón ·
**Status: DONE**

### US-TRA-06 — Completar

`CONFIRMED_BY_ORIGIN -> COMPLETED` · `CompleteTransferDialog` · Actor
con `kernel.transfer.confirm` reutilizado (ver nota de revisión),
scopeado a `transfer.fromOrganizationId` — completar sigue siendo una
acción del lado origen · Hook `useCompleteMembershipTransfer()` ·
Operation `completeMembershipTransfer` → `POST
/membership-transfers/{transferId}/complete`, sin body · Regla:
CA-TRA-04/05/6.9.5/6.9.6 — el frontend **no** actualiza membresía
origen/destino ni cargos manualmente (nunca llama
`useDeactivateMembership()`/`useCreateMembership()`/
`useEndAppointment()`/`useRevokeAppointment()` desde este flujo);
sólo ejecuta la mutation y confía en que el Kernel hace todo en una
transacción, y en la invalidación (`membershipsAffected: true`, con el
fix de Appointments de la nota de revisión) para reflejar el
resultado. Verificado con test que espía `backend.kernelCalls` y
confirma que la única mutation emitida es `POST .../complete` — cero
llamadas a `/memberships/*` o `/appointments/*` · **Status: DONE**

### US-TRA-07 — Rechazar

`{REQUESTED, ACCEPTED_BY_DESTINATION, CONFIRMED_BY_ORIGIN} -> REJECTED`
· `RejectTransferDialog` · Actor con `kernel.transfer.reject` en
`fromOrganizationId` **o** `toOrganizationId` (ver nota de revisión —
sin restricción de scope documentada en el contrato) · Hook
`useRejectMembershipTransfer()` · Operation `rejectMembershipTransfer`
→ `POST /membership-transfers/{transferId}/reject`, body
`{ rejectionReason }` **requerido** (invariante 6.9.7) — a diferencia
de `DeactivateMembershipDialog` (Fase 4), este diálogo bloquea el
submit por completo con un motivo vacío, nunca manda
`{rejectionReason: ""}`. Verificado con test: motivo vacío no emite
ningún request; motivo real manda exactamente `{ rejectionReason }` ·
**Status: DONE**

### US-TRA-08 — Cancelar

`{REQUESTED, ACCEPTED_BY_DESTINATION, CONFIRMED_BY_ORIGIN} -> CANCELLED`
· `CancelTransferDialog` · Actor con `kernel.transfer.create.self`
reutilizado (ver nota de revisión) — permiso `.self` sin scope de
organización, ANDeado con `currentUser.personId ===
transfer.requestedById` (nunca sólo el permiso). Hook
`useCancelMembershipTransfer()` · Operation
`cancelMembershipTransfer` → `POST
/membership-transfers/{transferId}/cancel`, sin body · Error 409 ·
Verificado con test explícito: la transferencia de otra persona nunca
ofrece el botón, aunque el permiso esté otorgado · **Status: DONE**

Para las cinco transiciones: mutation sin optimistic update (estado
visible anterior se mantiene hasta success; botón deshabilitado +
"Procesando…" mientras pending); 409 `KERNEL_INVALID_TRANSITION` →
"Esta transferencia no puede pasar a ese estado en este momento.", sin
retry automático ni transición alternativa
(`describeTransferTransitionError`). `getAvailableTransferActions(status)`
en `features/transfers/adapters/transfer-lifecycle.ts` reproduce
exactamente la máquina de arriba — el Kernel revalida cada transición
igual. Ningún botón "Expirar" existe en ningún lugar del código
(verificado con test negativo explícito sobre una transferencia
`EXPIRED` con todos los permisos otorgados).

### Verificación de cierre — Fase 8 (Transferencias)

Ejecutado el 2026-08-09 sobre `apps/mirotaract-web`. Esta fase corrió
en paralelo con Fase 7 (Solicitudes de membresía, otro track sobre
`src/features/applications/**`) y con trabajo en curso de otro agente
sobre Fase 5 (Autoridades/Cargos, `src/features/appointments/**` /
`test/runtime/appointments.runtime.test.ts`) — mismo repo compartido
para typecheck/test, cada hallazgo se atribuye a su track real.

- `pnpm typecheck` (`tsc --noEmit`) — **verde, 0 errores**, repo
  completo (incluye el trabajo en curso de Fase 7 y Fase 5 que corría
  en paralelo).
- `pnpm lint` (`prettier --check src`) — verde.
- `pnpm test` (`tsx --test`, suite completa) — `test/runtime/transfers.runtime.test.ts`
  corrido en aislamiento: **19/19 verdes** (listado
  loading/empty/success/403/filtro de estado con `?status=` explícito
  desde la URL; detalle success con el workflow timeline en orden
  ascendente verificado explícitamente/404/403; solicitar success con
  `RequestMembershipTransferRequest` exacto y navegación al detalle
  nuevo/409 duplicado; aceptar con transición real y test explícito de
  scope equivocado (permiso en origen no habilita el botón de
  destino); confirmar con transición real y test explícito de scope
  equivocado (permiso en destino no habilita el botón de origen);
  completar con test de que la única mutation emitida es
  `POST .../complete` sin ninguna llamada a `/memberships/*` o
  `/appointments/*`, más un test dedicado de que completar invalida
  `appointmentKeys.currentAuthorities(fromOrganizationId)` y
  `appointmentKeys.lists()` contra un `QueryClient` real; rechazar con
  motivo vacío bloqueando el submit y motivo real mandando el body
  exacto; cancelar con el solicitante cancelando lo propio y un test
  explícito de que la transferencia de otra persona nunca ofrece el
  botón aunque el permiso esté otorgado; y un test negativo de que
  `EXPIRED` nunca ofrece ningún botón de transición, incluida
  "Expirar"). Suite completa corrida dos veces: la primera con
  **206/210** verdes, las 4 fallas todas en
  `test/runtime/appointments.runtime.test.ts` (Fase 5, fuera de
  alcance de este track — `src/features/appointments/**` no se tocó
  acá) con errores de "multiple elements"/"unable to find" típicos de
  una suite en curso de otro agente editando ese mismo archivo en
  simultáneo sobre el working tree compartido (sin worktrees
  separados); la segunda corrida (unos minutos después) mostró sólo
  2 de esas mismas 4 fallas, confirmando que es un archivo en
  movimiento de otro track y no un fallo determinístico de este.
  Corrida de verificación aislando exactamente ese archivo
  (`ls test/runtime/*.test.ts | grep -v appointments`, todo lo demás
  incluido): **189/189 verdes** — nada de lo que toca esta fase (ni lo
  que ya estaba verde de Fases 1-4 y 6-7) se rompió.
- Auditoría de arquitectura sobre `src/features/transfers` (grep): 0
  ocurrencias de `fetch(`, `axios`, imports de `client/`/`*.api`/
  `schema`, `@prisma`, `kernel-sdk`, `/service/`, `isPresident`,
  `Membership.title`, y 0 llamadas a mutations de Membership/
  Appointment (`useDeactivateMembership`, `useCreateMembership`,
  `useEndAppointment`, `useRevokeAppointment` — ninguna aparece; sólo
  lectura vía `useMembership`/`useCurrentAuthorities`, ambos públicos,
  no usados actualmente pero permitidos). 0 imports de
  `features/persons/**`, `features/organizations/**`,
  `features/memberships/**`, `features/applications/**` — las únicas
  menciones de esas rutas son comentarios documentando la decisión de
  no importar de ahí (duplicación local deliberada, product spec §32).
- No se corrió `pnpm build` en este track (coordinación con el
  orquestador — riesgo de colisión con builds concurrentes de otros
  tracks sobre el mismo `.next/` compartido, igual que se documentó en
  cierres anteriores).

**Efecto colateral documentado** (no es una desviación de alcance,
es la corrección de un gap real de la capa pública, mismo criterio que
la conversión `useQuery`→`useInfiniteQuery` de Fase 4):
`useCompleteMembershipTransfer()` en
`src/lib/api/transfers/transfers.hooks.ts` ahora también invalida
`appointmentKeys.currentAuthorities(transfer.fromOrganizationId)` y
`appointmentKeys.lists()` al completar una transferencia — único
archivo fuera de `features/transfers/**` tocado en esta fase, tal como
autorizaba el encargo. No cambia la forma de ningún dato existente
(sigue siendo el mismo `MembershipTransfer` de respuesta), así que no
rompe ningún consumidor existente fuera de esta fase.

**`QUERY_PROJECTION_CANDIDATE` (Transferencias):**

- **Nombre de persona/organizaciones en listado/detalle/timeline.**
  `MembershipTransfer` sólo expone `membershipId`/
  `fromOrganizationId`/`toOrganizationId`/`requestedById`/etc, sin
  datos denormalizados. Se resuelve con `TransferPersonCell`
  (`useMembership`→`usePerson`, encadenado) y
  `TransferOrganizationCell` (`useOrganization`), deduplicados por
  TanStack Query, acotados por cuántas transferencias hay en la
  página/detalle actual. Candidato futuro: proyecciones
  `personName`/`fromOrganizationName`/`toOrganizationName` en
  `MembershipTransfer`, o un endpoint de resolución batch por ids.
- **No hay campo `expiredAt` en `MembershipTransfer`.** Sólo
  `expiresAt` (el plazo). Documentado como hallazgo de contrato (no
  un `QUERY_PROJECTION_CANDIDATE` real): `TransferWorkflowTimeline`
  usa `updatedAt` como aproximación explícita para el paso `EXPIRED`,
  nunca un timestamp inventado.

Fase 8 (Transferencias) queda **DONE y verde** dentro de su propio
alcance. Por regla de gate (§39 del producto), no se avanzó a ningún
módulo fuera de Fase 8 (ni Fase 5 ni Fase 6) durante este track.

---

## Área transversal — Auth / Access

Cierre de autenticación, acceso inicial, recuperación de acceso,
aceptación de invitaciones/creación de cuenta, logout/session UX y la
página pública `/`. A diferencia de las Áreas 0–7 (rutas protegidas
detrás de `AuthGate`), esta área cubre las rutas *públicas* de
`apps/mirotaract-web` — ver también "Rutas públicas (Auth / Access)" y
"Ciclo de vida de `AuthStatus` y redirects" en
[`docs/07-frontend-web.md`](07-frontend-web.md).

Arquitectura preexistente que se preservó sin reemplazo (BFF con access
token en memoria, refresh token httpOnly server-side, refresh
single-flight, `AuthStatus` de tres estados, limpieza de Query Cache al
quedar `UNAUTHENTICATED`) — nada de NextAuth/Auth.js/Clerk/Supabase
Auth/Firebase Auth ni tokens en `localStorage`.

### AUTH-01 — Login

Ruta `/login` · Actor: visitante sin sesión válida (o con una sesión
que expiró) · Hook: `useLogin()` · La sesión se resuelve **vía el BFF**
(`POST /api/auth/login`, `src/app/api/auth/login/route.ts`), nunca
contra el Kernel directo — el frontend nunca ve `POST /auth/login` del
Kernel ni el `refreshToken` que ese endpoint devuelve · Request:
`LoginRequest` (`email`, `password` — el contrato no ofrece un
identificador alternativo tipo username) · Response del BFF:
`{ accessToken, tokenType, expiresIn }` (el `refreshToken` queda en la
cookie httpOnly, nunca llega al componente) · Regla Kernel: access
token vive 10 min (`bearerAuth`); `401` no distingue "credenciales
inválidas" de "cuenta no verificada" (mismo código, sin campo `code`
que los separe) — mostrar un único mensaje genérico es deliberado, no
un gap, para no facilitar account enumeration (product spec §15); `423`
cuenta bloqueada por intentos fallidos; `429` rate limit · Estados UI:
idle, submitting, error, authenticated · Errores visibles: `401` → "Las
credenciales ingresadas no son válidas."; `423` → "Esta cuenta está
bloqueada por intentos fallidos."; `429`/network/5xx → mensaje acorde
(`describeLoginError`, `features/auth/adapters/auth-mutation-errors.ts`)
· Redirect: éxito → `resolveSafeNext(searchParams.get("next"))` o
`/dashboard`; un visitante ya `AUTHENTICATED` que entra a `/login` es
redirigido de inmediato, sin ver el formulario · Security: nunca llama
al Kernel directo (regla arquitectónica); no reintentos automáticos de
login ante `429`/red · **Status: DONE**

### AUTH-02 — Session bootstrap

Sin ruta propia — `SessionBootstrap` (`src/lib/api/auth/
session-bootstrap.tsx`) se monta una vez en `app/providers/
query-provider.tsx` · Actor: cualquier visitante al cargar/recargar la
app · API: `POST /api/auth/refresh` (BFF), disparado automáticamente al
montar, sin hook público de componente · Regla: `AuthStatus` arranca en
`BOOTSTRAPPING` y no dispara ningún request protegido hasta resolver a
`AUTHENTICATED`/`UNAUTHENTICATED` — verificado con un test dedicado que
comprueba que `GET /auth/me` no se llama antes de que el refresh
resuelva · Estados: `BOOTSTRAPPING` → `AUTHENTICATED` (refresh
exitoso) / `UNAUTHENTICATED` (cookie ausente o refresh rechazado) ·
Redirect: ninguno directo — los consumidores de `useAuthStatus()`
(`AuthGate`, `LoginContainer`, `HomeContainer`, etc.) deciden qué
mostrar en cada estado · Security: el refresh token nunca llega al
navegador (cookie `httpOnly`, `secure` en producción, `sameSite:
strict`) · **Status: DONE**

### AUTH-03 — Logout

Acción desde `AccountMenu` (`features/shell/account-menu.tsx`, menú de
usuario del Shell) · Hook: `useLogout()` · API: `POST /api/auth/logout`
(BFF) · Regla: limpia el access token en memoria, la cookie httpOnly
(server-side, vía la ruta BFF) y **todo** el `QueryClient`
(`queryClient.clear()` — única invalidación global intencional del
código, por ser un cambio de sesión) · Estados: idle, pending · Errores:
un fallo de red en la llamada al BFF no bloquea el logout local — la
sesión local se limpia igual · Redirect: → `/` (landing pública) vía
`router.push`, nunca `window.location.reload()` · **Status: DONE**

### AUTH-04 — Logout all

Acción desde `AccountMenu` → "Cerrar todas las sesiones", con
`ConfirmationDialog` (`features/shell/confirmation-dialog.tsx`) · Hook:
`useLogoutAllSessions()` · API: `POST /api/auth/logout-all` · Regla:
revoca todas las sesiones de la cuenta, incluida la actual — la sesión
actual también termina (mismo comportamiento de limpieza que AUTH-03) ·
Estados: dialog de confirmación, pending ("Procesando…"), error inline
en el dialog · Redirect: → `/` tras confirmar y completar ·
**Status: DONE**

### AUTH-05 / AUTH-06 — Invitation acceptance y creación de cuenta

Ruta `/invite/[token]` · Actor: persona ya existente institucionalmente
(con `Membership`) que recibió una invitación por email pero no tiene
`UserAccount` todavía · Hook: `useAcceptInvitation()` · operationId
`acceptAccountInvitation` (`POST /auth/invitations/accept`) — la
aceptación de la invitación **es** la creación de la cuenta, un único
request; no hay un paso de "validar invitación" separado porque
`kernel-openapi.yaml` no define uno (ver `BLOCKED_API` abajo) · Request:
`AcceptAccountInvitationRequest { token, password }` · Response:
`UserAccount` · Regla Kernel: password mínimo 12 caracteres para esta
vía (distinto del mínimo 10 de `/auth/register` — se copió el valor
real del schema, no se inventó uno) · Estados UI: formulario, pending,
éxito, error · Errores visibles: `409` (invitación ya consumida,
revocada, o la persona ya tiene cuenta — el contrato no da un `code`
que distinga los tres casos, así que se muestra un único mensaje
honesto en vez de adivinar cuál fue) → "Esta invitación ya no está
disponible."; `429` rate limit · Redirect: éxito → pantalla de
confirmación con link manual a `/login` (no hay auto-login: el
contrato no define que `acceptAccountInvitation` devuelva sesión) ·
Security: el token nunca se persiste en `localStorage`/`sessionStorage`
(cubierto por un test dedicado), vive sólo en el path de la URL y en
el body del único request que lo usa · **Status: DONE**

**`BLOCKED_API`**: no existe un `GET` para previsualizar la invitación
por token antes de aceptar — `AccountInvitation` (el schema que
devuelve `invitePersonToCreateAccount`, la operación que la Fase 3 usa
para crear la invitación) nunca incluye el token crudo, así que no hay
forma de resolver "¿a qué organización/persona pertenece este link?"
del lado del cliente antes del submit. La pantalla va directo al
formulario de password sin mostrar esos datos.

### AUTH-07 — Password recovery (forgot password)

Ruta `/forgot-password` · Actor: cualquier visitante · Hook:
`useRequestPasswordReset()` · operationId `requestPasswordReset`
(`POST /auth/forgot-password`) — confirmado real en
`kernel-openapi.yaml`, no `BLOCKED_API` · Request: `{ email }` ·
Response: `202` **siempre**, exista o no una cuenta con ese email ·
Estados UI: formulario, pending, confirmación genérica · Errores
visibles: sólo un fallo de request real (network/5xx) muestra error —
el Kernel nunca informa "no existe esa cuenta" como error, así que esa
rama del código jamás se ejecuta para ese caso · Redirect: ninguno
automático, la pantalla se queda mostrando el mensaje con un link
manual de vuelta a `/login` · Security: mensaje idéntico
("Si existe una cuenta asociada, recibirás instrucciones.") sin
importar el resultado real — account enumeration evitado por
construcción, no por buena voluntad del copy · **Status: DONE**

### AUTH-08 — Password reset

Ruta `/reset-password/[token]` · Actor: quien llegó desde el email de
AUTH-07 · Hook: `useResetPassword()` · operationId `resetPassword`
(`POST /auth/reset-password`) · Request: `{ token, newPassword }`
(`newPassword` mínimo 10 caracteres, verificado contra el schema real)
· Regla Kernel: `410 Gone` si el token ya fue usado o expiró · Estados
UI: formulario, pending, éxito, error · Errores visibles: `410` → "Este
enlace de recuperación ya no es válido."; confirmación de password
distinta valida client-side antes de siquiera llamar al hook · Redirect:
éxito → `/login` (el Kernel ya invalidó el token server-side, no queda
nada del lado del cliente que conservar) · Security: el token no se
copia a ningún otro lugar (state, storage, query param adicional) más
allá del path de la URL y el body del submit · **Status: DONE**

### AUTH-09 — Authenticated redirect / protected routing

Todas las rutas de las Áreas 0–7 · Hook: `useAuthStatus()` dentro de
`AuthGate` (`features/shell/auth-gate.tsx`), envuelto en `Suspense`
porque `useSearchParams()` lo exige durante el prerender estático de
Next.js · Regla: `UNAUTHENTICATED` → `router.replace(
"/login?next=" + encodeURIComponent(pathname + query))` (incluye la
querystring, así los filtros de una lista sobreviven el viaje de ida y
vuelta); `AUTHENTICATED` → renderiza los hijos sin redirect ·
`BOOTSTRAPPING` → spinner únicamente, sin decidir todavía (evita el
flicker "login → ya estás adentro" en cada recarga) · Un `403` de un
endpoint específico dentro de una pantalla ya autenticada **nunca** pasa
por este redirect — se muestra inline vía `describeKernelError()`
(`features/shell/kernel-error-message.ts`); `401` (sesión) y `403`
(autorización) son señales distintas con manejo distinto en todo el
código (product spec §27), verificado con un test que confirma que un
`403` no dispara ninguna llamada a `/login` · Security: el `next` que
`AuthGate` genera se construye internamente desde `usePathname()`/
`useSearchParams()`, nunca se lee un valor externo no confiable en este
punto (`resolveSafeNext` sólo hace falta donde se *lee* un `next`, es
decir en `LoginContainer`) · **Status: DONE**

### AUTH-10 — Public home routing

Ruta `/` · Hook: `useAuthStatus()` dentro de `HomeContainer`
(`features/home/containers/home-container.tsx`) · Regla:
`BOOTSTRAPPING`/`AUTHENTICATED` comparten el mismo spinner mínimo que
`AuthGate`/`LoginContainer` (nunca se ve la landing pública parpadear
antes del redirect a `/dashboard`); `AUTHENTICATED` → `router.replace(
"/dashboard")`; `UNAUTHENTICATED` → landing pública (`HomeHeader`,
`HomeHero`, `HomeCapabilities`, `HomeAccessModel`, `HomeFooter`,
componentes locales de marketing en `features/home/`, usando sólo
`@equipoit4845/design-tokens`/`/icons`/`/ui`) · Contenido de
Capabilities basado únicamente en features reales ya cerradas
(Organizaciones y clubes, Personas y membresías, Autoridades y
períodos, Solicitudes y transferencias) — sin claims comerciales ni
estadísticas inventadas · Footer menciona "Rotaract Distrito 4845"
porque es una organización real de los datos semilla del proyecto
(`prisma/seed-legacy.ts`), no una marca inventada · SEO: `/` es
indexable (`src/app/robots.ts`); las rutas token-bearing (`/invite/*`,
`/reset-password/*`, `/verify-email/*`) y todas las administrativas
están deshabilitadas para crawling, más `noindex` por meta tag en las
tres primeras · **Status: DONE**

### AUTH-11 / AUTH-12 — Registro público y verificación de email

No estaban en el alcance mínimo sugerido (`docs` sección 19 por
defecto desalienta un `/register` abierto, dado el modelo real Person →
Membership → Invitation → UserAccount), pero `kernel-openapi.yaml`
confirma que `registerAccount` (`POST /auth/register`) y `verifyEmail`
(`POST /auth/verify-email`) son operaciones públicas reales — no
inventadas — así que se implementaron y se documentan explícitamente
según exige la sección 20 del encargo:

- **Qué crea**: `Person` + `UserAccount` atómicamente (no dos pasos
  separados desde el frontend).
- **Qué NO crea**: ninguna `Membership`. Una cuenta auto-registrada
  queda sin pertenencia a ningún club/distrito hasta que se presente
  una `MembershipApplication` real (Fase 7, `/applications`) — este es
  un camino self-service genuinamente distinto del flujo
  admin-driven Person → Membership → Invitation (`/invite/[token]`,
  AUTH-05/06); no reemplaza ni compite con él.
- **Quién puede registrarse**: cualquier visitante sin cuenta. La
  cuenta queda `PENDING_VERIFICATION` hasta que se complete
  AUTH-12 (verificación de email).

Ruta `/register` (AUTH-11) · Hook `useRegister()` · Request
`RegisterAccountRequest { firstName, lastName, email, password }`
(`password` mínimo 10 caracteres) · Errores: `409` → "Ya existe una
cuenta registrada con ese email."; `429` rate limit · Redirect: éxito
no navega — muestra "Revisá tu email" in-place (la cuenta no puede
usarse hasta verificar) · Un visitante ya `AUTHENTICATED` es redirigido
a `/dashboard` sin ver el formulario, igual que en `/login` ·
**Status: DONE**

Ruta `/verify-email/[token]` (AUTH-12) · Hook `useVerifyEmail()` ·
dispara `POST /auth/verify-email` una única vez al montar (no hay nada
que la persona deba tipear, el token ya viene en el link) · Regla:
`410 Gone` si el token ya fue usado o expiró · Redirect: éxito muestra
confirmación con link manual a `/login` (sin auto-login, mismo criterio
que AUTH-05/06) · **Status: DONE**

### Auditoría de seguridad

- `localStorage`/`sessionStorage`/`document.cookie`/`console.log` — 0
  apariciones en `features/auth` y `features/home` (grep dedicado, sin
  hallazgos).
- Todo uso de `next`/`redirect` revisado: el único punto que **lee** un
  valor externo es `LoginContainer` vía `resolveSafeNext()`
  (`features/auth/utils/safe-redirect.ts`); `AuthGate` sólo **construye**
  el suyo desde `usePathname()`/`useSearchParams()` internos. Durante
  esta auditoría se encontró y corrigió un bypass real:
  `resolveSafeNext` rechazaba `//evil.com` (protocol-relative) pero no
  `/\evil.com` — por la spec WHATWG, los navegadores tratan `\` como
  `/` para esquemas especiales, así que ese valor normaliza a
  `//evil.com` en tiempo de navegación. Se agregó el rechazo de
  cualquier `\` en el valor, con test de regresión
  (`test/runtime/auth-login.runtime.test.ts`).
- Cero imports de Prisma, Kernel SDK, `client/*`, `schema.ts`, rutas de
  servicio o internals del Design System dentro de `features/auth` y
  `features/home` (grep dedicado, sin hallazgos) — todo el HTTP de auth
  pasa por `@/lib/api` (BFF para sesión, Kernel directo sólo para las
  operaciones públicas sin sesión: register, verify-email, forgot/reset
  password, accept invitation).
- `PasswordInput` (`features/auth/components/password-input.tsx`) tenía
  un bug de accesibilidad real, encontrado escribiendo los tests: como
  ningún formulario le pasaba un `id` explícito, caía a un `useId()`
  generado que nunca coincidía con el `for` del `<label>` de
  `FormField` — la etiqueta quedaba visualmente asociada pero rota para
  lectores de pantalla / `getByLabelText`. Corregido pasando `id`
  explícito en los cinco usos (`login-form.tsx`, `register-form.tsx`
  ×2, `invite-accept-form.tsx` ×2, `reset-password-form.tsx` ×2).

### Tests

Siete suites nuevas en `test/runtime/` (34 tests): `auth-login`
(BOOTSTRAPPING sin flicker, éxito, 401/423/429/network, `next` seguro,
`next` externo rechazado, `next` con backslash rechazado, visitante ya
autenticado), `auth-register` (éxito, 409, visitante autenticado,
verify-email válido/expirado), `auth-invitation` (éxito con verificación
del body enviado, 409, mismatch de password bloquea el submit
client-side, token nunca en storage), `auth-password-reset` (forgot:
respuesta genérica + error real distinto; reset: éxito con redirect,
410, 404, mismatch), `auth-logout` (logout y logout-all: cache clear,
sesión limpia, redirect a `/`, confirmación previa a logout-all),
`home` (BOOTSTRAPPING, landing, CTA, redirect autenticado) y
`protected-routes` (`AuthGate` en sus tres estados + `401 ≠ 403`). Ver
detalle de convenciones de test (incluida una limitación real del mock
de router que hubo que sortear con un helper local) en
[`docs/07-frontend-web.md`](07-frontend-web.md#testing).

### Verificación de cierre — Área transversal (Auth / Access)

`pnpm typecheck`, `pnpm lint` y `pnpm build` en verde (el `build`
reveló y permitió corregir un bug real: `AuthGate` había agregado
`useSearchParams()` sin envolver en `Suspense`, lo que rompía el
prerender estático de **todas** las rutas administrativas — no sólo un
hallazgo de esta auditoría sino un blocker de despliegue real). `pnpm
test`: 248/248 en verde (213 preexistentes + 34 nuevas de esta área +
1 test de regresión del bypass de `resolveSafeNext`).

---

## Resumen de status

| Área | Historias | DONE | NOT_STARTED |
| --- | --- | --- | --- |
| 0. Dashboard | 2 | 2 | 0 |
| 1. Organizaciones | 8 | 8 | 0 |
| 2. Personas | 6 | 6 | 0 |
| 3. Membresías | 8 (agrupadas en 3 entradas) | 8 | 0 |
| 4. Autoridades/Cargos | 11 (agrupadas en 8 entradas) | 11 | 0 |
| 5. Períodos | 9 (agrupadas en 6 entradas) | 9* | 0 |
| 6. Solicitudes | 7 | 7 | 0 |
| 7. Transferencias | 8 | 8 | 0 |
| Transversal. Auth / Access | 12 (AUTH-01..12) | 12 | 0 |

\* Incluye US-PRD-02 (período actual), cubierto como parte del
Dashboard sin ruta propia adicional.

Gate de fase: no se avanza a Organizaciones (Fase 2) hasta que
Dashboard (Fase 1) esté `DONE` con lint/typecheck/tests/build en verde
— ver `docs/design-system-v1-validation.md` para el patrón de
verificación con evidencia real, aplicado aquí a esta fase.

Organizaciones (Fase 2) cerró `DONE` el 2026-08-08 (ver "Verificación
de cierre — Fase 2" en el Área 1) con lint/typecheck/tests/build/
contracts en verde. Por el mismo gate, Personas (Fase 3) no arranca
hasta que se pida explícitamente.

Personas (Fase 3) cerró `DONE` el 2026-08-09 (ver "Verificación de
cierre — Fase 3" en el Área 2), en paralelo con Fase 4 (Membresías,
otro track). US-PER-02 tiene un sub-alcance `BLOCKED_API` documentado
(tab "Cuenta") que no bloquea el resto de la historia.

Autoridades/Cargos (Fase 5) y Períodos (Fase 6) cerraron `DONE` el
2026-08-09, implementadas por dos agentes en paralelo dentro del mismo
trabajo (ownership disjunto: `features/positions`+`features/appointments`
vs `features/periods`) más una pasada de unificación (nav del Shell,
`docs/07-frontend-web.md`, test de integración cruzada Período↔
Appointment — ver "Integración Período ↔ Appointment" en el Área 5).
US-POS-03 tiene un sub-alcance `BLOCKED_API` documentado (no hay
endpoint para leer los permisos hoy adjuntos a un cargo). Con Fase 4,
5, 6, 7 y 8 todas verificadas `DONE` (esta última verificación
re-confirmó las ocho áreas contando historias reales, no sólo
encabezados de sección), sólo queda pendiente cerrar formalmente el
gate hacia cualquier fase futura que se agregue al alcance.

El área transversal Auth / Access cerró `DONE` el 2026-08-09 (ver
"Verificación de cierre — Área transversal (Auth / Access)" más
arriba), cerrando junto con ella toda la Web administrativa
institucional: login, bootstrap de sesión, logout/logout-all,
aceptación de invitación, registro público + verificación de email,
recuperación de contraseña, ruteo protegido (`401 ≠ 403`) y la página
pública `/`. No se avanzó a ningún módulo externo (Meetings, Events,
Projects, Professional Development) ni se rediseñó el Kernel, conforme
al alcance del encargo.
