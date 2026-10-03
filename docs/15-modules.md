# 15 · Módulos y kit de UI (E8)

Épica E8 del plan _Mi Rotaract Developers_: "Que la solución de un comité se
pueda instalar en los clubes y se vea como parte de Mi Rotaract". Guías para
desarrolladores: [developers/modulos.md](developers/modulos.md) y
[developers/kit-de-ui.md](developers/kit-de-ui.md). Este documento fija las
decisiones de diseño.

## Piezas

| Pieza | Ubicación |
|---|---|
| Contrato del manifiesto (JSON Schema v1, tipos, `validateManifest`, `validateConfiguration`, CLI `mirotaract-module check`) | `packages/module-manifest` |
| Ejemplo: módulo "reuniones" | `packages/module-manifest/examples/reuniones/mirotaract.module.json` |
| Copia del esquema y validador en el kernel | `apps/institutional-kernel-api/src/application/modules/` |
| API de módulos | `kernel-openapi.yaml`, tag `Modules` (bloque "E8") |
| Migración | `prisma/migrations/20261004100000_modules_e8` |
| Pantallas | `apps/mirotaract-web/src/features/modules` (`/modules`), panel de permisos de cargos |
| Registro shadcn | `packages/registry` → `dist/r/*.json` |

## Manifiesto (`mirotaract.module.json`, contrato v1)

JSON Schema draft-07 publicado en
`https://developers.rotaract4845.com/schemas/module-manifest.v1.json`.
Campos: `id`, `name`, `description`, `version` (semver), `contractVersion: 1`,
`permissions[]` (`code`, `name`, `description`, `scopeType`),
`events.subscribes` / `events.emits`, `configurationSchema`, `ui` (`entryUrl`,
`navLabel`, `icon`), `oauth` (`clientId`, `scopes`) y `capabilities`.

Reglas que JSON Schema no expresa y valida `validateManifest`:

- cada permiso y cada evento propio empieza con `<id>.` (espacio de nombres
  del módulo; invariante 6.7.9). Los códigos siguen `<ns>.<recurso>.<acción>`
  (6.7.1);
- códigos únicos; ids reservados (`kernel`, `mirotaract`, `service`...);
- `configurationSchema` compila con ajv y su raíz es `object`;
- `ui.entryUrl` en https (http solo para localhost);
- `events.subscribes` existe en el catálogo público (el kernel lo exige; la
  CLI con `--events`).

Errores: `[{ path, message, keyword }]`, en español, con el `title` del campo
cuando lo hay ("Falta completar «Email de contacto del club».").

**Esquema vendorizado.** La imagen del kernel no incluye paquetes del
workspace (ver `infra/docker/api.Dockerfile`), así que el kernel guarda una
copia del esquema (`module-manifest.schema.ts`) y una versión TS del
validador. `manifest.spec.ts` falla si el esquema difiere del paquete. Para
regenerarlo después de cambiar el esquema, reescribí el objeto de
`module-manifest.schema.ts` con el contenido de
`packages/module-manifest/schema/module-manifest.v1.json`.

## Registro y versiones

- `POST /modules { appId, manifest }`. El módulo queda vinculado a la app de
  desarrollador (`developerAppId`) y se gobierna desde la organización de esa
  app (`ownerOrganizationId`). El guard autoriza `kernel.module.register`
  contra **la organización de la app**, nunca contra un `organizationId` que
  mande el cliente. El RDR recibe `kernel.module.register` (seed + migración);
  sigue siendo un permiso solo de distrito (`DISTRICT_ONLY_PERMISSIONS`).
- El módulo nace `ACTIVE`. Si el manifiesto trae `oauth.clientId`, tiene que
  ser el de la app. La app tiene que estar activa.
- Cada permiso del manifiesto se crea como `PermissionDefinition`
  (`namespace` = id del módulo, `moduleId`, `isSystem: false`,
  `resourceType` = segundo segmento). Un código que ya pertenece a otro → 409.
- `PUT /modules/{id}/manifest` publica una versión nueva (mismo id, versión
  ≥ la actual). Los permisos se sincronizan: altas, cambios de nombre y bajas;
  una baja quita el permiso de todos los cargos que lo tenían e invalida la
  caché de decisiones de quienes los ocupan.
- `POST /modules/{id}/deprecate`: no admite instalaciones nuevas (6.10.3).
- Módulos anteriores a E8 (sin dueño) solo los gestiona la plataforma. La
  migración retira el placeholder `meetings` que creaban los seeds viejos
  (si no tenía manifiesto v1 ni instalaciones).

## Permisos en cargos

Los permisos de módulos aparecen en `GET /permissions` (ahora acepta
`organizationId` para evaluar `kernel.role.read` en el distrito) y en la
pantalla de cargos agrupados por módulo. El RDR los asigna como cualquier
otro permiso (`PUT /position-definitions/{id}/permissions/{permissionId}`).
`scopeType` del manifiesto es informativo: el alcance real lo da la
asignación del cargo (club: `ORGANIZATION`; distrito: `ORGANIZATION_TREE`).

## Instalación por club

