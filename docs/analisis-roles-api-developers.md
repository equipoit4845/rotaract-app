# Roles y cargos en la plataforma de developers

> Análisis del 2026-10-16 (rama `correo-distrital`). No se cambió código. Las
> consultas a prod fueron todas `BEGIN READ ONLY … ROLLBACK`.

> **Estado (2026-10-16, mismo día):** épicas A y B implementadas, sin
> commitear ni desplegar, con las recomendaciones de D1–D5 (D1 a, D2 a,
> D3 «solos», D4 a, D5 terminar). Falta D6 (migrar Correo a `grants[]`) y la
> épica C. Detalle técnico en `docs/15-modules.md` («Cargos de módulos»);
> e2e en `apps/institutional-kernel-api/test/module-positions.e2e-spec.ts`.
> Migración: `prisma/migrations/20261016120000_module_positions`.

## Resumen

1. **¿La API de developers muestra los cargos y roles del kernel?** Solo en parte.
   Una app ve **qué cargo tiene cada persona**: código y nombre, en el claim
   `positions` y en `/service/organizations/:id/authorities`. También puede
   **preguntar si alguien tiene un permiso** con `/service/authorization/check`.
   Lo que **no** puede hacer es listar el catálogo de cargos (`PositionDefinition`),
   los roles (`RoleDefinition`) ni **los permisos de un cargo** (`RolePermission`).
   Tampoco le llega la lista de permisos efectivos de una persona; solo los de
   módulo, en `users/:id/context`. Por eso hoy las apps reales escriben los
   códigos de cargo a mano en su código (`CLUB_PRESIDENT`, `DISTRICT_RDR`…).
2. **¿Una app puede definir un rol o cargo que no existe?** No. El manifiesto
   declara **permisos**, que se sincronizan al registrar el módulo, pero no
   cargos ni roles. Al instalar no se crea nada en la organización: falta que
   alguien ate esos permisos a un cargo. En Correo Distrital eso lo hizo un script
   con acceso directo a la base (`register-in-kernel.cjs`), y además la app repite
   la lista de cargos en su propio `config.ts`.

La propuesta (§4) agrega dos cosas:

- **Lectura:** un scope de solo lectura, `kernel.service.positions.read`, con el
  catálogo de cargos y sus permisos, y un endpoint de permisos efectivos.
- **Plantillas de cargo:** una sección `positions` en el manifiesto. Al instalar,
  cada plantilla se materializa como un cargo con rol propio de esa organización.
  Solo puede llevar permisos del propio módulo, y la presidencia de la
  organización designa a las personas con el flujo de siempre.

---

## 1. Qué existe hoy

### 1.1 Scopes OAuth

`apps/institutional-kernel-api/src/application/oauth/scopes.ts:9-31`

| Tipo | Scope | Qué da sobre cargos y roles |
|---|---|---|
| OIDC (lo da la persona) | `positions` | Cargos vigentes de la persona: código, nombre, organización y período |
| OIDC | `memberships` | Clubes de la persona (no son cargos) |
| Servicio (lo da el distrito) | `kernel.service.authorities.read` | Autoridades vigentes de una organización, con código y nombre del cargo |
| Servicio | `kernel.service.authorization.check` | Respuesta sí/no a «¿la persona X tiene el permiso P en la organización O?» |
| Servicio | `kernel.service.users.read` | Contexto de cuenta, con `workspaces[].roleCodes` y los permisos **de módulo** |
| Servicio | `kernel.service.modules.read` | Instalación de un módulo: estado y configuración |

No hay ningún scope para leer `PositionDefinition`, `RoleDefinition`,
`PermissionDefinition` ni `RolePermission`.

### 1.2 Claims del token (OIDC)

`apps/institutional-kernel-api/src/application/oauth/claims.ts:19-24, 113-131`

```jsonc
"positions": [{ "organizationId": "…", "positionCode": "DISTRICT_RDR",
                "positionName": "Representante Distrital", "periodId": "…" }]
```

- Solo incluye nombramientos `ACTIVE` dentro del subárbol de la organización
  dueña de la app (`organizationSubtree`, `claims.ts:32-47`). Una app de club no
  ve los cargos distritales de la persona.
- No trae permisos ni rol técnico (`defaultRoleCode`).
- Con un token de persona, una app de terceros solo puede llamar a
  `/oauth/userinfo` (`oauth.controller.ts:203`, `OidcAccessGuard`). Las rutas
  institucionales (`/position-definitions`, `/roles`…) quedan detrás de
  `KernelAccessGuard`, que no acepta tokens de apps (`kernel-access.guard.ts:51-58`).

### 1.3 Endpoints `/service/*` (client_credentials)

