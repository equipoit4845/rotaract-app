# Flujo de ingreso a clubes — Distrito 4845

El Kernel conserva el término técnico `Organization` porque el contrato v1
modela distritos, clubes y otras unidades. La Web de esta instalación habla de
**Distrito**, **Club** y **Socio**: hay un único Distrito 4845 y la relación
cotidiana siempre se solicita con un club.

## Recorrido de una persona nueva

1. Se registra y verifica su email. Al activar la cuenta recibe el rol base
   `PLATFORM_USER`, suficiente para ver el directorio de clubes activos y para
   operar sólo sobre sus propias solicitudes.
2. Sin un club relacionado, el panel dirige a `/join-club`.
3. Allí busca un club activo, lo selecciona y confirma. La Web compone las dos
   operaciones existentes del Kernel: crea el borrador y lo envía
   inmediatamente (`DRAFT → SUBMITTED`). No crea una membresía desde el
   navegador.
4. El Kernel vincula la solicitud a la `personId` del JWT, nunca a un dato que
   envíe el cliente. Rechaza clubes inactivos/no-club, una membresía ya activa
   y una solicitud abierta para el mismo club.
5. La presidencia del club, o una autoridad distrital con el alcance correcto,
   revisa la solicitud. Puede aprobar o rechazar con motivo obligatorio.
6. Al aprobar, una única transacción crea o reactiva la relación como
   `ACTIVE`, registra una transición inmutable y deja la solicitud en
   `APPROVED`. Al refrescar el contexto de usuario, el club aparece como
   espacio seleccionable y la persona accede a la vista de socios.

## Avisos

`SUBMITTED`, `APPROVED` y `REJECTED` escriben sus eventos contractuales en el
Outbox en la misma transacción. El módulo de Notifications debe consumir:

- `kernel.membership-application.submitted.v1` para avisar a las autoridades
  vigentes del club;
- `kernel.membership-application.approved.v1` y
  `kernel.membership-application.rejected.v1` para avisar a quien solicitó.

El Kernel no crea una notificación visual ni envía correo dentro de este caso
de uso; eso evita que la membresía persista sin un intento de entrega durable.
Mientras no se despliegue el consumidor Notifications, los eventos quedan
disponibles en Outbox/NATS pero no existe una bandeja de entrada visible.

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