| Acción | Endpoint | Permiso |
|---|---|---|
| Instalar (`PENDING`), opcionalmente con configuración | `POST /organizations/{org}/modules/{id}/install` | `kernel.module.install` |
| Activar (valida la configuración) | `.../activate` | `kernel.module.install` |
| Configurar | `PATCH .../configuration` | `kernel.module.configure` |
| Desactivar (`SUSPENDED`, reversible) | `.../suspend` | `kernel.module.disable` |
| Desinstalar (`DISABLED`) | `.../disable` | `kernel.module.disable` |
| Vista de distrito | `GET /organizations/{org}/module-installations` | `kernel.module.read` |

La presidencia tiene esos permisos en su club; los cargos de distrito, en el
distrito y sus clubes. La configuración se valida con ajv contra el
`configurationSchema` (con `useDefaults`: se guarda con los valores por
defecto); un error es 422 `KERNEL_MODULE_CONFIGURATION_INVALID` con
`errors[]` en español (el `ProblemFilter` ahora pasa `errors` si la excepción
lo trae, y `Error` en el contrato lo documenta). Instalar dos veces → 409;
una instalación `DISABLED` se reinstala en el lugar y conserva su
configuración. Las transiciones responden 200 (antes 201 sin documentar).

## Los permisos de un módulo valen donde está activo

`AuthorizationService.check` agrega una compuerta para permisos con
`moduleId`: decide **la instalación más específica** (la de la organización;
si no tiene, la del padre, y así hacia arriba). `ACTIVE` → sigue la decisión
normal; `PENDING`/`SUSPENDED` → `MODULE_NOT_ACTIVE`; ninguna → 
`MODULE_NOT_INSTALLED`; módulo `DISABLED` → `MODULE_DISABLED` (también para
SUPERADMIN). Una instalación `DISABLED` cuenta como "no instalado ahí" (cae
al padre). Así, instalar en el distrito habilita el módulo en sus clubes, y
desactivarlo en un club lo apaga solo ahí. Los permisos `kernel.*` no pasan
por la compuerta.

Las apps lo consultan con `POST /service/authorization/check` (o
`/authorization/check`), y `GET /service/users/{accountId}/context` trae por
workspace `modulePermissions` (misma decisión, sin códigos de otros módulos
inactivos).

## Eventos

El outbox ya tenía `kernel.module-installed/activated/suspended/disabled/
configuration-updated.v1`. Se publican como `module.installed.v1`,
`module.enabled.v1`, `module.disabled.v1` (`reason`: `SUSPENDED` o
`DISABLED`) y `module.configured.v1`, con la instalación y su configuración.
Solo los recibe **la app dueña del módulo** (`ResolvedEvent.appId`), dentro
de su árbol de organizaciones. Módulos sin dueño no publican.

## Web

- `/modules` (Mi club → Módulos): catálogo en tarjetas (qué permite, sin
  códigos), instalar con un formulario generado del JSON Schema (texto,
  número, sí/no, opciones, listas y grupos; `title` como etiqueta,
  `description` como ayuda, defaults precargados, obligatorios chequeados
  antes de enviar, errores del kernel bajo cada campo), activar, configurar,
  desactivar, desinstalar y abrir (`ui.entryUrl`).
- En el workspace del distrito: pestañas "Para el distrito" y "En los
  clubes", y "Publicar módulo" / "Publicar versión" para el RDR.
- Cargos: el selector de permisos agrupa por módulo y lee el catálogo desde
  el dueño del cargo.

## Kit de UI: registro shadcn

Reemplaza [module-ui-contract.md](module-ui-contract.md) (paquetes
`@equipoit4845/*` en GitHub Packages, que exigían token para instalar).
`packages/registry/scripts/build.mjs` arma el registro **desde el producto**:
tema desde `globals.css`, componentes desde `apps/mirotaract-web/src/components`
con imports reescritos (`@/lib/cn` → `@/lib/utils`, `@/components/ui` →
`@/components/mirotaract/ui`, `next/link` → `MrLink`), catálogo de estados
desde `status-catalog.ts`. Todo se instala en `components/mirotaract/` para no
pisar el `components/ui` de la app. Ítems: `mirotaract-theme`, `mirotaract-ui`,
`app-shell`, `page-header`, `data-table`, `status-badge`, `confirm-dialog`,
`empty-state`. Las dependencias entre ítems son URLs absolutas
(`--base-url`, por defecto `https://developers.rotaract4845.com/r`); el portal
(E9) copia `dist/r` y lo sirve en `/r/`.

Verificado con el CLI real: app Next.js 15 + `shadcn init` nueva, `shadcn add`
de los 8 ítems desde un servidor HTTP local, `next build` con chequeo de tipos
y captura de una página con shell, tabla, badges y estado vacío.

## Pendiente

- Publicar `@mirotaract/module-manifest` en npm (hoy `private`).
- Los eventos propios de un módulo (`events.emits`) se declaran pero el kernel
  todavía no los transporta.
- `ui.navLabel`/`icon` todavía no agregan una entrada al menú de Mi Rotaract.