`apps/institutional-kernel-api/src/interfaces/http/service.controller.ts`.
El scope que pide cada ruta está en
`application/auth/service-api.guard.ts:43-64`.

| Endpoint | Línea | Devuelve sobre cargos |
|---|---|---|
| `GET /service/organizations/:id/authorities` | `service.controller.ts:120` | `AuthorityView`: `positionCode`, `positionName`, persona y fechas (`data-api/views.ts:181-203`). Sin permisos. |
| `GET /service/organizations/:id/authority-snapshot` | `:195` | `positionCode` + `personId` (`kernel.service.ts:3023-3054`). Sin nombre ni permisos. |
| `POST /service/authorization/check` y `batch-check` | `:206-215` | Decisión por permiso (`kernel.service.ts:1790-1803`). Hasta 100 por lote. |
| `GET /service/users/:accountId/context` | `:77` | `workspaces[].roleCodes` + `modulePermissions` (`kernel.service.ts:2848-2990`). Solo trae permisos de módulos, no los `kernel.*`. |
| `GET /service/modules/:moduleId/installations/:orgId` | `:216` | Instalación con `configuration` (`kernel.service.ts:3077`) |

El guard limita todo al alcance de la app (`service-api.guard.ts:211-250`). Un
`check` sin `organizationId`, o con una organización fuera de su subárbol,
devuelve 403.

**Endpoints que existen solo para personas (Mi Rotaract web) y no se exponen a apps:**

- `GET /position-definitions` y `GET /position-definitions/:id/permissions`
  (`institutional.controller.ts:275, 289`; permiso `kernel.position.read`,
  `kernel-access.guard.ts:217-218`). Este último devuelve justo «los permisos de
  un cargo» (`kernel.service.ts:1195-1207`).
- `GET /roles`, `GET /permissions`, `GET /persons/:id/effective-permissions`
  (`authorization.controller.ts:23-35, 95`).

### 1.4 SDKs

**JS, `@mirotaract/sdk`** (`packages/sdk-js/src/client.ts:95-131`): recursos
`clubs`, `members`, `persons`, `authorities`, `periods` y `permissions`.

- `authorities.list(orgId, { includeDescendants })` → `AuthorityView[]`
  (`client.ts:346-361`, tipo en `types.ts:54-64`).
- `permissions.check()` / `checkMany()` → `AuthorizationDecision`
  (`client.ts:398-422`, `types.ts:86-96`).
- `MiRotaractAuth` tipa el claim `positions` (`types.ts:124-129`).
- No tiene `positions.list()`, `roles`, `effectivePermissions` ni `userContext`.

**Python, `mirotaract`** (`sdks/python/src/mirotaract/client.py`): tiene la misma
superficie: `Authorities.list` (`:278-288`), `Permissions.check/check_many`
(`:300-327`) y `AuthorityView` (`types.py:75-85`). Tampoco puede leer catálogos
ni permisos.

### 1.5 Cómo se usan hoy en las apps reales

- **Reuniones** (`apps/meetings-api/src/directory/directory-sync.service.ts:16-29`)
  decide los roles comparando `positionCode` con constantes escritas a mano
  (`CLUB_PRESIDENT`, `DISTRICT_RDR`, `DISTRICT_SECRETARY`). Si el distrito crea un
  cargo nuevo, la app no lo ve.
- **Correo Distrital** combina dos mecanismos:
  - permisos de módulo comprobados con `checkMany` (`apps/correo-api/src/kernel/access.service.ts:5,32`), que es lo correcto;
  - la lista de cargos con casilla, escrita a mano en `apps/correo-api/src/config.ts:7-15` y repetida en el `configurationSchema.default` del manifiesto (`apps/correo-api/mirotaract.module.json`).

### 1.6 Modelo de cargos, roles y permisos

`prisma/schema.prisma:360-460, 605`

- `PositionDefinition.code` es **único global** y `defaultRoleCode` apunta a un
  `RoleDefinition.code`, también único global. `ownerOrganizationId` dice quién
  mantiene el catálogo.
- `RoleDefinition.moduleId` existe, pero **nadie lo usa**: en prod está vacío en
  los 10 roles.
- `PermissionDefinition.moduleId` lo completa la sincronización del manifiesto.
- Un cargo da permisos así: un nombramiento `ACTIVE` crea un `RoleAssignment`
  del `defaultRoleCode`. El alcance es `ORGANIZATION_TREE` si el cargo es de
  distrito y `ORGANIZATION` si es de club (`kernel.service.ts:1150-1162`).

### 1.7 Cargos con rol propio (`grantsPermissions`)

`kernel.service.ts:952-1010` (create), `:1020-1080` (update), `:1091-1110` (`createPositionRole`)

