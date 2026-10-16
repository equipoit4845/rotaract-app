---
name: mirotaract-modulo
title: Crear un módulo de Mi Rotaract (manifiesto)
description: >-
  Crea o corrige el manifiesto de un módulo de Mi Rotaract
  (mirotaract.module.json): permisos propios en su namespace, eventos a los que
  se suscribe, esquema de configuración, entrada en la navegación y scopes
  OAuth mínimos, cargos que el módulo crea al instalarse (positions[]) y
  permisos sugeridos para cargos existentes (grants[]), y lo valida. Usala
  cuando pidan publicar una app como módulo, instalarla en clubes, definir
  permisos o cargos del módulo, o escribir el manifiesto.
globs:
  - "**/mirotaract.module.json"
  - "**/*.{ts,tsx,js,py}"
---

## Qué es un módulo

Un módulo es la app de un comité empaquetada para que **los clubes la
instalen** y se vea como parte de Mi Rotaract. Declara en
`mirotaract.module.json` (en la raíz del proyecto):

- sus **permisos propios**, en su namespace (`reuniones.meeting.manage`). El
  RDR los asigna a cargos desde la pantalla de permisos de cargos; tu app los
  consulta con el chequeo de permisos (skill `mirotaract-permisos`);
- los **eventos** que necesita (`events.subscribes`, tipos del catálogo);
- el **esquema de configuración** por club (JSON Schema): la presidencia lo
  completa al instalar y el kernel lo valida;
- la entrada en la navegación (`ui`) y los scopes OAuth que usa;
- opcional: los **cargos** que crea al instalarse (`positions[]`) y los
  permisos que sugiere sumar a cargos existentes (`grants[]`).

## Forma del manifiesto (contrato v1)

```json
{
  "$schema": "https://developers.rotaract4845.com/schemas/module-manifest.v1.json",
  "id": "reuniones",
  "name": "Reuniones",
  "description": "Asistencia y votaciones de las reuniones del club.",
  "version": "1.0.0",
  "contractVersion": 1,
  "permissions": [
    {
      "code": "reuniones.meeting.manage",
      "name": "Gestionar reuniones",
      "description": "Crear reuniones y tomar asistencia.",
      "scopeType": "ORGANIZATION"
    },
    {
      "code": "reuniones.meeting.vote",
      "name": "Votar en reuniones",
      "scopeType": "ORGANIZATION"
    }
  ],
  "events": { "subscribes": ["membership.activated.v1", "membership.ended.v1"], "emits": [] },
  "configurationSchema": {
    "type": "object",
    "properties": {
      "quorumPercent": { "type": "integer", "minimum": 1, "maximum": 100, "default": 50 }
    },
    "additionalProperties": false
  },
  "ui": { "entryUrl": "https://reuniones.rotaract4845.com", "navLabel": "Reuniones", "icon": "calendar" },
  "oauth": { "scopes": ["openid", "profile", "kernel.service.memberships.read"] }
}
```

Reglas:

- `id`: minúsculas, números y guiones; es el namespace. `version`: semver.
  `contractVersion`: `1`.
- **Cada `permissions[].code` empieza con `<id>.`** (nunca `kernel.*`: esos son
  del kernel). Formato `<id>.<recurso>.<acción>`. `scopeType`:
  `ORGANIZATION` (el club donde se instaló) o `ORGANIZATION_TREE` (la
  organización y sus descendientes, por ejemplo un módulo distrital).
- `events.subscribes`: solo tipos del catálogo (`list_events` en el MCP o
  `GET /events/catalog`), y la app necesita el scope de lectura de cada uno
  (por ejemplo `membership.*` → `kernel.service.memberships.read`).
  `ping.v1` no se suscribe. `events.emits`: tipos propios
  `<id>.<algo>.v1` (hoy vacío salvo que el contrato lo habilite).
- `configurationSchema`: JSON Schema `type: "object"`, con
  `additionalProperties: false` y valores por defecto. Nada de secretos en la
  configuración (la ven quienes administran el club).
