# Mapa de historias de usuario — Mi Rotaract

> Relevamiento realizado sobre el código fuente actual (`apps/api/src/*`, `apps/web/src/app/*`) en la rama `feat/live-meeting-transcription-quorum`. Cada historia de usuario (HU) está verificada contra un endpoint y/o pantalla real — no se documentan funcionalidades aspiracionales. Cuando una capacidad de backend no tiene pantalla que la consuma, se indica explícitamente como `N/A (solo backend)`.

## Leyenda de roles

| Rol (claim JWT) | Alias en BD | Descripción |
|---|---|---|
| `PARTICIPANT` | `USER` | Socio/a de club sin cargo especial. Vota si `MeetingParticipant.canVote=true`. |
| `PRESIDENT` | — (virtual) | Presidente de club. **No se persiste**: se calcula al login desde `Membership.isPresident`. |
| `SECRETARY` | `DISTRICT_SECRETARY` | Secretaría distrital. Rol administrativo operativo más amplio del sistema. |
| `RDR` | `DISTRICT_RDR` | Representante Distrital de Rotaract. Modera reuniones, resuelve desempates de votación (Art. 49). |
| `COMPANY` | — | Empresa que publica oportunidades y/o busca talento en el directorio. |
| `SUPERADMIN` | — | Administración global de la plataforma. Pasa cualquier chequeo de rol (`RolesGuard`). |

## Cómo leer este documento

Cada historia usa el formato: **Como** `<rol>`, **quiero** `<acción>`, **para** `<objetivo>`, con la(s) pantalla(s) frontend y endpoint(s)/evento(s) backend que la implementan. El código `HU-<MÓDULO>-NN` es estable y se referencia también desde el documento de [Requerimientos funcionales](./02-requerimientos-funcionales.md).

## Mapa general (backbone por dominio)

| Dominio | Alta / Configuración | Operación diaria | Colaboración en vivo | Seguimiento y cierre |
|---|---|---|---|---|
| **Identidad y Plataforma** | Registro, login, alta de usuarios (individual o CSV) | Gestión de perfil, membresías, avatar | Notificaciones in-app | Auditoría, historial de reuniones, dashboard por rol |
| **Reuniones distritales en vivo** | Crear reunión, cargar agenda, cartas poder | Iniciar/pausar/finalizar, control de quórum y asistencia | Votación, mociones, cola de oradores, timers, transcripción en vivo | Generación y publicación de acta, exportación de votos |
| **Mi Club y Distrito** | Alta de club, alta de socios, períodos distritales | Gestión de socios, proyectos, junta directiva, comités | Solicitudes de ingreso, transferencias entre clubes | Informes periódicos y su revisión/aprobación distrital |
| **Eventos y Desarrollo Profesional** | Crear evento, definir ticket/cuotas/comidas/formulario | Publicar evento, inscripciones, permisos distritales | Check-in y escaneo de comidas el día del evento | Reportes de pagos, emails automáticos, cierre del evento |

---

## 1. Identidad y Plataforma

### 1.1 Autenticación y cuenta

- **HU-AUTH-01** — Como visitante, quiero registrarme con nombre, email y contraseña, para crear mi cuenta de `PARTICIPANT` y empezar a usar la plataforma.
  Pantalla: `/register` · Endpoint: `POST /auth/register`
- **HU-AUTH-02** — Como usuario registrado, quiero iniciar sesión con email y contraseña, para acceder a mi cuenta y obtener un token de sesión.
  Pantalla: `/login` · Endpoint: `POST /auth/login`
- **HU-AUTH-03** — Como usuario que olvidó su contraseña, quiero solicitar un enlace de recuperación por email, para restablecerla sin depender de un administrador.
  Pantalla: `/recuperar-contrasena` · Endpoint: `POST /auth/forgot-password`
- **HU-AUTH-04** — Como usuario con un enlace de recuperación válido, quiero definir una nueva contraseña, para volver a acceder a mi cuenta.
  Pantalla: `/restablecer?token=...` · Endpoint: `POST /auth/reset-password`
- **HU-AUTH-05** — Como usuario autenticado, quiero cambiar mi contraseña actual desde configuración, para mantener mi cuenta segura.
  Pantalla: `/configuracion/seguridad` · Endpoint: `PATCH /auth/me/password`
- **HU-AUTH-06** — Como usuario autenticado, quiero ver mis datos de sesión (nombre, email, rol efectivo, membresías activas), para que la interfaz se adapte a mi rol.
  Pantalla: N/A (uso interno del contexto de autenticación) · Endpoint: `GET /auth/me`
- **HU-AUTH-07** — Como usuario autenticado, quiero actualizar mi nombre y/o email de cuenta, para mantener mis datos correctos.
  Pantalla: `/configuracion/perfil` · Endpoint: `PATCH /auth/me`

### 1.2 Gestión de usuarios del distrito

- **HU-USR-01** — Como secretario/presidente/RDR/superadmin, quiero ver el listado completo de usuarios del distrito con sus membresías activas, para tener visibilidad de quién está en la plataforma.
  Pantalla: `/admin/usuarios` · Endpoint: `GET /users`
- **HU-USR-02** — Como secretario distrital, quiero descargar una plantilla CSV y cargar usuarios en lote, para dar de alta a muchos socios de una vez.
  Pantalla: N/A (backend implementado, sin consumo frontend) · Endpoint: `GET /users/bulk/template`, `POST /users/bulk`
- **HU-USR-03** — Como superadmin, quiero editar nombre, email, rol y estado activo/inactivo de cualquier usuario, para corregir datos o gestionar accesos.
  Pantalla: `/admin/usuarios` (diálogo "Editar") · Endpoint: `PATCH /users/:id`
- **HU-USR-04** — Como superadmin, quiero forzar el envío de un email de restablecimiento de contraseña a un usuario, para ayudarlo a recuperar el acceso.
  Pantalla: `/admin/usuarios` (diálogo "Resetear contraseña") · Endpoint: `POST /users/:id/reset-password`
- **HU-USR-05** — Como superadmin, quiero agregar o quitar la membresía de un usuario a un club, para corregir su pertenencia institucional.
  Pantalla: `/admin/usuarios` (diálogo "Membresías") · Endpoint: `POST /users/:id/memberships`, `DELETE /users/:id/memberships/:clubId`
- **HU-USR-06** — Como superadmin, quiero asignar a un usuario como presidente actual de un club, para reflejar cambios de directiva.
  Pantalla: `/admin/usuarios` (botón "Hacer Presidente") · Endpoint: `POST /users/:id/memberships/:clubId/set-president`

### 1.3 Administración de plataforma (panel SuperAdmin ampliado)

- **HU-PADM-01** — Como superadmin, quiero ver un panel de alertas de la plataforma (solicitudes vencidas, clubes sin presidente, usuarios sin club), para detectar problemas operativos.
  Pantalla: N/A (sin consumo frontend) · Endpoint: `GET /admin/platform/alerts`