- Con `grantsPermissions: true` se crea un `RoleDefinition` con **el mismo código
  que el cargo**, con `isSystem: false`. Si ese código ya existe, devuelve 409.
- Un club solo puede crear cargos de tipo `CLUB` (`:973-977`) y no puede
  derivar un rol de sistema (`assertPositionRole`, `:1175-1193`).
- Al atar un permiso a un cargo se comprueba lo siguiente (`positionPermission`, `:1209-1310`):
  - el rol no puede estar compartido con cargos de otro dueño (`:1240-1262`);
  - un cargo de club no puede recibir `DISTRICT_ONLY_PERMISSIONS` (`:44-56`, `:1263-1279`).
- La web genera el código como `DISTRICT_<SLUG>_<4 al azar>` justamente para
  esquivar la unicidad global
  (`apps/mirotaract-web/src/features/positions/forms/create-position-form.tsx:40-52`).
  En prod está el ejemplo `DISTRICT_DIRECCION_DE_ROTAMERCH_2TVF`.

### 1.8 Módulos, manifiesto e instalaciones

- **Esquema del manifiesto**
  (`packages/module-manifest/schema/module-manifest.v1.json`). Claves raíz:
  `id`, `name`, `description`, `version`, `contractVersion`, `permissions`,
  `events`, `configurationSchema`, `ui`, `oauth` y `capabilities`, con
  `additionalProperties: false`. **No hay `positions` ni `roles`.** Cada permiso
  tiene `code`, `name`, `description` y `scopeType`, pero el kernel **no guarda
  `scopeType`** (`kernel.service.ts:2314-2321`): el alcance real lo da el tipo
  de cargo.
- **Registro** (`registerModule`, `kernel.service.ts:2379`): sincroniza los
  permisos (`syncModulePermissions`, `:2288-2370`). Crea, actualiza y **borra**
  los permisos que ya no se declaran; el borrado arrastra los `RolePermission` en
  cascada y se emite `kernel.permissions.changed.v1`.
- **Instalación** (`installModule`, `:2568-2658`): valida el estado del módulo y
  de la organización, y la configuración contra `configurationSchema`. Después
  crea o reactiva `ModuleInstallation` en estado `PENDING`. **No toca cargos,
  roles ni permisos.** Permiso: `kernel.module.install` (`kernel-access.guard.ts:299`).
- **Transiciones** (`transitionInstallation`, `:2660-2740`): `ACTIVE`,
  `SUSPENDED` y `DISABLED`. Desactivar tampoco toca cargos ni permisos.
- **Gate de módulo** (`authorization.service.ts:49-95`): un permiso de módulo
  solo vale si hay una instalación `ACTIVE` en la organización o en su ancestro
  más cercano que tenga instalación. Así, al desinstalar, los permisos dejan de
  valer sin borrar nada.

### 1.9 Correo Distrital: cómo se configuró a mano

`apps/correo-api/scripts/register-in-kernel.cjs`

1. Registra el módulo, lo instala en el distrito y lo activa (`:116-135`).
2. Le da a `DISTRICT_TREASURER` un rol propio con `updatePosition(grantsPermissions)` (`:138-156`).
3. Ata `correo.mailbox.use/manage` a los cargos RDR, Secretaría y Tesorería (`:158-181`).

Después, `district-authorities-2026.cjs:76-98` creó `DISTRICT_COMITE_IT`
copiándole los 49 permisos del RDR.

### 1.10 Datos reales (prod, solo lectura)

| Cargo | Tipo | Rol | Permisos | Activos |
|---|---|---|---|---|
| `CLUB_PRESIDENT` | CLUB | sistema | 31 | 28 |
| `CLUB_SECRETARY` / `CLUB_TREASURER` | CLUB | sistema | 21 / 13 | 0 |
| `CLUB_VICE_PRESIDENT`, `CLUB_PRESIDENT_ELECT`, `CLUB_PAST_PRESIDENT` | CLUB | — | 0 | 0 |
| `DISTRICT_RDR` | DISTRICT | sistema | 49 | 1 |
| `DISTRICT_SECRETARY` | DISTRICT | sistema | 35 | 1 |
| `DISTRICT_TREASURER` | DISTRICT | propio | 1 (`correo.mailbox.use`) | 0 |
| `DISTRICT_COMITE_IT` | DISTRICT | propio | 49 | 2 |
| `DISTRICT_DIRECCION_DE_ROTAMERCH_2TVF` | DISTRICT | propio | 2 (`tienda.*`) | 1 |

- Los 11 cargos son del distrito (`distrito-4845`). **Ningún club creó un cargo propio.**
- Módulos: `correo` y `tienda` están `ACTIVE` e instalados solo en el distrito;
  `meetings` está `DISABLED`. Hay 55 permisos del kernel, 2 de `correo` y 2 de `tienda`.