- `ui.entryUrl`: `https://` (en local, `http://localhost:<puerto>`).
- `oauth.scopes`: los mínimos. `kernel.service.persons.contact.read` solo si el
  módulo contacta personas, y documentá para qué. `oauth.clientId` lo completa
  el RDR al registrar la app.

## Cargos del módulo (`positions[]` y `grants[]`, opcionales)

Si la app necesita un cargo que no existe (por ejemplo "Delegado/a a la
asamblea" en cada club), declaralo. Al instalar, la organización elige cuáles
crear y nombra personas desde Autoridades como en cualquier cargo.

```json
"positions": [
  {
    "key": "delegado-asamblea",
    "name": "Delegado/a a la asamblea",
    "description": "Representa al club en las reuniones distritales.",
    "organizationTypes": ["CLUB"],
    "permissions": ["reuniones.meeting.vote"],
    "install": "suggested"
  }
],
"grants": [
  { "positionCode": "DISTRICT_SECRETARY", "permissions": ["reuniones.meeting.manage"] }
]
```

- `positions[].permissions`: **solo permisos de este mismo módulo** (los de
  `permissions[]`). Nunca `kernel.*` ni de otro módulo: el validador y el
  kernel lo rechazan.
- `key`: minúsculas y guiones, única en el manifiesto. `organizationTypes`:
  `CLUB`, `DISTRICT` o ambos. `install`: `suggested` (default, se elige al
  instalar) o `required` (se crea siempre).
- El código del cargo **lo arma el kernel** (`<moduleId>.<key>.<slug del
  club>`): no lo hardcodees. Para autorizar, chequeá el permiso del módulo;
  para mostrar el cargo, `mr.positions.list(clubId)`.
- `grants[]` son **sugerencias** sobre cargos existentes: se aplican solo si
  quien instala las aprueba y solo sobre cargos que administra esa
  organización (un club no puede tocar `CLUB_PRESIDENT`; el distrito sí).
- Al desinstalar, los cargos del módulo se archivan (terminan sus
  nombramientos) y se quitan los permisos de los `grants[]`.
- ¿Alcanza con que el RDR asigne tus permisos a cargos existentes? Entonces no
  declares `positions[]`: menos cargos es mejor.

## Validarlo

- MCP: `validate_module_manifest` con el contenido del archivo (devuelve
  `ok`, `errors[]` con ruta y mensaje, y advertencias).
- Código: `import { validateManifest } from "@mirotaract/module-manifest"` →
  `{ ok, errors }` (esquema en
  `packages/module-manifest/schema/module-manifest.v1.json`).
- Corregí **todos** los errores antes de pedir el registro al RDR.

## Usar los permisos del módulo en tu app

```ts
const { allowed } = await mr.permissions.check({
  personId: session.user.sub,
  permission: "reuniones.meeting.manage",
  organizationId: clubId,                      // el club donde está instalado
});
if (!allowed) return new Response("No tenés permiso", { status: 403 });
```

Para saber si el módulo está instalado y activo en un club:
`GET /service/modules/{moduleId}/installations/{organizationId}` (scope
`kernel.service.modules.read`; `404` = no instalado).

## Errores típicos

- Permiso sin el prefijo del módulo, o con `kernel.` → inválido.
- Suscribirse a un evento sin pedir el scope que lo habilita → la consola no
  deja activar ese evento.
- Pedir `kernel.service.persons.contact.read` "por las dudas" → el RDR lo
  rechaza; pedí lo que usás.
- Decidir permisos por cargo (`positionCode === "CLUB_PRESIDENT"`) en vez de
  preguntar al kernel → se rompe cuando el RDR reasigna permisos.
- Un cargo de `positions[]` con un permiso `kernel.*` o de otro módulo →
  inválido.
- Hardcodear el código de un cargo creado por el módulo → cambia por club.

Guía completa: `docs/developers/modulos.md` (`read_doc modulos` en el MCP).