- **HU-PADM-02** — Como superadmin, quiero buscar y filtrar usuarios por nombre, email, rol o presencia de club, para ubicar rápidamente un caso a resolver.
  Pantalla: N/A · Endpoint: `GET /admin/platform/users`
- **HU-PADM-03** — Como superadmin, quiero ver el detalle completo de un usuario (membresías, fichas de socio, últimas 20 auditorías), para investigar un caso puntual.
  Pantalla: N/A · Endpoint: `GET /admin/platform/users/:id`
- **HU-PADM-04** — Como superadmin, quiero asignar un usuario a un club con un rol de club específico, para resolver altas fuera del flujo normal.
  Pantalla: N/A · Endpoint: `POST /admin/platform/users/:id/assign-club`
- **HU-PADM-05** — Como superadmin, quiero quitar a un usuario de un club, para corregir asignaciones erróneas.
  Pantalla: N/A · Endpoint: `POST /admin/platform/users/:id/remove-from-club`
- **HU-PADM-06** — Como superadmin, quiero resetear la contraseña de un usuario y recibir la temporal en la respuesta, para comunicarla yo mismo por otro canal.
  Pantalla: N/A · Endpoint: `POST /admin/platform/users/:id/reset-password`
- **HU-PADM-07** — Como superadmin, quiero desactivar o reactivar la cuenta de un usuario, para bloquear o restaurar su acceso sin borrar sus datos.
  Pantalla: N/A · Endpoint: `POST /admin/platform/users/:id/deactivate`, `.../reactivate`

> Nota: este submódulo (`platform-admin`) duplica parcialmente a `/admin/usuarios` (1.2) con más capacidades, pero no tiene pantalla propia — ver [Requerimientos funcionales](./02-requerimientos-funcionales.md) para el detalle.

### 1.4 Perfil personal y profesional

- **HU-PROF-01** — Como usuario autenticado, quiero ver mi perfil profesional (profesión, bio, ciudad, LinkedIn, skills, experiencia, educación, idiomas), para gestionarlo desde un solo lugar.
  Pantalla: `/perfil/profesional`, `/configuracion/perfil` · Endpoint: `GET /profile/me`
- **HU-PROF-02** — Como usuario autenticado, quiero completar o editar mi perfil profesional, para que otros socios y empresas conozcan mi trayectoria si lo hago visible.
  Pantalla: `/perfil/profesional` · Endpoint: `PUT /profile/me`
- **HU-PROF-03** — Como usuario autenticado, quiero decidir si mi perfil aparece en el buscador de talento, para controlar mi visibilidad pública.
  Pantalla: `/perfil/profesional` · Endpoint: `PATCH /profile/me/visibility`
- **HU-PROF-04** — Como usuario autenticado, quiero subir una foto de perfil, para personalizar mi cuenta.
  Pantalla: `/configuracion/perfil` · Endpoint: `POST /profile/me/avatar`
- **HU-PROF-05** — Como usuario autenticado, quiero ver la foto de perfil de otro socio de mi club, para identificar personas en listados y reuniones.
  Pantalla: embebido como `<img>` en listados de socios/reuniones · Endpoint: `GET /profile/avatar/:userId`
- **HU-PROF-06** — Como usuario autenticado con más de una membresía, quiero elegir el club activo, para que el resto de la plataforma opere en ese contexto.
  Pantalla: selector de club activo (navegación) · Endpoint: `POST /me/active-club`

### 1.5 Notificaciones in-app

- **HU-NOTIF-01** — Como usuario autenticado, quiero ver mis notificaciones recientes y cuántas tengo sin leer, para enterarme de eventos relevantes.
  Pantalla: N/A (sin componente de campana/listado encontrado en frontend) · Endpoint: `GET /notifications`
- **HU-NOTIF-02** — Como usuario autenticado, quiero marcar una notificación como leída, para llevar registro de lo revisado.
  Pantalla: N/A · Endpoint: `PATCH /notifications/:id/read`
- **HU-NOTIF-03** — Como usuario autenticado, quiero marcar todas mis notificaciones como leídas de una vez, para limpiar mi bandeja.
  Pantalla: N/A · Endpoint: `PATCH /notifications/read-all`

### 1.6 Empresas (bolsa de talento)

- **HU-COMP-01** — Como empresa interesada en la red de talento Rotaract, quiero registrarme con los datos de mi empresa y un contacto, para acceder como cuenta tipo `COMPANY`.
  Pantalla: `/talento/empresas/registro` · Endpoint: `POST /companies/register`
- **HU-COMP-02** — Como empresa autenticada, quiero ver los datos de mi perfil de empresa, para verificarlos.
  Pantalla: N/A (sin pantalla dedicada) · Endpoint: `GET /companies/me`
- **HU-COMP-03** — Como empresa autenticada, quiero actualizar los datos de contacto y de la empresa, para mantenerlos al día.
  Pantalla: N/A · Endpoint: `PATCH /companies/me`

### 1.7 Auditoría

- **HU-AUDIT-01** — Como secretario/presidente/RDR, quiero ver el registro de auditoría de una reunión puntual, para revisar qué acciones se tomaron y por quién.
  Pantalla: `/history/[id]` · Endpoint: `GET /history/meetings/:meetingId/audit`
- **HU-AUDIT-02** — Como superadmin, quiero ver las últimas 20 entradas de auditoría relacionadas a un usuario, para investigar su actividad.
  Pantalla: N/A (incluido en detalle de usuario de platform-admin) · Endpoint: `GET /admin/platform/users/:id`

### 1.8 Adjuntos (transversal)

- **HU-ATT-01** — Como usuario con acceso a una entidad (informe, proyecto, evento, actividad de comité, reunión), quiero descargar un adjunto subido a esa entidad, para consultar el archivo original.
  Pantalla: enlaces de descarga embebidos en cada entidad · Endpoint: `GET /attachments/:id/download`

### 1.9 Dashboard (inicio)

- **HU-DASH-01** — Como usuario autenticado, quiero ver un panel de inicio adaptado a mi rol (secretaría, presidente/RDR o participante), con alertas, próximas reuniones y eventos, accesos rápidos e indicadores de mi club, para tener una vista rápida de lo que me corresponde atender.
  Pantalla: `/dashboard` · Endpoint: `GET /dashboard`

### 1.10 Historial

- **HU-HIST-01** — Como usuario autenticado, quiero ver el listado de reuniones en las que participé o que ya finalizaron, para consultar reuniones pasadas.
  Pantalla: `/history` · Endpoint: `GET /history/meetings`
- **HU-HIST-02** — Como usuario autenticado, quiero ver el detalle de una reunión del historial, para revisar lo tratado.
  Pantalla: `/history/[id]` · Endpoint: `GET /history/meetings/:meetingId`
- **HU-HIST-03** — Como secretario/presidente/RDR, quiero ver las sesiones de votación de una reunión pasada, para auditar cómo se resolvió cada tema.
  Pantalla: `/history/[id]` · Endpoint: `GET /history/meetings/:meetingId/votes`
