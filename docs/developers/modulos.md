# Publicar tu app como módulo

Un **módulo** es la app de tu comité instalable en los clubes: tiene sus
propios permisos (que el distrito asigna a los cargos), una configuración que
cada club completa y una entrada desde Mi Rotaract. Se describe en un archivo,
`mirotaract.module.json` (el **manifiesto**).

Ejemplo real: el módulo de reuniones distritales,
[`packages/module-manifest/examples/reuniones/mirotaract.module.json`](../../packages/module-manifest/examples/reuniones/mirotaract.module.json).

## 1. Escribí el manifiesto

```json
{
  "$schema": "https://developers.rotaract4845.com/schemas/module-manifest.v1.json",
  "id": "reuniones",
  "name": "Reuniones distritales",
  "description": "Asambleas con quórum, votaciones por club y actas.",
  "version": "1.0.0",
  "contractVersion": 1,
  "permissions": [
    {
      "code": "reuniones.vote.cast",
      "name": "Votar en nombre del club",
      "scopeType": "ORGANIZATION"
    },
    {
      "code": "reuniones.meeting.manage",
      "name": "Crear y conducir reuniones distritales",
      "scopeType": "ORGANIZATION_TREE"
    }
  ],
  "events": { "subscribes": ["appointment.activated.v1"], "emits": [] },
  "configurationSchema": {
    "type": "object",
    "required": ["emailContacto"],
    "properties": {
      "emailContacto": {
        "type": "string",
        "format": "email",
        "title": "Email de contacto del club"
      },
      "votosPorClub": {
        "type": "integer",
        "title": "Votos por club",
        "minimum": 1,
        "maximum": 2,
        "default": 1
      }
    }
  },
  "ui": {
    "entryUrl": "https://reuniones.rotaract4845.com",
    "navLabel": "Reuniones",
    "icon": "calendar-check"
  },
  "oauth": { "scopes": ["openid", "profile", "kernel.service.authorization.check"] }
}
```

| Campo | Qué es |
|---|---|
| `id` | Identificador estable (minúsculas, números, guiones). No cambia nunca. Es el prefijo de tus permisos. |
| `version` | Versión semántica. Cada publicación nueva tiene que ser igual o mayor. |
| `permissions` | Lo que tu app deja hacer. **Cada código empieza con `<id>.`** y tiene la forma `<id>.<recurso>.<acción>`. El `name` es lo que ve el RDR: escribilo en lenguaje simple. |
| `scopeType` | `ORGANIZATION`: vale en el club de la persona. `ORGANIZATION_TREE`: pensado para cargos de distrito (vale en sus clubes). Es una guía para el RDR; el alcance real lo da el cargo. |
| `events.subscribes` | Eventos del [catálogo](catalogo-de-eventos.md) que tu app escucha. |
| `configurationSchema` | JSON Schema de la configuración de cada club. Con él Mi Rotaract arma el formulario: usá `title` y `description` en español, y `default` donde tenga sentido. |
| `ui.entryUrl` | Dónde se abre tu app (https). |
| `oauth.clientId` | Opcional; si lo ponés, tiene que ser el de la app dueña del módulo. |

## 2. Validalo

```bash
npx mirotaract-module check                    # ./mirotaract.module.json
npx mirotaract-module check --json             # { "ok": false, "errors": [...] } para CI
npx mirotaract-module check --events https://api.rotaract4845.com/api/kernel/v1/events/catalog
```

Desde código (Node 20+):

```js
import { validateManifest, validateConfiguration } from "@mirotaract/module-manifest";

const { ok, errors } = validateManifest(manifest);
// errors: [{ path: "permissions[0].code", message: "El permiso «kernel.x.y» tiene que empezar con «reuniones.»: ..." }]
```

> Instalación: `npm install @mirotaract/module-manifest` (incluye el comando
> `npx mirotaract-module check mirotaract.module.json`).

## 3. Pedile al RDR que lo publique

El módulo pertenece a una **app registrada** (ver
[registrar-una-app.md](registrar-una-app.md)). El RDR lo publica en Mi
Rotaract → Mi club → **Módulos** (con el distrito elegido) → **Publicar
módulo**: elige la app y pega o sube el manifiesto. Si algo está mal, la
pantalla lista cada problema con su campo.

Por API (con la sesión del RDR):

