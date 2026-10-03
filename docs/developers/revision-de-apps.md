# Revisión de apps

Antes de que tu app pueda usar datos personales de cualquier socio del
distrito, el **Representante Distrital (RDR)** la revisa con una lista de
control. Mientras tanto la podés usar para probar: con tu cuenta, con
cuentas de prueba y con los datos que no son personales.

> Las apps que ya existían cuando empezó la revisión (octubre de 2026)
> quedaron aprobadas tal como estaban. Esto aplica a las apps nuevas y a
> los datos nuevos que pida una app existente.

## Qué revisa el RDR

| Punto | Qué tenés que cargar | Qué mira el RDR |
|---|---|---|
| Propósito | **Para qué es la app** y quién la usa (`purpose`, hasta 1000 caracteres) | Que sea una necesidad del club o del distrito |
| Datos que pide | Los permisos que elegiste al registrarla | Que sean los mínimos para ese propósito |
| Responsable | La persona que registró la app | Que haya alguien identificado que responda por ella |
| Política de privacidad | Una URL **https** (`privacyPolicyUrl`) | Que exista y diga qué guardás, para qué y por cuánto tiempo |
| Contacto | Un correo del equipo (`contactEmail`) | Que alguien conteste |

Lo cargás en la consola de apps (tu app → **Resumen** → **Datos para la
revisión**) o por la API:

```bash
curl -X PATCH "$API/developer/apps/$APP_ID" \
  -H "Authorization: Bearer $TOKEN_DE_SESION" \
  -H "Idempotency-Key: $(uuidgen)" -H "Content-Type: application/json" \
  -d '{"purpose":"Asistencia a las reuniones del club",
       "privacyPolicyUrl":"https://mi-app.example/privacidad",
       "contactEmail":"equipo@mi-app.example",
       "testAccountEmails":["tester@example.org"]}'
```

## Mientras tu app está en revisión

| Qué | Se puede |
|---|---|
| Ingresar con Mi Rotaract | Solo vos (la persona que registró la app) y hasta 20 **cuentas de prueba** (`testAccountEmails`). Cualquier otra persona ve "Esta app todavía está en revisión del distrito". |
| Token de servicio (`client_credentials`) | Solo con datos que no son personales: clubes y distrito (`kernel.service.organizations.read`), períodos y módulos. Si pedís otro scope explícitamente, el token responde `invalid_scope`. |
| Webhooks | Podés crear endpoints y mandar la prueba, pero no llegan eventos con datos personales. |
| Límites | 20 pedidos por minuto y 1000 por día (ver [limites.md](limites.md)). |
| Aparecer en el panel de los socios | No. |

Para probar con datos completos sin tocar los reales usá el kernel local
(`mirotaract dev`, ver [cli.md](cli.md)): la app de ejemplo del kernel local y las que crea el servidor MCP en el sandbox vienen aprobadas.

En la consola, tu app muestra **En revisión** y la lista de qué está
limitado. Por la API, `GET /developer/apps/{appId}` trae `reviewStatus`
(`IN_REVIEW`, `APPROVED`, `REJECTED`), `approvedScopes` (lo aprobado) y
`GET /developer/apps/{appId}/reviews` el historial con los motivos.

## Aprobada

Cuando el RDR aprueba, todo lo que la app pide queda aprobado
(`approvedScopes`) y funciona para cualquier persona dentro del alcance de
la app. Los límites pasan a los del distrito.

**Si después pedís un dato nuevo** (editás los datos que lee), la revisión
se reabre solo para eso: lo ya aprobado sigue funcionando para todos y lo
nuevo funciona solo para vos y las cuentas de prueba hasta que el RDR lo
apruebe. Si sacás un dato, deja de estar aprobado.

## Rechazada

El RDR escribe el motivo; lo ves en la consola. Corregí lo que pide y tocá
**Pedir revisión de nuevo** (`POST /developer/apps/{appId}/review-request`).
Si tu app ya tenía algo aprobado, eso sigue funcionando.

## Para el RDR

- **Revisión de apps** (menú Distrito): las apps esperando revisión del
  distrito y sus clubes, de la más vieja a la más nueva.
- En cada app, marcá los cinco puntos y aprobá, o rechazá con un motivo que
  le diga al equipo qué cambiar (al menos 10 caracteres). No se puede
  aprobar si falta el propósito, la política de privacidad o el contacto.
- En **Límites** podés fijar los límites propios de la app.
- Por la API: `GET /developer/app-reviews?organizationId=`, `POST
  /developer/apps/{appId}/review` con
  `{ "decision": "approve" | "reject", "checklist": {...}, "reason": "..." }`.
  Permiso `kernel.app.review`.

## Publicar tu app en Mi Rotaract

Una app aprobada puede aparecer en el inicio de Mi Rotaract (tarjetas
**Aplicaciones** y un ítem en el menú) para las personas que el RDR elija.
No hace falta que hagas nada en tu app: el botón abre tu app en una pestaña
nueva y tu app hace su "Ingresar con Mi Rotaract" de siempre. Como la
persona ya tiene sesión en Mi Rotaract, es un clic (y el consentimiento la
primera vez).

Pedile al RDR que la publique y decile:

- el **nombre** y una **descripción corta** (hasta 160 caracteres);
- el **ícono**: un nombre de [lucide](https://lucide.dev/icons) como
  `calendar-days`, o la URL https de una imagen cuadrada (el panel dibuja un conjunto de íconos comunes, como `calendar-days`, `users`, `vote` o `clipboard-list`; si no conoce el nombre, muestra uno genérico);
- el **enlace** para abrirla (https). Si no decís nada, se usa el origen de
  tu dirección de regreso;
- **para quién**: todas las personas del distrito, presidencias de club,
  autoridades de club (cualquier cargo), autoridades del distrito, o cargos
  puntuales (por ejemplo, secretarías).

Si tu app es un [módulo](modulos.md), el nombre (`ui.navLabel`), el ícono
(`ui.icon`) y el enlace (`ui.entryUrl`) de tu manifiesto ya vienen
completos. Si un club tiene tu módulo instalado pero no activo, sus socios
no ven la app.

Pausar o revocar la app la saca del panel. Mi Rotaract **no** saltea el
consentimiento de tu app: cada persona lo da la primera vez.