- Quién tiene cada permiso del kernel relevante:
  - `CLUB_PRESIDENT`: `kernel.module.install`, `kernel.appointment.create/activate`, pero **no** `kernel.position.create` ni `kernel.position.manage`;
  - `DISTRICT_RDR` y `DISTRICT_COMITE_IT`: todo lo anterior, más `kernel.position.*`, `kernel.module.register` y `kernel.role.assign`;
  - `DISTRICT_SECRETARY`: `kernel.appointment.*`.

  O sea, el código admite cargos de club con rol propio, pero **hoy una presidencia
  de club no puede crearlos**: puede instalar módulos y nombrar personas, nada más.
  Además, el formulario web solo crea cargos `DISTRICT` (`create-position-form.tsx:60`).

---

## 2. Qué falta

| # | Falta | Consecuencia |
|---|---|---|
| F1 | Leer el catálogo de cargos de una organización con la API de developers | Las apps escriben los códigos a mano; si aparece un cargo nuevo, la app no lo ve |
| F2 | Leer los permisos de un cargo (`RolePermission`) | Una app no puede mostrar «este cargo puede X» ni explicar una denegación |
| F3 | Permisos efectivos de una persona en una organización (incluidos `kernel.*`) | Para pintar una UI hay que hacer N `check` (100 por lote) |
| F4 | Webhooks de cambios de catálogo para apps | Existen `kernel.position.created/updated/permissions-changed.v1` en el outbox, pero no en el catálogo público suscribible (`webhooks/catalog.ts` no los incluye) |
| F5 | Declarar cargos o roles en el manifiesto | No hay lugar para declararlos |
| F6 | Que la instalación cree cargos con rol propio | Hoy se hace con un script (Correo) o a mano en la web |
| F7 | Unicidad del código de cargo y de rol por organización | `code` es único global; dos clubes no pueden tener el mismo «ENCARGADO_X» |
| F8 | Que `RoleDefinition.moduleId` y el `scopeType` del permiso tengan efecto | Hoy son decorativos |
| F9 | Que una presidencia de club configure permisos de su club | No tiene `kernel.position.create/manage` |
| F10 | Métodos en los SDKs JS y Python para todo lo anterior | — |

---

## 3. Principios

1. **Las apps comprueban permisos, no cargos.** El código de cargo sirve para
   mostrarlo, nunca para decidir. Si una app decide por `positionCode`, se rompe
   cuando el distrito renombra o agrega un cargo. Leer el catálogo (F1 y F2)
   sirve para mostrarlo y para configurar la app, no para autorizar.
2. **Un módulo solo puede repartir sus propios permisos.** Nunca `kernel.*` ni
   permisos de otro módulo.
3. **Quien instala no gana poderes.** Instalar crea cargos vacíos. Nombrar a
   alguien sigue el flujo normal de nombramientos, con su permiso y su auditoría.
4. **Desinstalar no borra historia.** Los permisos dejan de valer por el gate de
   módulo, que ya existe. Los cargos se archivan y no se borran.

---

## 4. Propuesta de diseño

### 4.1 Lectura: nuevo scope y endpoints

Nuevo scope de servicio: **`kernel.service.positions.read`**, con la etiqueta
«Leer los cargos de la organización y qué permite cada uno».

| Endpoint | Scope | Respuesta |
|---|---|---|
| `GET /service/organizations/:id/positions` | `positions.read` | `PositionView[]` = cargos que aplican a la organización: los del catálogo del distrito para su tipo y los propios (`ownerOrganizationId = id`) |
| `GET /service/positions/:positionCode` | `positions.read` | `PositionView` con `permissions` |
| `GET /service/organizations/:id/persons/:personId/permissions` | `authorization.check` | `{ permissions: string[], evaluatedAt, cacheUntil }`, ya filtrado por el gate de módulo. Envuelve `authorization.effectivePermissions` |

```ts
type PositionView = {
  code: string;                 // DISTRICT_RDR, correo.CASILLA_EXTRA@club-x…
  name: string;
  description: string | null;
  organizationType: "CLUB" | "DISTRICT";
  ownerOrganizationId: string | null;
  source: "SYSTEM" | "ORGANIZATION" | "MODULE";
  moduleId: string | null;      // si la creó una instalación
  isSingletonPerPeriod: boolean;
  scope: "ORGANIZATION" | "ORGANIZATION_TREE"; // derivado de organizationType
  permissions?: Array<{ code: string; name: string; moduleId: string | null }>;
};
```

- **Minimización de datos:** solo cargos que aplican al subárbol de la app.
  `permissions` se devuelve con `?include=permissions` o en el detalle.
