# Flujo de ingreso a clubes — Distrito 4845

El Kernel conserva el término técnico `Organization` porque el contrato v1
modela distritos, clubes y otras unidades. La Web de esta instalación habla de
**Distrito**, **Club** y **Socio**: hay un único Distrito 4845 y la relación
cotidiana siempre se solicita con un club.

## Recorrido de una persona nueva

1. En `/register` completa sus datos y **elige su club** (obligatorio en Mi
   Rotaract) de `GET /auth/register/clubs`, el directorio público de clubes
   activos. Puede dejar un mensaje opcional para la presidencia. El Kernel
   valida que sea un club activo y lo guarda en la cuenta
   (`requestedOrganizationId`, `requestedMessage`); todavía no crea la
   solicitud, porque una cuenta sin verificar no puede pedir ingreso.
2. Verifica su email. Al activar la cuenta recibe el rol base
   `PLATFORM_USER` y, enseguida, el Kernel crea y envía la solicitud al club
   elegido en nombre de la persona, con los mismos comandos e invariantes que
   `/join-club` (`DRAFT → SUBMITTED`). Si eso falla (el club se desactivó,
   ya había una solicitud abierta…) la cuenta queda activa igual y la persona
   puede pedir ingreso desde `/join-club`. El club guardado se borra en ambos
   casos.
3. Sin un club relacionado, el panel muestra «Tu solicitud está en revisión»
   con un enlace a la solicitud o, si no tiene ninguna enviada, el botón a
   `/join-club`. `/applications` y `/applications/[id]` funcionan sin club:
   `kernel.application.read.self` limita la lista a sus propias solicitudes.
4. `/join-club` sigue disponible para quien no eligió club o fue rechazado:
   busca un club activo, deja un mensaje opcional y confirma. La Web compone
   las dos operaciones del Kernel (crear y enviar). No crea una membresía
   desde el navegador.
5. El Kernel vincula la solicitud a la `personId` del JWT, nunca a un dato que
   envíe el cliente. Rechaza clubes inactivos/no-club, una membresía ya activa
   y una solicitud abierta para el mismo club.
6. La presidencia del club, o una autoridad distrital con el alcance correcto,
   revisa la solicitud. Puede aprobar o rechazar con motivo obligatorio.
7. Al aprobar, una única transacción crea o reactiva la relación como
   `ACTIVE`, registra una transición inmutable y deja la solicitud en
   `APPROVED`. Al refrescar el contexto de usuario, el club aparece como
   espacio seleccionable y la persona accede a la vista de socios.

## Avisos

`SUBMITTED`, `APPROVED` y `REJECTED` escriben sus eventos contractuales en el
Outbox en la misma transacción. El Kernel no manda correo dentro del comando:
`MembershipApplicationNotifierService` (en el worker, `KERNEL_JOBS_ENABLED`)
lee esos eventos del Outbox y manda los emails por ClickMail:

| Evento | Destinatario | Contenido |
|---|---|---|
| `kernel.membership-application.submitted.v1` | Cada persona con `CLUB_PRESIDENT` vigente en el club | Quién pide ingresar, su mensaje y el enlace a `/applications/{id}` |
| `kernel.membership-application.approved.v1` | La persona que pidió ingresar | Bienvenida y enlace a `/dashboard` |
| `kernel.membership-application.rejected.v1` | La persona que pidió ingresar | Motivo y enlace a `/join-club` |

- Solo se avisa a la **presidencia**: ni la secretaría del club ni las
  autoridades distritales reciben el email de cada solicitud. Si un club no
  tiene presidencia vigente, el aviso va a `DISTRICT_COMITE_IT` para que la
  solicitud no se pierda.
- Un evento `submitted` de una solicitud que ya no está `SUBMITTED` (porque
  se canceló antes de que corriera el worker) no manda nada.
- Cada fila del Outbox se toma con `FOR UPDATE SKIP LOCKED` y se marca
  `emailsNotifiedAt` cuando salieron todos sus emails. Si ClickMail rechaza o
  no responde, se reintenta con backoff (30 s, 1 min, 2 min… hasta ~8,5 h,
  `emailAttempts`). Cada email lleva una clave de idempotencia
  (`application-submitted:{applicationId}:{personId}`, etc.), así que un
  reintento no duplica los que ya salieron.
- La dirección de destino es el email de la cuenta (o, si no tiene cuenta
  habilitada, el `primaryEmail` de la persona).
- El worker necesita `CLICKMAIL_API_KEY`, `CLICKMAIL_BASE_URL`,
  `CLICKMAIL_FROM_ADDRESS` y `KERNEL_PUBLIC_WEB_URL`. Sin API key no se manda
  nada y el evento se da por atendido. `KERNEL_APPLICATION_EMAILS_ENABLED=false`
  apaga solo estos avisos.
- No hay bandeja de avisos dentro de la app: el canal es el email.

## Casos administrativos

- **SUPERADMIN:** puede listar todas las personas y abrir cada ficha para ver
  sus relaciones de club e historial. No se duplica una tabla de asignaciones:
  la fuente es `GET /persons` seguida de
  `GET /persons/{personId}/memberships`.
- **Presidencia de club:** ve y resuelve solicitudes del propio club mediante
  `kernel.application.review` con alcance `ORGANIZATION`.
- **RDR:** usa el espacio del Distrito 4845 y sus clubes descendientes mediante
  `ORGANIZATION_TREE`; no requiere una membresía ficticia en el distrito.
- **Socio:** en la vista de un club ve sus socios relacionados. Internamente la
  relación histórica sigue siendo `OrganizationMembership` para preservar el
  contrato del Kernel.

## Límites intencionales

No se agregaron rutas, `fetch` directo, acceso a Prisma desde la Web ni lógica
de aprobación en el cliente. Las operaciones continúan siendo las ya
contratadas: directorio de clubes, solicitudes, membresías y autoridades.