- **HU-HIST-04** — Como secretario/presidente/RDR, quiero exportar los votos de una reunión en CSV, para llevar un registro externo o adjuntarlo a un acta.
  Pantalla: `/history/[id]` · Endpoint: `GET /history/meetings/:meetingId/votes/export`

---

## 2. Reuniones distritales en vivo

### 2.1 Reuniones — CRUD, ciclo de vida, asistencia y quórum

- **HU-MEET-01** — Como secretario/RDR, quiero crear una reunión (ordinaria o extraordinaria, distrital o de club), para convocar al Consejo Distrital o a un club conforme al Art. 37/39.
  Pantalla: `/admin/meetings/new` · Endpoint: `POST /meetings`
- **HU-MEET-02** — Como secretario/RDR, quiero importar reuniones masivamente vía CSV, para cargar el calendario distrital rápidamente.
  Pantalla: `/admin/meetings` · Endpoint: `GET /meetings/bulk/template`, `POST /meetings/bulk`
- **HU-MEET-03** — Como secretario/RDR, quiero pasar una reunión de DRAFT a SCHEDULED, iniciarla (LIVE), pausarla, reanudarla y finalizarla, para controlar el ciclo de vida en tiempo real.
  Pantalla: `/admin/meetings/[id]`, `/admin/meetings/[id]/live` · Endpoint: `POST /meetings/:id/{schedule,start,pause,resume,finish}`
- **HU-MEET-04** — Como secretario/RDR, quiero que el sistema calcule y verifique el quórum (2/3 de clubes habilitados) al iniciar y al cerrar asistencia, para cumplir el Art. 41/42.
  Pantalla: `/admin/meetings/[id]/live` (indicador de quórum) · Endpoint: `POST /meetings/:id/start`, `POST /meetings/:id/lock-attendance`, `ws:meeting.snapshot`
- **HU-MEET-05** — Como secretario/RDR, quiero cerrar (bloquear) la asistencia una vez verificada, para impedir avanzar el orden del día sin control de presentes.
  Pantalla: `/admin/meetings/[id]/live` · Endpoint: `POST /meetings/:id/lock-attendance`
- **HU-MEET-06** — Como presidente de club o delegado con carta poder, quiero unirme a la sala en vivo por WebSocket y que el sistema registre automáticamente la asistencia de mi club, para contar para el quórum.
  Pantalla: `/meetings/[id]/live` · Evento: `ws:join_meeting` / `ws:meeting.join`
- **HU-MEET-07** — Como secretario/RDR, quiero asignar o corregir manualmente qué usuario representa a un club en la reunión (o quitar su asistencia), para corregir errores de conexión o suplantar representantes ausentes.
  Pantalla: `/admin/meetings/[id]/live` · Endpoint: `POST /meetings/:id/clubs/:clubId/representative`, `DELETE /meetings/:id/clubs/:clubId/attendance`
- **HU-MEET-08** — Como secretario, quiero asignar participantes individualmente o en bloque (CSV) a una reunión no distrital, y marcar si pueden votar, para reuniones de club.
  Pantalla: `/admin/meetings/[id]` · Endpoint: `POST /meetings/:id/participants`, `POST /meetings/:id/participants/bulk`
- **HU-MEET-09** — Como secretario/RDR, quiero subir y listar archivos adjuntos de la reunión, para compartir documentación de agenda.
  Pantalla: `/admin/meetings/[id]` · Endpoint: `GET/POST /meetings/:id/attachments`, `DELETE .../:attachmentId`
- **HU-MEET-10** — Como secretario/RDR, quiero habilitar/deshabilitar la transcripción en vivo de la reunión, para controlar cuándo se graba el acta automáticamente.
  Pantalla: `/admin/meetings/[id]/live` · Endpoint: `POST /meetings/:id/transcription`, `ws:meeting.toggleTranscription`
- **HU-MEET-11** — Como secretario, al finalizar la reunión quiero que se genere automáticamente un borrador de acta, para no redactarla desde cero.
  Pantalla: N/A (automático) · Endpoint: `POST /meetings/:id/finish` (dispara generación interna del acta)

### 2.2 Acta de reunión

- **HU-ACTA-01** — Como secretario, quiero generar/regenerar el borrador del acta manualmente, para asegurarme de tener el contenido actualizado.
  Pantalla: editor de acta · Endpoint: `POST /meetings/:meetingId/acta/generate`
- **HU-ACTA-02** — Como secretario, quiero que la IA complete automáticamente los resúmenes de cada tema a partir de las transcripciones, para ahorrar tiempo de redacción.
  Pantalla: editor de acta · Endpoint: `POST /meetings/:meetingId/acta/autocomplete-ai`
- **HU-ACTA-03** — Como secretario, quiero editar el contenido del acta antes de publicarla, para corregir o enriquecer la redacción.
  Pantalla: editor de acta · Endpoint: `PATCH /meetings/:meetingId/acta`
- **HU-ACTA-04** — Como secretario, quiero publicar el acta para que quede inmutable y visible a los interesados, para dar por cerrado el registro oficial.
  Pantalla: editor de acta · Endpoint: `POST /meetings/:meetingId/acta/publish`
- **HU-ACTA-05** — Como secretario/presidente/RDR/participante, quiero descargar el acta en PDF, para archivo y distribución oficial.
  Pantalla: editor de acta · Endpoint: `GET /meetings/:meetingId/acta/pdf`

### 2.3 Votación

- **HU-VOTE-01** — Como secretario/RDR, quiero abrir una votación sobre el tema actual (pública o secreta, con la mayoría requerida, SI/NO o por candidatos), para decidir formalmente un asunto del orden del día.
  Pantalla: `/admin/meetings/[id]/live` · Endpoint: `POST /meetings/:meetingId/vote/open`, `ws:meeting.vote.opened`
- **HU-VOTE-02** — Como presidente de club/delegado, quiero emitir mi voto (SI/NO/ABSTENCIÓN o candidato) mientras la votación está abierta, para representar la decisión de mi club.
  Pantalla: `/meetings/[id]/live` · Endpoint: `POST /meetings/:meetingId/vote`, `ws:vote.submit`
- **HU-VOTE-03** — Como secretario/RDR, quiero registrar manualmente el voto de un club (representante ausente pero con presidente/carta poder verificada), para no perder su voto.
  Pantalla: `/admin/meetings/[id]/live` · Endpoint: `POST /meetings/:meetingId/vote/manual`
- **HU-VOTE-04** — Como secretario/RDR, quiero cerrar la votación y ver el resultado agregado, para anunciar la decisión.
  Pantalla: `/admin/meetings/[id]/live` · Endpoint: `POST /meetings/:meetingId/vote/close`, `ws:meeting.vote.closed`