- **Permisos `kernel.*`:** el detalle del cargo los muestra con su código y su
  nombre. No son datos personales, pero sí revelan la estructura de gobierno.
  Hay dos opciones:
  - **(a)** mostrar todos;
  - **(b)** mostrar solo los del propio módulo más un flag `grantsKernelPermissions: boolean`.

  Recomiendo **(a)**: los permisos del kernel son públicos en la documentación y
  el scope ya lo aprueba el distrito.
- **Claim `positions`:** agregarle `permissions` sería tentador, pero agranda
  el token y lo deja desactualizado durante 10 min. Lo descarto: mejor un
  `check` en vivo o el endpoint de permisos efectivos.
- **Webhooks públicos:** `position.created.v1`, `position.updated.v1` y
  `position.permissions-changed.v1`, filtrados por subárbol. Mapean los eventos
  `kernel.position.*` que ya se emiten (`kernel.service.ts:1003, 1032, 1222`).
- **SDKs:**
  - JS: `positions.list(orgId, { includePermissions })`, `positions.get(code)` y `permissions.effective(orgId, personId)`;
  - Python: `positions.list/get` y `permissions.effective`;
  - en los dos, el tipo `PositionView`;
  - CLI: `mirotaract positions ls <org>`.

### 4.2 Manifiesto: plantillas de cargo

Hay que agregar una sección `positions` al esquema v1. Es un cambio aditivo,
porque hoy la raíz tiene `additionalProperties: false`: los manifiestos viejos
siguen valiendo y los kernels viejos rechazan los nuevos con un error claro.

```jsonc
"positions": [
  {
    "key": "encargado-casilla",            // estable dentro del módulo
    "name": "Encargado/a de la casilla",
    "description": "Responde el correo institucional del club.",
    "organizationTypes": ["CLUB"],         // dónde se materializa: CLUB, DISTRICT o ambos
    "permissions": ["correo.mailbox.use"], // SOLO permisos de este módulo
    "isSingletonPerPeriod": false,
    "install": "suggested"                 // "required" | "suggested" (default)
  }
],
"grants": [
  // Opcional. Sugiere sumar permisos del módulo a cargos que ya existen.
  { "positionCode": "CLUB_PRESIDENT", "permissions": ["correo.mailbox.manage"] }
]
```

**Validaciones** del paquete `module-manifest` y del kernel al registrar:

- `positions[].permissions[]` y `grants[].permissions[]` deben estar en
  `permissions[]` del mismo manifiesto. Así nunca entran `kernel.*` ni permisos
  de otro módulo.
- `grants[].positionCode` solo acepta cargos de sistema o del catálogo del
  distrito. En el registro solo se valida que exista. Se aplica al instalar, y
  solo si quien instala lo aprueba (§4.3).
- `key` usa el patrón `^[a-z][a-z0-9-]*$`, es única dentro del módulo y tiene
  un máximo de 20 plantillas.
- Si la organización es de tipo `CLUB` y la plantilla es `DISTRICT`, se ignora.

### 4.3 Qué pasa al instalar

Hoy `installModule` crea la instalación en `PENDING`. Se le suma lo siguiente,
en la misma transacción y con `mutate()` para que quede auditado:

1. La pantalla de instalación muestra:
   - las plantillas que aplican al tipo de organización, con sus permisos;
   - los `grants` sugeridos.

   Quien instala elige cuáles crear. Las `required` vienen marcadas y no se
   pueden destildar, salvo que se cancele la instalación.
2. Por cada plantilla elegida se crea un `PositionDefinition` con estos campos:
   - `code` = `<moduleId>.<key>@<orgSlug>`, o un código interno con
     `(ownerOrganizationId, moduleId, key)` como clave única lógica (ver F7);
   - `organizationType` = el tipo de la organización;
   - `ownerOrganizationId` = la organización que instala;
   - un **rol propio** con `RoleDefinition.moduleId = moduleId` e `isSystem = false`;
   - los permisos de la plantilla atados al rol;
   - una marca de origen: columna nueva `PositionDefinition.moduleId` (+
     `moduleTemplateKey`), o una tabla `ModuleInstallationPosition`.
3. `grants` aprobados: se atan los permisos del módulo al rol del cargo existente,
   solo si se cumplen las dos condiciones de `positionPermission` (rol no
   compartido entre dueños y nada reservado al distrito).
   - **Atención:** los cargos del catálogo (`CLUB_PRESIDENT`…) son del distrito y
     su rol se comparte entre los 28 clubes. Un club **no** puede hacer un grant
     sobre `CLUB_PRESIDENT`. Solo el distrito, y vale para todos los clubes.
     Para un club el grant se rechaza con un mensaje claro, o se ofrece crear la
     plantilla equivalente.
