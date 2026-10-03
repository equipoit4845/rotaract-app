---
name: mirotaract-permisos
title: Chequear permisos de una persona
description: >-
  Pregunta al kernel de Mi Rotaract si una persona puede hacer algo en una
  organización (POST /service/authorization/check y batch-check), con permisos
  del kernel o de un módulo, cacheando hasta cacheUntil y fallando cerrado.
  Usala cuando pidan restringir una acción a presidencia, secretaría, RDR o a
  quien tenga cierto permiso, mostrar u ocultar botones según rol, o proteger
  rutas por permiso.
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
  en el manifiesto (skill `mirotaract-modulo`) y chequeá esos.
- `personId` sale del `sub` del `id_token` verificado (skill
  `mirotaract-ingresar`), nunca de un parámetro que mande el navegador.

## En la UI

Ocultar un botón no alcanza: **chequeá en el servidor** en cada acción. En el
cliente, solo mostrá lo que el servidor ya decidió (por ejemplo, un booleano
`puedeEditar` calculado en el Server Component).

## Errores

- `403` "Fuera del alcance de esta app": la organización no está en el árbol
  de la app.
- `400`: falta `scope.organizationId` o el permiso tiene formato inválido.
- Logueá `decisionId` si necesitás auditar, no datos de la persona.
