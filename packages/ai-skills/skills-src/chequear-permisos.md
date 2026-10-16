---
name: mirotaract-permisos
title: Chequear permisos de una persona
description: >-
  Pregunta al kernel de Mi Rotaract si una persona puede hacer algo en una
  organización (POST /service/authorization/check y batch-check), o qué puede
  hacer en total (permisos efectivos), con permisos del kernel o de un módulo,
  cacheando hasta cacheUntil y fallando cerrado. Usala cuando pidan restringir
  una acción a presidencia, secretaría, RDR o a quien tenga cierto permiso,
  mostrar u ocultar botones o menús según rol, proteger rutas por permiso, o
  listar los cargos de un club y qué permite cada uno.
globs:
  - "**/*.{ts,tsx,js,mjs,py}"
---

## Regla

**No deduzcas permisos de los cargos ni de los claims del login**
(`positions`, `memberships`). Los permisos los decide el kernel (roles, cargos
y alcance por organización) y el RDR los puede reasignar. Preguntale:

`POST /service/authorization/check` · scope `kernel.service.authorization.check`
(token de servicio, solo servidor).

```json
{
  "subjectId": "<personId = sub del login>",
  "permission": "kernel.membership.read",
  "scope": { "type": "ORGANIZATION", "organizationId": "<club dentro del alcance de la app>" }
}
```

Respuesta: `{ allowed, decisionId, reasonCodes, matchedAssignments, evaluatedAt, cacheUntil }`.

- `scope.organizationId` es **obligatorio** para una app y tiene que estar
  dentro de su alcance (si no, `403`).
- `type`: `ORGANIZATION` (esa organización) u `ORGANIZATION_TREE`
  (la organización y sus descendientes).
- Podés cachear la decisión hasta `cacheUntil`, por persona + permiso +
  organización. No más.
- **Fallá cerrado**: si la consulta falla (red, 5xx), negá la acción.

## TypeScript

```ts
import "server-only";
import { MiRotaract } from "@mirotaract/sdk";

const mr = new MiRotaract({
  baseUrl: process.env.MIROTARACT_BASE_URL!,
  clientId: process.env.MIROTARACT_CLIENT_ID!,
  clientSecret: process.env.MIROTARACT_CLIENT_SECRET!,
  scope: ["kernel.service.authorization.check"],
});

export async function puede(personId: string, permission: string, organizationId: string) {
  try {
    const { allowed } = await mr.permissions.check({ personId, permission, organizationId });
    return allowed;
  } catch {
    return false; // fallar cerrado
  }
}

// Varias a la vez (máximo 100 por llamada, el SDK no parte la lista)
const decisiones = await mr.permissions.checkMany([
  { personId, permission: "kernel.membership.create", organizationId: clubId },
  { personId, permission: "kernel.appointment.read", organizationId: clubId },
]);
```

## Python

```python
decision = mr.permissions.check(
    person_id=user["sub"],
    permission="kernel.membership.read",
    organization_id=club_id,
)
if not decision["allowed"]:
    raise HTTPException(403, "No tenés permiso")
```

## Qué permiso usar

- `list_permissions` en el MCP lista los permisos del kernel (`kernel.*`), qué
  roles los tienen por defecto, y los scopes. Los más usados por apps:
  `kernel.membership.read` (ver padrón), `kernel.membership.create` /
  `kernel.membership.activate` (altas), `kernel.appointment.read`
  (autoridades), `kernel.period.read`, `kernel.application.review`.
- Si tu app es un módulo, definí permisos propios (`<moduleId>.<recurso>.<acción>`)
  en el manifiesto (skill `mirotaract-modulo`) y chequeá esos. Si además
  necesita un cargo que no existe, declaralo en `positions[]` del manifiesto.
- `personId` sale del `sub` del `id_token` verificado (skill
  `mirotaract-ingresar`), nunca de un parámetro que mande el navegador.

## ¿Qué puede hacer esta persona? (todos sus permisos)

Para armar un menú o una pantalla con muchas acciones, pedí **todos los
permisos de la persona en la organización** de una vez, en vez de N chequeos:

`GET /service/organizations/{organizationId}/persons/{personId}/permissions`
· scope `kernel.service.authorization.check` (el mismo que el chequeo).

```ts
// Ojo con el orden: primero la organización, después la persona.
const { permissions } = await mr.permissions.effective(clubId, personId);
const puedeEditar = permissions.includes("reuniones.meeting.manage");
```

```python
efectivos = mr.permissions.effective(club_id, user["sub"])
puede_editar = "reuniones.meeting.manage" in efectivos["permissions"]
```

- Devuelve `{ organizationId, personId, permissions: string[], evaluatedAt }`:
  las mismas decisiones que `check` daría una por una (incluye los permisos de
  módulos, y respeta si el módulo está activo en esa organización).
- **No trae `cacheUntil`**: usalo para una request o una pantalla, no lo
  guardes. Para proteger **una** acción concreta, seguí usando `check`.
- Mismas reglas: organización dentro del alcance de la app, `personId` del
  `sub` verificado, fallá cerrado (lista vacía si la consulta falla).

## Cargos: mostralos, no decidas con ellos

Con el scope `kernel.service.positions.read` podés listar los cargos que se
pueden ejercer en una organización (los del distrito, los propios del club y
los que crearon los módulos) y qué permite cada uno:

```ts
const cargos = await mr.positions.list(clubId, { includePermissions: true });
const cargo = await mr.positions.get("CLUB_PRESIDENT"); // con sus permisos
```

```python
cargos = mr.positions.list(club_id, include_permissions=True)
```

Sirve para **mostrar** ("Este cargo puede: …") o para documentar qué cargo
necesita alguien. **No** para autorizar: los códigos de cargos creados por
clubes o módulos no son nombres estables
(`reuniones.delegado-asamblea.rc-centro`), y el RDR puede cambiar qué permite
cada cargo. Para autorizar, siempre `check` o `effective`.

Si querés enterarte de cambios: webhooks `position.created.v1`,
`position.updated.v1` y `position.permissions-changed.v1` (skill
`mirotaract-webhooks`); invalidá tu caché de permisos al recibir el último.

## En la UI

Ocultar un botón no alcanza: **chequeá en el servidor** en cada acción. En el
cliente, solo mostrá lo que el servidor ya decidió (por ejemplo, un booleano
`puedeEditar` calculado en el Server Component).

## Errores

- `403` "Fuera del alcance de esta app": la organización no está en el árbol
  de la app.
- `400`: falta `scope.organizationId` o el permiso tiene formato inválido.
- Logueá `decisionId` si necesitás auditar, no datos de la persona.