- **HU-VOTE-05** — Como RDR, quiero votar el desempate cuando una votación SI/NO o de candidatos queda empatada, para resolver conforme al Art. 49.
  Pantalla: `/meetings/[id]/live` (panel "Desempate RDR") · Endpoint: `POST /meetings/:meetingId/vote/rdr-tiebreaker`, `.../rdr-candidate-tiebreaker`
- **HU-VOTE-06** — Como secretario/RDR, quiero abrir una segunda vuelta (runoff) entre los dos candidatos más votados cuando nadie alcanza la mayoría requerida, para completar una elección (Art. 64i).
  Pantalla: `/admin/meetings/[id]/live` · Endpoint: `POST /meetings/:meetingId/vote/runoff`
- **HU-VOTE-07** — Como secretario/presidente/RDR, quiero ver el detalle nominal de una votación pública ya cerrada, para verificar el resultado y auditar.
  Pantalla: `/admin/meetings/[id]` · Endpoint: `GET /meetings/:meetingId/vote/:voteSessionId/detailed`

### 2.4 Mociones

- **HU-MOT-01** — Como secretario/RDR, quiero registrar una moción propuesta por un club, para dejar constancia formal de una propuesta.
  Pantalla: `/admin/meetings/[id]/live` (diálogo "Proponer moción") · Endpoint: `POST /meetings/:meetingId/motions`
- **HU-MOT-02** — Como participante representando a un club distinto del proponente, quiero secundar una moción propuesta, para habilitarla a votación.
  Pantalla: `/meetings/[id]/live` (sección "Mociones de la Sala") · Endpoint: `POST /meetings/:meetingId/motions/:motionId/second`
- **HU-MOT-03** — Como secretario/RDR, quiero lanzar la votación de una moción ya secundada, para que el Consejo la resuelva.
  Pantalla: `/admin/meetings/[id]/live` · Endpoint: `POST /meetings/:meetingId/motions/:motionId/launch-vote`

### 2.5 Cola de oradores y palabra

- **HU-SPKQ-01** — Como participante, quiero solicitar la palabra durante una reunión en vivo o pausada, para intervenir en el orden que corresponda.
  Pantalla: `/meetings/[id]/live` · Endpoint: `POST /meetings/:meetingId/queue/request`
- **HU-SPKQ-02** — Como participante o moderador, quiero cancelar una solicitud de palabra pendiente, para liberar mi lugar en la cola.
  Pantalla: `/meetings/[id]/live` · Endpoint: `POST /meetings/:meetingId/queue/cancel`
- **HU-SPKQ-03** — Como secretario/RDR, quiero asignar el orador actual y el próximo orador de la cola, para moderar el debate.
  Pantalla: `/admin/meetings/[id]/live` · Endpoint: `POST /meetings/:meetingId/queue/current-speaker`, `.../next-speaker`
- **HU-SPKQ-04** — Como orador activo, quiero soltar la palabra por mí mismo cuando termino de hablar, para no depender de que la mesa lo haga.
  Pantalla: `/meetings/[id]/live` (botón flotante "Soltar la palabra") · Endpoint: `POST /meetings/:meetingId/queue/release-floor`
- **HU-SPKQ-05** — Como secretario/RDR, quiero tomar la palabra directamente (interrumpiendo al orador actual si lo hay), para hacer anuncios de mesa o hablar en nombre de un invitado sin cuenta.
  Pantalla: `/meetings/[id]/live` y `/admin/.../live` · Endpoint: `POST /meetings/:meetingId/queue/current-speaker`

### 2.6 Cronómetros

- **HU-TIMER-01** — Como secretario/presidente/RDR, quiero iniciar un cronómetro con duración planificada para el tema en curso, para controlar los tiempos del orden del día.
  Pantalla: `/admin/meetings/[id]/live` · Endpoint: `POST /meetings/:meetingId/timers/topic/start`
- **HU-TIMER-02** — Como secretario/presidente/RDR, quiero detener el cronómetro activo, para cerrar el tiempo del tema o intervención.
  Pantalla: `/admin/meetings/[id]/live` · Endpoint: `POST /meetings/:meetingId/timers/stop`
- **HU-TIMER-03** — Como cualquier participante, quiero ver el tiempo restante/excedido del tema activo en tiempo real, para saber cuánto tiempo queda.
  Pantalla: `/meetings/[id]/live`, `/admin/meetings/[id]/live` · Endpoint: `GET /meetings/:meetingId/timers/active`, `ws:meeting.snapshot`

### 2.7 Temas de agenda y transcripción

- **HU-TOPIC-01** — Como secretario/presidente/RDR, quiero crear, editar, eliminar y reordenar los temas del orden del día, para estructurar la reunión.
  Pantalla: `/admin/meetings/[id]` · Endpoint: `POST/PATCH/DELETE /meetings/:meetingId/topics[/:topicId]`, `POST .../reorder`
- **HU-TOPIC-02** — Como secretario, quiero importar el orden del día masivamente desde CSV o Excel, para cargar agendas extensas rápidamente.
  Pantalla: `/admin/meetings/[id]` · Endpoint: `GET /meetings/:meetingId/topics/bulk/template`, `POST .../bulk`
- **HU-TOPIC-03** — Como secretario/presidente/RDR, quiero fijar cuál es el tema actualmente en discusión, para sincronizar la vista de todos los participantes.
  Pantalla: `/admin/meetings/[id]/live` · Endpoint: `POST /meetings/:meetingId/topics/current`
- **HU-TOPIC-04** — Como orador activo, quiero que mi intervención se transcriba automáticamente (texto o audio con Whisper) al acta del tema en curso, para dejar registro fiel del debate.
  Pantalla: `/meetings/[id]/live`, `/admin/.../live` · Endpoint: `POST /meetings/:meetingId/topics/:topicId/transcriptions[/audio]`

### 2.8 Carta poder (delegación de voto — Art. 46)

- **HU-CPODER-01** — Como presidente de club (o secretaría/RDR en su nombre), quiero registrar una carta poder designando a un delegado que representará a mi club en una reunión, para delegar mi voto.
  Endpoint: `POST /meetings/:meetingId/carta-poder`
- **HU-CPODER-02** — Como secretario, quiero verificar una carta poder recibida, para habilitar al delegado a votar en representación del club.
  Endpoint: `PATCH /meetings/:meetingId/carta-poder/:cpId/verify`
- **HU-CPODER-03** — Como secretario, quiero rechazar una carta poder inválida con motivo, para informar al club el problema.
  Endpoint: `PATCH /meetings/:meetingId/carta-poder/:cpId/reject`
- **HU-CPODER-04** — Como secretario/RDR, quiero eliminar una carta poder cargada por error, para corregir la delegación.
  Endpoint: `DELETE /meetings/:meetingId/carta-poder/:cpId`
- **HU-CPODER-05** — Como presidente/RDR/secretario, quiero consultar las cartas poder de mi club (o de todos, según rol) en una reunión, para verificar el estado de la delegación.
  Endpoint: `GET /meetings/:meetingId/carta-poder`, `.../my-club/:clubId`

