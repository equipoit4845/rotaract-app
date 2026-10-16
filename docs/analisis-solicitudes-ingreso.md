# Análisis: elegir club al registrarse y aviso a la presidencia

Fecha: 2026-10-16. Rama analizada: `correo-distrital`. Es solo un análisis:
no se cambió código ni datos. En prod solo se hicieron lecturas.

## Respuestas cortas

1. **¿Una persona puede elegir su club y enviar una solicitud de ingreso?**
   **Sí, pero no en el registro.** El formulario de `/register` solo crea la
   cuenta. Después de verificar el email e iniciar sesión, la persona ve un
   panel vacío con el botón "Buscar mi club", que lleva a `/join-club`. Ahí
   elige el club y la solicitud queda enviada (`SUBMITTED`). Hay un problema:
   justo después de enviarla, la web la lleva a `/applications/{id}`, y esa
   pantalla le muestra "Todavía no pertenecés a un club" en lugar de su
   solicitud.
2. **¿La presidencia del club recibe una notificación?** **No.** El kernel
   registra el evento `kernel.membership-application.submitted.v1` en el
   Outbox y lo publica en NATS, pero nada lo consume. No se manda email, no
   hay aviso dentro de la app y no hay webhook público para este evento. La
   presidencia solo se entera si abre Mi Rotaract y mira el contador
   "pendientes" del panel del club o la lista `/applications`.

En prod hay **0 solicitudes**: el flujo nunca se usó. Hay 28 clubes activos.
Los 28 tienen una asignación vigente de `CLUB_PRESIDENT` con cuenta `ACTIVE`,
así que se puede avisar a la presidencia de todos los clubes. Hay 19 cuentas
activas sin membresía activa; algunas son autoridades distritales y otras
podrían ser personas que nunca pidieron ingreso.

## Qué funciona hoy, paso a paso

### 1. Registro y verificación

- `/register` → `RegisterContainer`
  (`apps/mirotaract-web/src/features/auth/containers/register-container.tsx:33`)
  → `RegisterForm`
  (`apps/mirotaract-web/src/features/auth/forms/register-form.tsx:10-16`). El
  formulario pide solo nombre, apellido, email y contraseña, y no tiene campo
  de club. El comentario de `register-form.tsx:18-25` dice que esto es a
  propósito: "Joining a club … goes through a MembershipApplication".
- El kernel crea `Person` + `UserAccount` en estado `PENDING_VERIFICATION`,
  escribe `kernel.account.registered.v1` y manda el email de verificación
  (`apps/institutional-kernel-api/src/application/auth/auth.service.ts:126-178`).
- Cuando la persona verifica el email (`auth.service.ts:337`) o acepta una
  invitación (`auth.service.ts:480`), recibe el rol base `PLATFORM_USER` con
  alcance `PLATFORM` (`auth.service.ts:53-80`). En prod, ese rol tiene
  `kernel.organization.read`, `kernel.application.create.self`,
  `kernel.application.read.self` y `kernel.application.cancel.self`.

### 2. Elegir club

- Una persona sin espacio activo ve un estado vacío con un CTA a `/join-club`
  (`apps/mirotaract-web/src/features/shell/dashboard-shell.tsx:143-164`). La
  web no la redirige sola: tiene que hacer clic en el botón.
- `/join-club` (`apps/mirotaract-web/src/app/join-club/page.tsx`) usa
  `allowWithoutOrganization`. `JoinClubContainer`
  (`apps/mirotaract-web/src/features/applications/containers/join-club-container.tsx`)
  hace lo siguiente:
  - lista los clubes con `useOrganizations({ type: "CLUB", status: "ACTIVE" })`
    (`:35`) y permite buscarlos por nombre o código (`:39-49`);
  - al confirmar, hace `create` y después `submit` en cadena (`:53-65`),
    o sea, `DRAFT → SUBMITTED`. **No pide un mensaje**, aunque la API acepta
    `message`;
  - después navega a `/applications/{id}` (`:61`).

### 3. Kernel: crear y enviar