```bash
curl -X POST "$API/modules" -H "Authorization: Bearer $TOKEN_RDR" \
  -H "Idempotency-Key: $(uuidgen)" -H "Content-Type: application/json" \
  -d "{\"appId\": \"$APP_ID\", \"manifest\": $(cat mirotaract.module.json)}"
```

Versiones nuevas: "Publicar versión" en la tarjeta del módulo, o
`PUT /modules/{id}/manifest { "manifest": ... }`. Los permisos que saques del
manifiesto se quitan también de los cargos que los tenían.

## 4. El RDR asigna tus permisos a cargos

En **Cargos** → un cargo → "Qué puede hacer este cargo", los permisos de tu
módulo aparecen agrupados como "Módulo Reuniones distritales". Por ejemplo,
"Votar en nombre del club" a la Presidencia de club.

¿Hace falta un cargo nuevo para tu módulo (por ejemplo, "Dirección de
RotaMerch", uno por período)? El RDR lo crea en **Cargos → Crear cargo** con la
opción **"Este cargo da permisos en la plataforma"** marcada: Mi Rotaract le
crea un rol propio y después se le asignan tus permisos como a cualquier otro
cargo. Un cargo de distrito vale en todos los clubes donde el módulo está
activo. Un cargo que hoy es solo informativo se convierte con **"Activar
permisos para este cargo"**, y quienes ya lo ocupan reciben los permisos sin
volver a ser nombrados.

Por API: `POST /position-definitions` con `"grantsPermissions": true` y
`ownerOrganizationId` = el distrito; después
`PUT /position-definitions/{id}/permissions/{permissionId}` por cada permiso, y
el nombramiento pasa por `NOMINATED → ELECTED → ACTIVE`
(`/appointments/{id}/elect` y `/activate`).

## 5. Cada club lo instala y lo configura

La presidencia entra a **Módulos**, toca **Instalar**, completa el formulario
(generado de tu `configurationSchema`) y queda activo. Después puede
**Configurar**, **Desactivar** (reversible) o **Desinstalar** (no se borra lo
que tu app guardó; se puede volver a instalar). Instalado en el distrito,
vale para todos sus clubes, salvo un club que lo tenga desactivado.

La configuración se valida contra tu esquema y se guarda con sus valores por
defecto. Tu app la lee con
`GET /service/modules/{id}/installations/{organizationId}` (scope
`kernel.service.modules.read`) o la recibe en los eventos.

## 6. En tu app: chequeá permisos

Un permiso de módulo vale **solo donde el módulo está activo**. No guardes
roles por tu cuenta: preguntale al kernel.

```ts
const decision = await client.permissions.check({
  personId,
  permission: "reuniones.vote.cast",
  organizationId: clubId,
});
if (!decision.allowed) /* decision.reasonCodes: NO_GRANT, MODULE_NOT_INSTALLED, MODULE_NOT_ACTIVE... */;
```

```python
decision = client.permissions.check(
    person_id=person_id, permission="reuniones.vote.cast", organization_id=club_id
)
```

O de una vez para todos los clubes de la persona:
`GET /service/users/{accountId}/context` trae, en cada workspace,
`modulePermissions: ["reuniones.vote.cast"]`.

## 7. Enterate de instalaciones (opcional)

Suscribí tu endpoint de [webhooks](webhooks.md) a `module.installed.v1`,
`module.enabled.v1`, `module.disabled.v1` y `module.configured.v1`. Solo los
recibe la app dueña del módulo, con la instalación y su configuración.

## Errores comunes

| Código | Qué pasó |
|---|---|
| `KERNEL_MODULE_MANIFEST_INVALID` (422) | El manifiesto no cumple el contrato; mirá `errors[]`. |
| `KERNEL_MODULE_APP_MISMATCH` (422) | `oauth.clientId` no es el de la app dueña. |
| `KERNEL_MODULE_VERSION_DOWNGRADE` (422) | La versión es anterior a la publicada. |
| `KERNEL_MODULE_EXISTS` (409) | Ya hay un módulo con ese id: publicá una versión. |
| `KERNEL_MODULE_PERMISSION_TAKEN` (409) | Un código de permiso ya es de otro. |
| `KERNEL_MODULE_CONFIGURATION_INVALID` (422) | La configuración de un club no cumple tu esquema. |
| `KERNEL_MODULE_ALREADY_INSTALLED` (409) | El club ya lo tiene instalado. |

Para que se vea como Mi Rotaract, usá el [kit de UI](kit-de-ui.md).