### 2.9 Tiempo real (WebSocket)

- **HU-RT-01** — Como cualquier usuario con acceso a la reunión, quiero conectarme a la sala en vivo por WebSocket y recibir un snapshot consolidado del estado, para ver todo actualizado sin refrescar.
  Pantalla: `/meetings/[id]/live`, `/admin/meetings/[id]/live` · Evento: `ws:join_meeting` → `ws:meeting.snapshot`
- **HU-RT-02** — Como presidente/delegado, al conectarme quiero que mi asistencia y la de mi club se registren automáticamente si no fue fijada manualmente, para no tener que "marcar presente" a mano.
  Evento: `ws:join_meeting` (automático)
- **HU-RT-03** — Como cualquier participante, quiero votar directamente por WebSocket (alternativa a REST), para reducir latencia percibida.
  Evento: `ws:vote.submit` → `ws:vote.confirmed`
- **HU-RT-04** — Como secretario/RDR, quiero alternar la transcripción en vivo por WebSocket, para control instantáneo sin recargar la página.
  Evento: `ws:meeting.toggleTranscription`

### 2.10 Sucesión de presidencia de club

- **HU-PRES-01** — Como presidente de club, quiero designar a mi sucesor para el próximo período distrital, para asegurar la continuidad de representación.
  Endpoint: `POST /club/presidency/successor`
- **HU-PRES-02** — Como presidente de club, quiero revocar una designación de sucesor ya hecha, para corregir un error o cambiar de decisión.
  Endpoint: `POST /club/presidency/:id/revoke`
- **HU-PRES-03** — Como miembro de club, quiero consultar el presidente activo actual, el electo para el próximo período y el historial de presidencias, para conocer la representación vigente.
  Endpoint: `GET /club/presidency/current`, `/elect`, `/history`, `/periods`
- **HU-PRES-04** — Como sistema, quiero transicionar automáticamente la presidencia ACTIVE al llegar la fecha de inicio del período electo, para que el nuevo presidente pueda representar y votar sin intervención manual.
  Interno: scheduler `runPresidencyTransition()`

---

## 3. Mi Club y Distrito

### 3.1 Mi Club (perfil propio)

- **HU-CLUB-01** — Como socio de un club, quiero ver el perfil y resumen de mi club, para conocer su estado general y actividad reciente.
  Pantalla: `apps/web/src/app/(club)/club/page.tsx` · Endpoint: `GET /club/me`, `GET /club/me/summary`
- **HU-CLUB-02** — Como presidente de club, quiero editar los datos de contacto y descripción de mi club, para mantener la información actualizada ante el distrito.
  Pantalla: ídem · Endpoint: `PATCH /club/me`
- **HU-CLUB-03** — Como socio de club, quiero consultar la lista de períodos rotarios vigentes, para asociar informes y actividades al período correcto.
  Pantalla: N/A (uso interno en formularios) · Endpoint: `GET /club/periods`

### 3.2 Administración de clubes (ABM distrital)

- **HU-CLUBES-01** — Como secretario/a distrital, quiero crear, editar, dar de baja y listar clubes, para mantener el padrón oficial del distrito.
  Pantalla: `/admin/clubs` · Endpoint: `GET/POST/PATCH/DELETE /clubs[/:id]`
- **HU-CLUBES-02** — Como secretario/a distrital, quiero importar clubes en forma masiva desde CSV, para dar de alta el padrón inicial sin carga manual.
  Pantalla: `/admin/clubs` · Endpoint: `GET /clubs/bulk/template`, `POST /clubs/bulk`

### 3.3 Socios de club

- **HU-SOCIO-01** — Como autoridad de club, quiero dar de alta, editar y consultar socios, para mantener actualizado el padrón interno del club.
  Pantalla: `/club/socios`, `/club/socios/[id]` · Endpoint: `GET/POST/PATCH /club/members[/:id]`
- **HU-SOCIO-02** — Como autoridad de club, quiero cambiar el estado de un socio y darlo de baja, para reflejar su situación real dentro del club.
  Pantalla: `/club/socios/[id]` · Endpoint: `PATCH /club/members/:id/status`, `DELETE /club/members/:id`
- **HU-SOCIO-03** — Como presidente de club, quiero asignar a un socio como presidente, para reflejar el recambio de autoridades.
  Pantalla: `/club/socios/[id]` · Endpoint: `POST /club/members/:id/president`
- **HU-SOCIO-04** — Como autoridad de club, quiero importar socios en forma masiva vía CSV y ver perfiles incompletos, para agilizar la carga y detectar datos faltantes.
  Pantalla: `/club/socios` · Endpoint: `GET /club/members/bulk/template`, `POST /club/members/bulk`, `GET .../incomplete-profiles`
- **HU-SOCIO-05** — Como autoridad de club, quiero ver el historial de auditoría de un socio y subirle una foto de perfil, para trazabilidad y personalización.
  Pantalla: `/club/socios/[id]` · Endpoint: `GET /club/members/:id/history`, `POST /club/members/:id/avatar`

### 3.4 Junta directiva de club

- **HU-BOARD-01** — Como socio de club, quiero consultar la junta directiva vigente (o de un período pasado), para saber quién ocupa cada cargo.
  Pantalla: N/A (sin pantalla dedicada) · Endpoint: `GET /club/board?periodId=`
- **HU-BOARD-02** — Como presidente de club, quiero definir/actualizar los cargos de la junta directiva para un período, para formalizar la mesa directiva ante el distrito.
  Pantalla: N/A (sin pantalla dedicada) · Endpoint: `POST /club/board`

### 3.5 Proyectos de club

- **HU-PROY-01** — Como autoridad de club, quiero crear, editar y listar proyectos del club, para gestionar las iniciativas de servicio.
  Pantalla: `/club/proyectos`, `/club/proyectos/nuevo`, `/club/proyectos/[id]` · Endpoint: `GET/POST/PATCH /club/projects[/:id]`
- **HU-PROY-02** — Como autoridad de club, quiero avanzar el estado del proyecto (idea → planificación → ejecución → finalizado/cancelado) y registrar avances con fecha, para llevar seguimiento del progreso.
  Pantalla: `/club/proyectos/[id]` · Endpoint: `PATCH /club/projects/:id/status`, `POST /club/projects/:id/progress`
- **HU-PROY-03** — Como autoridad de club, quiero adjuntar y eliminar archivos a un proyecto, para documentar evidencia de su ejecución.
  Pantalla: `/club/proyectos/[id]` · Endpoint: `GET/POST /club/projects/:id/attachments`, `DELETE .../:attachmentId`
- **HU-PROY-04** — Como autoridad de club, quiero importar proyectos en forma masiva vía CSV, para cargar el histórico rápidamente.
  Pantalla: `/club/proyectos` · Endpoint: `GET /club/projects/bulk/template`, `POST .../bulk`