4. Se emite `kernel.module-positions-provisioned.v1` con los códigos creados.
5. Si la instalación se reactiva (estaba `DISABLED`), se reactivan los cargos
   archivados en vez de duplicarlos.

**Por qué no hace falta que quien instala tenga `kernel.position.create`:**
la instalación es un permiso acotado. Solo crea cargos con permisos del módulo
que se está instalando, y esos permisos solo valen con el módulo `ACTIVE` en esa
organización (gate existente). Es el mismo razonamiento que ya justifica
`grantsPermissions` sin `kernel.role.manage` (`kernel.service.ts:954-957`).

### 4.4 Actualizaciones del módulo (nueva versión del manifiesto)

- **Plantilla nueva:** se ofrece en la pantalla de la instalación («El módulo
  tiene cargos nuevos») y no se crea sola.
- **Permisos agregados a una plantilla:** en estos casos se aplican solos, porque
  son permisos del mismo módulo y quien instaló ya confió en el módulo:
  - los cargos que vienen de esa plantilla y que nadie editó a mano;
  - si alguien los editó, se muestra una diferencia para aprobar.

  Es un punto a decidir (D3).
- **Permisos quitados:** se borran. Ya pasa hoy por la cascada de `syncModulePermissions`.
- **Plantilla eliminada:** los cargos quedan, sin permisos del módulo, y se
  marcan «la app ya no usa este cargo».

### 4.5 Qué pasa al desinstalar (`DISABLED`) o suspender

- **Suspender:** no se toca nada. El gate de módulo devuelve `MODULE_NOT_ACTIVE`.
- **Desinstalar:** los cargos creados por la instalación pasan a **archivados**.
  Hace falta un estado nuevo, `PositionDefinition.archivedAt`: hoy no hay forma
  de archivar un cargo.
  - Los nombramientos `ACTIVE` en esos cargos se **terminan** (`endAppointment`,
    motivo `MODULE_UNINSTALLED`). Así se revocan los `RoleAssignment` derivados
    y queda historia auditada.
  - No se borra nada. Al reinstalar se reactivan los cargos, pero los
    nombramientos **no** se reactivan: hay que nombrar de nuevo.
- **`grants` sobre cargos existentes:** se quitan los permisos del módulo de esos
  roles. Igual dejarían de valer por el gate, pero así queda prolijo.

### 4.6 Quién asigna los cargos

- **Nombrar** a alguien en un cargo creado por un módulo usa el flujo de
  siempre: `createAppointment` + `activateAppointment`, con `kernel.appointment.create/activate`.
  En prod lo tienen `CLUB_PRESIDENT`, RDR, Comité IT y Secretaría distrital.
- **Editar** los permisos de un cargo de módulo requiere `kernel.position.manage`,
  que una presidencia de club hoy no tiene. Hay dos opciones:
  - **(a)** dejar que solo los edite el distrito;
  - **(b)** un permiso nuevo, `kernel.position.manage-own`, para la presidencia de
    club, limitado a cargos que sean de su club, que no sean de sistema y que solo
    reciban permisos de módulos instalados en el club (o de un allowlist de
    `kernel.*` no reservados).

  Recomiendo empezar con (a) y que el módulo traiga los permisos correctos.
- **La app no nombra a nadie.** No hay un scope `kernel.service.appointments.write`.
  Si en el futuro hace falta, que sea una propuesta («sugerir nombramiento») que
  la presidencia confirma.

### 4.7 Riesgos de seguridad y mitigaciones