- `POST /membership-applications`
  (`apps/institutional-kernel-api/src/interfaces/http/workflow.controller.ts:24`)
  → `createApplication`
  (`apps/institutional-kernel-api/src/application/kernel/kernel.service.ts:1813-1885`):
  - el solicitante sale siempre del JWT (`:1814-1825`);
  - solo acepta organizaciones `CLUB` en estado `ACTIVE` (`:1838-1848`);
  - rechaza la solicitud si la persona ya tiene una membresía `ACTIVE` en ese
    club (`:1849-1862`) o si ya tiene otra solicitud abierta para el mismo
    club (`:1863-1874`);
  - **no escribe ningún evento en el Outbox** al crear el borrador. Esto es
    correcto, porque el evento contractual es `submitted`.
- `POST /membership-applications/:id/submit` (`workflow.controller.ts:41`) →
  `transitionApplication(id, "SUBMITTED")` (`kernel.service.ts:1902-2029`):
  - valida la transición con `applicationStateMachine`
    (`apps/institutional-kernel-api/src/domain/institutional/state-machines.ts:39-48`):
    `DRAFT → SUBMITTED|CANCELLED`, `SUBMITTED → APPROVED|REJECTED|CANCELLED|EXPIRED`;
  - escribe `submittedAt` y registra en el Outbox
    `kernel.membership-application.submitted.v1`, con payload
    `{ applicationId, organizationId, requesterPersonId }`
    (`kernel.service.ts:1907-1912`, `:1998-2026`).

### 4. Revisión

- Permisos (`apps/institutional-kernel-api/src/interfaces/http/kernel-access.guard.ts:278-284`):
  crear, enviar, ver y cancelar usan los permisos `.self`; aprobar y rechazar
  usan `kernel.application.review`. Si una persona tiene solo el permiso
  `.self`, el guard la limita a sus propias solicitudes (`:437-560`, con
  `applicationEscalation = ["kernel.application.review"]` en `:505`). La
  organización de la solicitud se resuelve desde su id (`:378-387`).
- En prod, tienen `kernel.application.review`: **`CLUB_PRESIDENT`**,
  `CLUB_SECRETARY`, `DISTRICT_RDR`, `DISTRICT_SECRETARY` y
  `DISTRICT_COMITE_IT`. `CLUB_TREASURER` no lo tiene. Las 28 asignaciones de
  presidencia tienen alcance `ORGANIZATION` y salen de nombramientos
  (`sourceAppointmentId`).
- Aprobar (`kernel.service.ts:1925-1979`) crea o reactiva la
  `OrganizationMembership` como `ACTIVE`, sincroniza el rol `MEMBER`,
  registra la `MembershipTransition` y escribe
  `kernel.membership-application.approved.v1`. Rechazar exige un motivo
  (`:1923-1924`) y escribe `...rejected.v1`.
- Las solicitudes vencidas pasan a `EXPIRED` en el job
  (`apps/institutional-kernel-api/src/application/jobs/kernel-jobs.service.ts:61-81`),
  pero solo si tienen `expiresAt`. La web nunca lo envía, así que en la
  práctica no vencen nunca.
- En la web, la presidencia ve "pendientes" en el panel del club
  (`apps/mirotaract-web/src/features/dashboard/containers/club-dashboard.tsx:50-53`,
  filtro `status: "SUBMITTED"`), la lista `/applications` y el detalle con
  los diálogos de aprobar y rechazar
  (`features/applications/forms/approve-application-dialog.tsx`,
  `reject-application-dialog.tsx`). En el panel distrital no hay agregado de
  solicitudes, a propósito (`district-dashboard.tsx:17-21`).

### 5. Notificaciones (lo que falta)

- `OutboxPublisherService.publishPending`
  (`apps/institutional-kernel-api/src/infrastructure/events/outbox-publisher.service.ts:34-100`)
  publica cada evento en el stream de JetStream `KERNEL_EVENTS`, con el
  subject `kernel.events.<eventType>`. **En el repo no hay ningún suscriptor
  de NATS.**
- Los webhooks públicos dependen de `planPublicEvent`
  (`apps/institutional-kernel-api/src/application/webhooks/event-mapper.ts:80-203`),
  que solo mapea eventos de membresía, nombramiento, organización, persona,
  período y módulo. Los eventos `membership-application.*` caen en `default`,
  así que no se publican. `correo-api` solo escucha
  `appointment.activated/ended`
  (`apps/correo-api/src/webhooks/kernel-webhook.controller.ts:54-58`).