### 3.6 Informes de club

- **HU-INF-01** — Como autoridad de club, quiero crear un informe (mensual, trimestral o anual) en borrador y completarlo, para reportar la actividad del club al distrito.
  Pantalla: `/club/informes`, `/club/informes/nuevo`, `/club/informes/[id]/editar` · Endpoint: `GET/POST/PATCH /club/reports[/:id]`
- **HU-INF-02** — Como presidente de club, quiero enviar el informe al distrito para su revisión, para cumplir con la obligación de reporte periódico.
  Pantalla: `/club/informes/[id]` · Endpoint: `POST /club/reports/:id/submit`
- **HU-INF-03** — Como presidente de club, quiero responder observaciones y reenviar un informe observado o rechazado, para subsanarlo sin crear uno nuevo.
  Pantalla: `/club/informes/[id]/editar` · Endpoint: `PATCH /club/reports/:id`, `POST /club/reports/:id/resubmit`
- **HU-INF-04** — Como autoridad de club, quiero adjuntar y eliminar archivos de respaldo a un informe, para sustentar la información reportada.
  Pantalla: `/club/informes/[id]` · Endpoint: `GET/POST /club/reports/:id/attachments`, `DELETE .../:attachmentId`

### 3.7 Distrito — Monitoreo de clubes

- **HU-DISTCLUB-01** — Como secretario/a o RDR distrital, quiero listar y filtrar clubes por estado, cuota/informe al día y habilitación para reuniones, para monitorear el cumplimiento del distrito.
  Pantalla: `/admin/district/clubes` · Endpoint: `GET /district/clubs`
- **HU-DISTCLUB-02** — Como secretario/a o RDR distrital, quiero ver el detalle de un club, incluyendo sus autoridades vigentes e informes recientes, para tener una vista 360°.
  Pantalla: `/admin/district/clubes/[id]` · Endpoint: `GET /district/clubs/:id`, `.../reports`
- **HU-DISTCLUB-03** — Como secretario/a o RDR distrital, quiero editar los flags administrativos de un club (cuota al día, informe al día, habilitación) desde la vista distrital, para reflejar decisiones administrativas.
  Pantalla: `/admin/district/clubes/[id]` · Endpoint: `PATCH /district/clubs/:id`

### 3.8 Períodos distritales

- **HU-PER-01** — Como secretario/a o RDR distrital, quiero crear y administrar los períodos rotarios del distrito, para que clubes e informes se organicen cronológicamente.
  Pantalla: N/A (sin pantalla de administración dedicada) · Endpoint: `GET/POST/PATCH/DELETE /district/periods[/:id]`, `GET .../current`

### 3.9 Comités distritales

- **HU-COM-01** — Como secretario/a o RDR distrital, quiero crear y administrar comités distritales asignándoles un coordinador, para organizar el trabajo del distrito por áreas.
  Pantalla: `/admin/district/comites`, `.../nuevo`, `.../[id]` · Endpoint: `GET/POST/PATCH/DELETE /district/committees[/:id]`
- **HU-COM-02** — Como secretario/a o RDR distrital, quiero agregar y quitar integrantes de un comité (individualmente o vía CSV), para gestionar su composición.
  Pantalla: `/admin/district/comites/[id]` · Endpoint: `POST/DELETE /district/committees/:id/members[/:userId]`, bulk
- **HU-COM-03** — Como secretario/a o RDR distrital, quiero definir objetivos y registrar actividades (con archivos adjuntos) de un comité, para documentar su plan de trabajo y ejecución.
  Pantalla: `/admin/district/comites/[id]` · Endpoint: `POST/PATCH/DELETE /district/committees/:id/objectives[/:id]`, `.../activities[/:id]`, `.../attachments`

### 3.10 Informes distritales (consolidado)

- **HU-INFDIST-01** — Como secretario/a o RDR distrital, quiero ver todos los informes de todos los clubes con filtros por período/club/estado/tipo, para supervisar el cumplimiento general.
  Pantalla: `/admin/district/informes` · Endpoint: `GET /district/reports`
- **HU-INFDIST-02** — Como secretario/a o RDR distrital, quiero revisar un informe puntual y marcarlo como observado, aprobado o rechazado con comentarios, para cerrar el ciclo de control de calidad.
  Pantalla: `/admin/district/informes/[id]` · Endpoint: `GET /district/reports/:id`, `PATCH .../:id`
- **HU-INFDIST-03** — Como secretario/a o RDR distrital, quiero ver qué clubes no presentaron un informe de un período/tipo dado y un resumen de cumplimiento, para priorizar el seguimiento.
  Pantalla: `/admin/district/informes` · Endpoint: `GET /district/reports/missing`, `.../summary`

### 3.11 Solicitudes de ingreso a club

- **HU-SOL-01** — Como usuario sin club, quiero solicitar el ingreso a un club, para iniciar mi proceso de afiliación.
  Pantalla: N/A (sin pantalla dedicada) · Endpoint: `POST /me/membership-applications`
- **HU-SOL-02** — Como usuario, quiero consultar el estado de mi solicitud y poder cancelarla mientras esté pendiente, para gestionar mi proceso de ingreso.
  Pantalla: N/A · Endpoint: `GET /me/membership-applications/current`, `POST .../:id/cancel`
- **HU-SOL-03** — Como autoridad de club, quiero listar, aprobar o rechazar solicitudes de ingreso recibidas, para controlar el alta de nuevos socios.
  Pantalla: N/A · Endpoint: `GET /club/membership-applications`, `PATCH .../:id/approve`, `.../reject`

### 3.12 Transferencias de socios entre clubes

- **HU-TRANS-01** — Como socio de un club, quiero solicitar mi transferencia a otro club, para continuar mi trayectoria en Rotaract en un nuevo club.
  Pantalla: N/A (sin pantalla dedicada) · Endpoint: `POST /club/transfer-requests`
- **HU-TRANS-02** — Como autoridad de club, quiero ver las transferencias donde mi club es origen o destino, para hacer seguimiento del proceso.
  Pantalla: N/A · Endpoint: `GET /club/transfer-requests`
- **HU-TRANS-03** — Como autoridad del club destino, quiero aceptar una solicitud de transferencia recibida, para dar curso al ingreso del socio.
  Pantalla: N/A · Endpoint: `PATCH /club/transfer-requests/:id/accept`
- **HU-TRANS-04** — Como autoridad del club de origen, quiero confirmar una transferencia ya aceptada por el destino, para completar el traspaso efectivo del socio.
  Pantalla: N/A · Endpoint: `PATCH /club/transfer-requests/:id/confirm`
- **HU-TRANS-05** — Como autoridad de cualquiera de los dos clubes involucrados, quiero rechazar una transferencia en curso, para detener un traspaso no deseado o incorrecto.
  Pantalla: N/A · Endpoint: `PATCH /club/transfer-requests/:id/reject`

---

## 4. Eventos y Desarrollo Profesional