| Riesgo | Mitigación |
|---|---|
| **Escalada por manifiesto:** un módulo declara una plantilla con `kernel.role.assign` | Una plantilla solo admite permisos de `permissions[]` del propio manifiesto, que empiezan con `<moduleId>.` (lo valida `assertPermissionCode`). Se valida al registrar **y** al instalar |
| **Permiso de otro módulo:** `tienda.orders.manage` en un cargo de `correo` | Misma regla. Además, `syncModulePermissions` ya rechaza códigos de otro módulo (`KERNEL_MODULE_PERMISSION_TAKEN`) |
| **Permisos reservados al distrito** (`DISTRICT_ONLY_PERMISSIONS`) | No pueden aparecer en plantillas (son `kernel.*`). Si un día se reservan permisos de módulo, el manifiesto marcaría `"reservedTo": "DISTRICT"` y la instalación en un club los omitiría |
| **Grants sobre roles compartidos:** un club cambia lo que puede `CLUB_PRESIDENT` en los 28 clubes | Grants sobre cargos de otro dueño se rechazan. El chequeo de `positionPermission` (`:1240-1262`) se reutiliza tal cual |
| **Quien instala se nombra y gana poder:** el instalador crea un cargo y se designa | Solo gana permisos del módulo y solo en su organización. El nombramiento queda auditado. Además, `kernel.module.install` ya es de presidencia o RDR |
| **Colisión o suplantación de códigos:** un módulo crea `DISTRICT_RDR` | Los códigos generados llevan prefijo `<moduleId>.` y sufijo de organización, que el desarrollador no controla. Los de sistema no se pueden pisar |
| **Módulo malicioso que se actualiza y agrega permisos sensibles a una plantilla** | Los permisos del módulo solo afectan al módulo. Un permiso nuevo tiene que figurar en el manifiesto, que pasa por la revisión de apps (`app-review.service.ts`). Si se elige aplicarlo solo (D3), conviene que una versión con permisos nuevos pase por revisión |
| **Lectura de estructura:** `positions.read` deja ver qué cargos dan `kernel.*` | Es un scope aparte, lo aprueba el distrito y se limita al subárbol. No incluye personas |
| **Enumerar permisos efectivos de cualquier persona** | Mismo alcance que `check`: persona y organización del subárbol, y queda en el historial de acceso (`recordRead`) |

### 4.8 Unicidad de códigos (F7)

Hay dos caminos:

- **(a) Mínimo:** mantener `code @unique` y generar
  `<moduleId>.<key>.<orgShortId>`. Es simple y no requiere migrar, pero el código
  queda feo. Igual no se muestra: se muestra `name`.
- **(b) Correcto:** cambiar a `@@unique([ownerOrganizationId, code])` en
  `PositionDefinition`, y que `RoleDefinition` deje de reutilizar el código del
  cargo, con un `id` propio y `PositionDefinition.roleDefinitionId`. Toca
  `defaultRoleCode`, claims, snapshots y el SDK.

Recomiendo **(a)** para esta épica y dejar (b) como deuda.

---

## 5. Historias de usuario

### Épica A: Lectura de cargos y permisos

**HU-A1. Catálogo de cargos para apps.**
Como developer de una app de comité, quiero listar los cargos de una
organización para mostrar quién es quién y configurar mi app sin escribir
códigos a mano.

- [ ] Existe el scope `kernel.service.positions.read`. Aparece en la consola
      del portal y en la pantalla de aprobación del distrito, con su etiqueta en español.
- [ ] `GET /service/organizations/:id/positions` devuelve los cargos de sistema
      y del catálogo que aplican al tipo de la organización, más los propios. Sin el scope, 403.
- [ ] Una organización fuera del subárbol de la app devuelve 403 «Fuera del alcance de esta app».
- [ ] Responde con ETag/304 como el resto de la Data API.
- [ ] Hay una entrada en el OpenAPI (`packages/kernel-contracts`) y la valida
      `openapi-validation.interceptor`.

**HU-A2. Permisos de un cargo.**
Como developer, quiero ver qué permisos da un cargo para explicarle a la
persona por qué puede o no puede hacer algo.

- [ ] `GET /service/positions/:code` y `?include=permissions` en el listado devuelven `permissions[]`, con `code`, `name` y `moduleId`.
- [ ] Un cargo sin rol técnico devuelve `permissions: []`.
- [ ] Cambiar los permisos en Mi Rotaract se ve en la próxima lectura, sin caché vieja.

**HU-A3. Permisos efectivos de una persona.**
Como developer, quiero en una sola llamada todos los permisos de una persona en
una organización, para pintar la UI sin hacer 50 `check`.

- [ ] `GET /service/organizations/:orgId/persons/:personId/permissions` usa el scope `authorization.check`.
- [ ] El resultado coincide con hacer `check` permiso por permiso, gate de módulo incluido (test de propiedad).
- [ ] Queda en el historial de acceso de la persona (`DATA_READ`, detalle `permissions`).
- [ ] Una persona o una organización fuera de alcance devuelve 403.

**HU-A4. SDKs.**

- [ ] JS: `client.positions.list/get` y `client.permissions.effective`, con los tipos exportados y tests.
- [ ] Python: la misma superficie, sync y async, con tests.
- [ ] La conformidad de SDKs (`sdks/conformance`) cubre los nuevos endpoints.
- [ ] El portal documenta «Decidí por permisos, no por cargos», con un ejemplo de Correo.

**HU-A5. Webhooks de cargos.**

- [ ] `position.created.v1`, `position.updated.v1` y
      `position.permissions-changed.v1` están en el catálogo público,
      filtrados por subárbol.
- [ ] Payload: `{ organizationId, positionCode }`, sin datos personales.

### Épica B: Cargos declarados por módulos