- `NotificationService.sendEmail` (ClickMail,
  `apps/institutional-kernel-api/src/application/notifications/notification.service.ts:35`)
  solo se usa para verificación, reset, cambio de email
  (`auth.service.ts:172,359,529`) e invitaciones (`kernel.service.ts:292`).
- La web no tiene bandeja de entrada ni campanita.
- `docs/10-club-onboarding-flow.md` ("Avisos") ya documenta esta deuda: "El
  módulo de Notifications debe consumir … Mientras no se despliegue el
  consumidor Notifications, … no existe una bandeja de entrada visible".

## Qué falta

| # | Falta | Impacto |
|---|---|---|
| F1 | Avisar a la presidencia cuando llega `submitted` (email, como mínimo) | La presidencia no se entera; la solicitud queda olvidada |
| F2 | Avisar al solicitante cuando su solicitud se aprueba o se rechaza | La persona no sabe si entró ni por qué la rechazaron |
| F3 | La persona sin club no puede ver su solicitud: `/applications` y `/applications/[id]` no usan `allowWithoutOrganization` (`app/applications/page.tsx`, `app/applications/[applicationId]/page.tsx`) y el menú depende de `useCan(..., scope)` con un club activo (`use-shell-nav.ts:57`) | Después de enviar ve "Todavía no pertenecés a un club" y no tiene cómo seguir su solicitud |
| F4 | Elegir el club durante el registro (hoy es un paso aparte, al que se llega solo por el CTA) | Hay más fricción y aparecen cuentas huérfanas (19 cuentas activas sin club) |
| F5 | `/join-club` no permite escribir un mensaje para la presidencia | La presidencia no tiene contexto para decidir |
| F6 | Las solicitudes no tienen `expiresAt` | Pueden quedar `SUBMITTED` para siempre |

Elegir el club en el registro tiene una limitación: el usuario todavía no está
autenticado ni verificado, y `createApplication` exige un actor `USER` con
`kernel.application.create.self`. Por eso no conviene crear la solicitud en
`POST /auth/register`. Lo más seguro es **guardar el club elegido como
intención** y crear y enviar la solicitud cuando se verifica el email, que es
el momento en que la cuenta pasa a `ACTIVE` y recibe `PLATFORM_USER`. Así no
llegan a la presidencia solicitudes de emails sin verificar ni spam.

## Propuesta de implementación (para decidir)

### Decisión previa: ¿qué canal de aviso?

- **A. Email desde el kernel, con un consumidor del Outbox (recomendado).**
  Es un worker dentro del kernel, igual que `OutboxPublisherService`, que lee
  los `OutboxMessage` de `membership-application.*` y manda los emails con
  `NotificationService` (ClickMail ya está configurado en prod). Es lo que
  pide `docs/10`: el intento de aviso es durable y no se manda correo dentro
  del comando.
- B. Exponer `membership-application.*` como webhook público y que
  `correo-api` u otro módulo mande el aviso. Es más desacoplado, pero suma un
  contrato público nuevo y una dependencia entre servicios para algo
  interno.
- C. Bandeja de avisos dentro de la app (tabla `Notification` y campanita).
  Es más trabajo. Convendría como segunda etapa, encima de A.

### HU-1 — Aviso por email a la presidencia (F1)

*Como presidencia de un club, quiero recibir un email cuando alguien solicita
ingresar, para revisarlo a tiempo.*

Criterios de aceptación:
- Cuando una solicitud pasa a `SUBMITTED`, se manda un email a cada persona
  con una asignación vigente (no revocada y dentro de su validez) de un rol
  que tenga `kernel.application.review` con alcance `ORGANIZATION` sobre ese
  club. Hoy eso es `CLUB_PRESIDENT` y `CLUB_SECRETARY`; queda a decidir si
  también se avisa a la secretaría. No se avisa a las autoridades distritales
  con `ORGANIZATION_TREE`, para no mandar un email por cada solicitud del
  distrito.