### 4.1 Eventos

- **HU-EVT-01** — Como secretario/a distrital, quiero crear un evento distrital o de club en borrador, para prepararlo antes de publicarlo.
  Pantalla: `/admin/eventos/nuevo` · Endpoint: `POST /events`
- **HU-EVT-02** — Como presidente/RDR de un club, quiero crear eventos asociados obligatoriamente a mi propio club, para organizar actividades locales.
  Pantalla: `/admin/eventos/nuevo` · Endpoint: `POST /events`
- **HU-EVT-03** — Como secretario/a, presidente o RDR, quiero editar, publicar, cancelar o marcar como finalizado un evento, para gestionar su ciclo de vida.
  Pantalla: `/admin/eventos/[id]/editar`, `/admin/eventos` · Endpoint: `PATCH /events/:id`, `.../publish`, `.../cancel`, `.../finish`, `DELETE /events/:id`
- **HU-EVT-04** — Como cualquier usuario autenticado, quiero ver el listado de eventos próximos/pasados y el detalle de un evento publicado, para decidir si participar.
  Pantalla: `/eventos`, `/eventos/pasados`, `/eventos/[id]` · Endpoint: `GET /events`, `.../upcoming`, `.../past`, `.../:id`
- **HU-EVT-05** — Como secretario/a, presidente o RDR, quiero importar eventos masivamente desde un CSV, para cargar agendas completas de una vez.
  Pantalla: `/admin/eventos` · Endpoint: `GET /events/bulk/template`, `POST /events/bulk`
- **HU-EVT-06** — Como secretario/a, presidente o RDR, quiero adjuntar y eliminar archivos a un evento, para compartir material de referencia.
  Pantalla: N/A (solo backend) · Endpoint: `GET/POST /events/:id/attachments`, `DELETE .../:attachmentId`

### 4.2 Inscripciones a eventos

- **HU-INSC-01** — Como participante (o visitante con email), quiero inscribirme a un evento publicado completando mis datos y el formulario dinámico, para asegurar mi lugar.
  Pantalla: N/A (sin UI de inscripción encontrada) · Endpoint: `POST /events/:id/registrations`
- **HU-INSC-02** — Como usuario autenticado con perfil completo, quiero confirmar asistencia con un clic (RSVP), para inscribirme sin volver a tipear datos.
  Pantalla: N/A · Endpoint: `POST /events/:id/registrations/rsvp`
- **HU-INSC-03** — Como secretario/a, presidente o RDR, quiero listar, filtrar y exportar (CSV/XLSX) las inscripciones de un evento, para gestionarlas y hacer seguimiento.
  Pantalla: N/A · Endpoint: `GET /events/:id/registrations`, `.../export`
- **HU-INSC-04** — Como usuario, quiero consultar mi propia inscripción a un evento y ver el historial de mis inscripciones, para saber mi estado.
  Pantalla: N/A · Endpoint: `GET /events/:id/registrations/me`, `GET /me/registrations`
- **HU-INSC-05** — Como titular, secretario/a o presidente/RDR del club organizador, quiero cancelar una inscripción, para liberar el cupo o corregir errores.
  Pantalla: N/A · Endpoint: `DELETE /events/:id/registrations/:regId`
- **HU-INSC-06** — Como secretario/a, presidente o RDR, quiero importar inscriptos masivamente desde CSV, para cargar listas pre-existentes.
  Pantalla: N/A · Endpoint: `POST /events/:id/registrations/bulk`

### 4.3 Formularios de inscripción

- **HU-FORM-01** — Como secretario/a, presidente o RDR, quiero definir un formulario dinámico de inscripción (secciones y campos condicionales) para un evento, para recolectar datos específicos.
  Pantalla: N/A · Endpoint: `PUT /events/:id/registration-form`
- **HU-FORM-02** — Como organizador, quiero consultar el formulario configurado de un evento, para revisarlo o editarlo.
  Pantalla: N/A · Endpoint: `GET /events/:id/registration-form`
- **HU-FORM-03** — Como visitante o participante, quiero obtener el formulario público de un evento publicado antes de inscribirme, para completarlo.
  Pantalla: N/A · Endpoint: `GET /events/:id/registration-form/public`

### 4.4 Pagos de eventos

- **HU-PAGO-01** — Como secretario/a, presidente o RDR, quiero definir el monto del ticket de un evento pago, para habilitar el cobro.
  Pantalla: N/A · Endpoint: `GET/PUT /events/:id/ticket`
- **HU-PAGO-02** — Como organizador, quiero definir un esquema de cuotas que sumen exactamente el monto del ticket, para permitir pagos en partes.
  Pantalla: N/A · Endpoint: `GET/PUT /events/:id/installments`
- **HU-PAGO-03** — Como secretario/a, presidente o RDR, quiero registrar manualmente un pago de una cuota de un inscripto, para reflejar el cobro real.
  Pantalla: N/A · Endpoint: `POST /events/:id/registrations/:regId/payments/:installmentId/record`
- **HU-PAGO-04** — Como secretario/a, quiero eximir (waive) el pago de una cuota a un inscripto, para casos de becas o excepciones.
  Pantalla: N/A · Endpoint: `POST /events/:id/registrations/:regId/payments/:installmentId/waive`
- **HU-PAGO-05** — Como secretario/a, presidente o RDR, quiero ver el resumen financiero del evento y el detalle de pagos por inscripto, para hacer seguimiento.
  Pantalla: N/A · Endpoint: `GET /events/:id/payments`, `.../summary`

### 4.5 Comidas del evento

- **HU-COMIDA-01** — Como secretario/a, presidente o RDR, quiero definir las comidas de un evento con su ventana horaria de servicio, para organizar la logística de catering.
  Pantalla: N/A · Endpoint: `POST/PUT/DELETE /events/:id/meals[/:mealId]`
- **HU-COMIDA-02** — Como usuario autenticado con permiso de escaneo, quiero escanear el QR de acreditación de un inscripto para registrar el consumo de una comida, para controlar el catering en tiempo real.
  Pantalla: N/A (pensado para dispositivo/app de escaneo dedicado) · Endpoint: `POST /events/:id/meals/:mealId/scan`
- **HU-COMIDA-03** — Como secretario/a, presidente o RDR, quiero ver estadísticas de consumo por comida y del evento completo, para dimensionar el catering.
  Pantalla: N/A · Endpoint: `GET /events/:id/meals/:mealId/stats`, `.../all/stats`

### 4.6 Check-in / acreditación

- **HU-CHKIN-01** — Como organizador, quiero generar y descargar el código QR de acreditación de un inscripto, para imprimirlo o compartirlo.
  Pantalla: N/A · Endpoint: `GET /events/:id/registrations/:regId/qr`
- **HU-CHKIN-02** — Como asistente, quiero que al escanear mi QR se muestre mi información de inscripción y del evento sin necesidad de iniciar sesión, para verificar mis datos.
  Pantalla: N/A (endpoint público sin página Next.js asociada) · Endpoint: `GET /r/:token`