**HU-B1. Plantillas de cargo en el manifiesto.**
Como developer, quiero declarar en `mirotaract.module.json` los cargos que
necesita mi app, con los permisos de mi módulo.

- [ ] El esquema v1 acepta `positions[]` y `grants[]` con la forma de §4.2. `mirotaract module validate` los valida.
- [ ] Una plantilla con un permiso que no está en `permissions[]` del manifiesto se rechaza con un error en español que nombra el permiso.
- [ ] Un permiso `kernel.*` en una plantilla se rechaza.
- [ ] Más de 20 plantillas, o un `key` repetido, se rechaza.

**HU-B2. Instalar crea los cargos.**
Como presidencia de un club, quiero que al instalar una app se creen los cargos
que necesita, para nombrar a alguien sin pedirle nada al distrito.

- [ ] La pantalla de instalación lista las plantillas que aplican, con sus permisos en lenguaje simple. Las `required` no se pueden destildar.
- [ ] Al confirmar se crean, en la misma transacción que la instalación:
  - los cargos;
  - su rol propio (`RoleDefinition.moduleId` completo);
  - los permisos del rol.
- [ ] Los cargos creados tienen `ownerOrganizationId` = la organización, nombre legible y código con prefijo del módulo.
- [ ] Se audita y se emite un evento con los cargos creados.
- [ ] Quien instala no necesita `kernel.position.create`.

**HU-B3. Nombrar en un cargo de módulo.**

- [ ] Los cargos de módulo aparecen en la pantalla de autoridades del club con una etiqueta «de la app X».
- [ ] Nombrar y activar funciona igual que con cualquier cargo, y la persona obtiene los permisos del módulo en esa organización.
- [ ] Con el módulo suspendido, `check` devuelve `allowed: false` y `MODULE_NOT_ACTIVE`.

**HU-B4. Desinstalar.**

- [ ] Al desinstalar:
  - los cargos del módulo quedan archivados;
  - sus nombramientos activos terminan con motivo `MODULE_UNINSTALLED`;
  - los `RoleAssignment` derivados quedan revocados.
- [ ] Al reinstalar, se reactivan los mismos cargos sin duplicarlos y sin reactivar nombramientos.
- [ ] La historia de nombramientos sigue visible.

**HU-B5. Grants a cargos existentes (solo distrito).**
Como RDR, quiero que al instalar una app distrital sus permisos se sumen a
cargos que ya existen (por ejemplo Secretaría), sin un script.

- [ ] Los `grants[]` se muestran como sugerencias para aprobar una por una.
- [ ] Un grant sobre un cargo de otro dueño (un club sobre `CLUB_PRESIDENT`) se rechaza con un mensaje claro.
- [ ] Al desinstalar, los permisos del módulo se quitan de esos cargos.
- [ ] **Validación con Correo:** con este mecanismo, `register-in-kernel.cjs:138-181` deja de hacer falta.

**HU-B6. Actualización del módulo.**

- [ ] Una nueva versión con plantillas nuevas muestra el aviso «hay cargos nuevos para crear» en la instalación, y no los crea sola.
- [ ] Los permisos agregados o quitados en una plantilla se reflejan según lo que se decida en D3.

### Épica C (opcional): autonomía del club

**HU-C1.** Como presidencia de club, quiero editar los permisos de los cargos
propios de mi club, limitado a permisos de módulos instalados en el club.

- [ ] Existe el permiso nuevo `kernel.position.manage-own`, con el alcance descrito en §4.6(b).
- [ ] Intentar atar un `kernel.*` o un permiso de un módulo no instalado devuelve 403.

---

## 6. Decisiones para el usuario

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| D1 | ¿`positions.read` muestra los permisos `kernel.*` de cada cargo? | (a) todos / (b) solo los del módulo + flag | (a) |
| D2 | ¿Cómo se resuelve la unicidad de códigos? | (a) prefijo + sufijo de organización / (b) unicidad por dueño | (a) ahora, (b) como deuda |
| D3 | Si una versión nueva agrega permisos a una plantilla… | se aplican solos / se muestra la diferencia para aprobar | Solos, si la versión pasó por revisión de apps |
| D4 | ¿Quién edita los cargos de módulo de un club? | (a) solo distrito / (b) `manage-own` para la presidencia | (a) primero |
| D5 | ¿Desinstalar termina los nombramientos o solo los deja sin efecto? | terminar / dejar | Terminar (historia más clara) |
| D6 | ¿Correo migra a plantillas + grants? | sí, en cuanto exista HU-B5 / no | Sí: borra el script y `config.ts` hardcodeado |

**Orden sugerido:** A1–A4 (lectura, bajo riesgo, desbloquea ya a las apps de
comités) → B1–B3 → B4–B5 → B6 → C1.