- El email incluye el nombre del solicitante, el club, el mensaje (si hay) y
  un link a `/applications/{id}`.
- Es idempotente: usa `idempotencyKey = application-submitted:{applicationId}:{personId}`,
  así un reintento del worker no duplica emails.
- Si el club no tiene presidencia vigente, se avisa al Comité IT (o a quien se
  defina) y se registra un warning.
- Un fallo de ClickMail no cambia el estado de la solicitud. El evento queda
  para reintentar, con backoff, como `FAILED`.
- Hay un test e2e con el contenedor real: enviar una solicitud genera
  exactamente un intento de envío por destinatario.

### HU-2 — Aviso al solicitante del resultado (F2)

*Como persona que pidió ingresar, quiero saber si me aceptaron o me
rechazaron.*

- Cuando la solicitud se aprueba (`approved`), se manda un email al
  solicitante con un link a `/dashboard`, donde ya aparece el club.
- Cuando se rechaza (`rejected`), se manda un email con el motivo y un link a
  `/join-club`.
- Usa el mismo worker y el mismo esquema de idempotencia que la HU-1.

### HU-3 — Ver mis solicitudes sin pertenecer a un club (F3)

*Como persona sin club, quiero ver el estado de mi solicitud.*

- `/applications` y `/applications/[id]` funcionan con
  `allowWithoutOrganization`. Para alguien sin club, la lista muestra solo
  sus solicitudes, con el filtro `personId` que ya impone el guard.
- El estado vacío del shell muestra "Tu solicitud a *Club X* está en revisión"
  y un link a la solicitud, en lugar de "Buscar mi club", si hay una
  solicitud `SUBMITTED`.
- El menú muestra "Solicitudes" también sin club activo: el permiso `.self`
  se evalúa con alcance `PLATFORM`.
- Después de `/join-club`, la persona llega al detalle de su solicitud y lo
  ve.

### HU-4 — Elegir club en el registro (F4)

*Como persona nueva, quiero elegir mi club al crear la cuenta.*

- `/register` suma un selector de club que es opcional, usa búsqueda y lista
  solo clubes `ACTIVE`. Necesita un endpoint público y acotado con id,
  nombre y código, porque el directorio actual exige `kernel.organization.read`.
- `RegisterAccountRequest` acepta `requestedOrganizationId` y `message`, que
  son opcionales. El kernel guarda la intención (un campo en la cuenta o una
  tabla `PendingApplicationIntent`) y valida que el club sea un `CLUB`
  `ACTIVE`.
- Al verificar el email (`auth.service.ts:~337`), en la misma transacción que
  `grantBaselineRole`, el kernel crea y envía la solicitud. Usa la misma lógica
  que `createApplication` y `transitionApplication`, con las mismas
  invariantes, y eso dispara la HU-1.
- Si el club dejó de estar activo entre el registro y la verificación, la
  cuenta se activa igual y la persona ve `/join-club` con un aviso.
- Si no eligió club, el flujo de hoy no cambia.
- Se actualizan `kernel-openapi.yaml`, el SDK, la documentación del portal y
  `docs/10-club-onboarding-flow.md`.

### HU-5 — Mensaje y vencimiento (F5, F6), opcional

- `/join-club` y el registro tienen un campo "Contale a la presidencia por qué
  querés sumarte", opcional y de hasta 500 caracteres.
- Las solicitudes vencen a los N días (por ejemplo 30) si nadie las revisa,
  con un recordatorio a la presidencia a mitad de plazo. Queda a decidir si
  vale la pena.

### Orden sugerido

1. **HU-3** es pequeña, solo toca la web y arregla una pantalla rota hoy.
2. **HU-1 + HU-2** comparten el worker y resuelven la pregunta 2.
3. **HU-4** es la que más toca el contrato (registro, OpenAPI, SDK).
4. **HU-5** es opcional.

Preguntas para decidir:
- ¿El aviso va solo a la presidencia o también a la secretaría del club?
- ¿El canal es solo email (A) o también hay aviso dentro de la app (C)?
- ¿El club es obligatorio u opcional en el registro? Algunas personas se
  registran por invitación o son autoridades distritales sin club.