- **HU-CHKIN-03** — Como secretario/a, presidente o RDR, quiero escanear el QR de un asistente para acreditarlo en el evento, para controlar el ingreso en tiempo real.
  Pantalla: N/A · Endpoint: `POST /events/:id/check-in`
- **HU-CHKIN-04** — Como organizador, quiero deshacer una acreditación errónea, para corregir el registro.
  Pantalla: N/A · Endpoint: `POST /events/:id/registrations/:regId/undo-check-in`
- **HU-CHKIN-05** — Como organizador, quiero ver estadísticas en vivo de acreditación, para monitorear el evento.
  Pantalla: N/A · Endpoint: `GET /events/:id/check-in/stats`

### 4.7 Emails automáticos del evento

- **HU-MAIL-01** — Como secretario/a, presidente o RDR, quiero ver y editar las plantillas de email de un evento, para personalizar las comunicaciones.
  Pantalla: N/A · Endpoint: `GET /events/:id/email-templates`, `PUT .../:type`
- **HU-MAIL-02** — Como secretario/a, presidente o RDR, quiero ver el historial de emails enviados de un evento, para auditar entregas y fallos.
  Pantalla: N/A · Endpoint: `GET /events/:id/email-logs`

### 4.8 Permisos distritales de eventos

- **HU-PERM-01** — Como secretario/a distrital, quiero otorgar a un club el permiso de organizar eventos distritales o de gestionar finanzas de eventos, para descentralizar la organización.
  Pantalla: N/A · Endpoint: `POST /events/permissions`
- **HU-PERM-02** — Como secretario/a o RDR, quiero listar los permisos otorgados, para auditar quién tiene qué permiso.
  Pantalla: N/A · Endpoint: `GET /events/permissions`
- **HU-PERM-03** — Como secretario/a distrital, quiero revocar un permiso activo, para retirar una delegación.
  Pantalla: N/A · Endpoint: `PATCH /events/permissions/:id/revoke`

### 4.9 Página pública de evento

- **HU-PUB-01** — Como visitante sin autenticación, quiero ver la información pública de un evento por su slug (incluyendo cupos disponibles), para decidir inscribirme.
  Pantalla: N/A (no hay página Next.js que la consuma; ver notas) · Endpoint: `GET /e/:slug`

### 4.10 Oportunidades (empleo/pasantías/becas)

- **HU-OPORT-01** — Como equipo distrital o coordinador de comité activo, quiero crear una oportunidad (empleo, pasantía, beca, voluntariado, capacitación, liderazgo o convocatoria), para difundirla.
  Pantalla: `/desarrollo-profesional/oportunidades/nueva` · Endpoint: `POST /opportunities`
- **HU-OPORT-02** — Como cualquier usuario autenticado, quiero ver el listado y detalle de oportunidades filtrando por tipo, modalidad, área u organización, para buscar oportunidades relevantes.
  Pantalla: `/desarrollo-profesional/oportunidades`, `.../[id]` · Endpoint: `GET /opportunities`, `.../:id`
- **HU-OPORT-03** — Como creador de la oportunidad o equipo distrital, quiero editarla, publicarla o archivarla, para gestionar su ciclo de vida.
  Pantalla: N/A (sin pantalla de edición encontrada) · Endpoint: `PATCH /opportunities/:id`, `.../publish`, `.../archive`
- **HU-OPORT-04** — Como equipo distrital o coordinador de comité, quiero importar oportunidades masivamente desde CSV, para publicar convocatorias en lote.
  Pantalla: `/desarrollo-profesional/oportunidades` · Endpoint: `GET /opportunities/bulk/template`, `POST .../bulk`

### 4.11 Directorio de talento

- **HU-TAL-01** — Como visitante sin autenticación, quiero buscar en el directorio de talento (por nombre, club o profesión), para descubrir perfiles visibles públicamente.
  Pantalla: `/talento` · Endpoint: `GET /talent`
- **HU-TAL-02** — Como usuario autenticado, quiero buscar en el directorio de talento viendo más datos según mi rol, para encontrar contactos.
  Pantalla: `/desarrollo-profesional/talento` · Endpoint: `GET /talent/search`
- **HU-TAL-03** — Como visitante o usuario autenticado, quiero ver la ficha de un perfil de talento, para conocer más detalles.
  Pantalla: `/talento/perfil/[userId]`, `/desarrollo-profesional/talento/[userId]` · Endpoint: `GET /talent/:userId`
- **HU-TAL-04** — Como empresa registrada, quiero ver perfiles completos de talento (incluyendo email si el usuario lo hizo público), para evaluar candidatos.
  Pantalla: `/desarrollo-profesional/talento/[userId]` · Endpoint: `GET /talent/:userId`
- **HU-TAL-05** — Como empresa, quiero registrarme en la plataforma para poder acceder al directorio de talento con más visibilidad.
  Pantalla: `/talento/empresas/registro` · Endpoint: `POST /companies/register`
- **HU-TAL-06** — Como empresa, quiero ver y editar los datos de mi empresa, para mantenerlos actualizados.
  Pantalla: N/A (sin pantalla dedicada) · Endpoint: `GET/PATCH /companies/me`

> **Nota:** el modelo `TalentContactRequest` (solicitud de contacto de una empresa hacia un talento) existe en la base de datos pero **no tiene ningún endpoint que lo gestione** — no hay historia de usuario real que cubra "una empresa solicita el contacto de un talento" en el estado actual del código.

---

## Anexo — Capacidades de backend sin interfaz frontend

Las siguientes historias de usuario están **completamente implementadas en la API** pero no tienen (o no se pudo localizar) una pantalla en `apps/web` que las consuma al momento de este relevamiento. Se listan para priorización de trabajo pendiente de UI:

- **Identidad y Plataforma:** notificaciones in-app completas (1.5), carga masiva de usuarios por CSV (HU-USR-02), todo el panel `platform-admin` (1.3), edición de perfil de empresa (HU-COMP-02/03).
- **Reuniones:** gestión de cartas poder (2.8, sin pantalla dedicada localizada más allá del wrapper de API).
- **Mi Club y Distrito:** junta directiva de club (3.4), solicitudes de ingreso a club (3.11), transferencias de socios (3.12), administración de períodos distritales (3.8).
- **Eventos:** inscripciones (4.2), formularios dinámicos (4.3), pagos (4.4), comidas (4.5), check-in/QR (4.6), emails automáticos (4.7), permisos distritales (4.8) y página pública por slug (4.9) — todo el "backend de logística de eventos" está listo pero sin panel de operación visible en el frontend actual.
- **Desarrollo profesional:** edición/publicación/archivado individual de oportunidades (HU-OPORT-03).

Ver el detalle de reglas de negocio de cada uno de estos módulos en [02-requerimientos-funcionales.md](./02-requerimientos-funcionales.md).
