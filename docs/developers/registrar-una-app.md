# Registrar una app

Guía para el **Representante Distrital (RDR)**, que es quien registra y
administra las apps del distrito y de los clubes. Si sos quien desarrolla la
app, leela igual: te dice qué datos vas a tener que darle al RDR y qué vas a
recibir.

La consola está en **`https://app.rotaract4845.com/developer/apps`** (ítem
**Apps** del grupo Distrito). Solo la ve quien tiene el permiso
`kernel.app.read`, y solo puede crear y modificar apps quien tiene
`kernel.app.manage`; los dos se otorgan al rol de RDR. La presidencia de un
club no puede registrar apps.

## Antes de empezar: qué pedirle al equipo de desarrollo

| Dato | Ejemplo |
|---|---|
| Nombre | Asistencia Asunción Centro |
| Descripción (la ven las personas al ingresar) | Toma asistencia en las reuniones semanales del club. |
| Organización | Club Rotaract Asunción Centro |
| Tipo | Servidor, o web/móvil |
| Qué hace | Consulta datos por su cuenta, permite ingresar con Mi Rotaract, o ambas |
| Datos que necesita y para qué | "Leer el padrón de socios: para listar a quién marcar presente." |
| Direcciones de regreso | `https://asistencia.asuncioncentro.org.py/auth/callback` |
| Persona responsable | Quién responde por la app y por los datos |

Desconfiá de los pedidos de "todos los datos por las dudas". Cada dato tiene
que tener un uso concreto.

## Paso a paso

### 1. Datos de la app

En **Apps → Registrar app** completá:

- **Nombre**: de 2 a 80 caracteres.
- **Descripción**: hasta 500 caracteres. Se muestra en la pantalla de
  consentimiento; escribila para socios, no para programadores.
- **Organización**: el club o el distrito al que pertenece la app. **Define
  qué puede ver**: una app de club ve solo ese club; una app del distrito ve
  el distrito y todos los clubes. La organización tiene que estar activa.
- **Tipo**:
  - **Servidor** (`CONFIDENTIAL`): corre en un servidor propio y puede
    guardar un secreto de forma segura.
  - **Web o móvil** (`PUBLIC`): corre en el navegador o en un teléfono; no
    puede guardar secretos, así que no recibe uno.

El tipo y la organización no se pueden cambiar después.

### 2. Qué puede hacer la app

- **Permitir que las personas ingresen con Mi Rotaract**: habilita el inicio
  de sesión (`authorization_code`) y que la sesión se mantenga abierta
  (`refresh_token`). Exige al menos una dirección de regreso. El dato
  "Saber que sos vos" (`openid`) se incluye siempre.
- **Acceso propio de la app a datos del distrito (servidor)**: habilita que
  la app consulte datos por su cuenta (`client_credentials`). Solo para apps
  de tipo Servidor.

Estas opciones tampoco se pueden cambiar después de crear la app.

### 3. Datos que la app puede leer

- **Datos de la persona que la app puede leer** (si ingresan con Mi
  Rotaract): nombre y foto, correo, clubes, cargos. Se los preguntamos a cada
  persona la primera vez que ingresa.
- **Datos del distrito que la app puede leer por su cuenta** (si tiene acceso
  propio): padrón, autoridades, períodos, etc. Estos **no** se le preguntan a
  nadie: los autorizás vos. La tabla completa está en
  [conceptos.md](conceptos.md#scopes).

Prestá especial atención a **"Leer email, teléfono y fecha de nacimiento de
personas"**: otorgalo solo si la app de verdad necesita contactar a la gente.

### 4. Direcciones de regreso (redirect URIs)

A dónde vuelve la persona después de ingresar con Mi Rotaract. Una por línea.
Reglas:

- Dirección completa (absoluta), sin `#`.
- Con `https://`. Se acepta `http://` **solo** para `localhost` o
  `127.0.0.1` (cualquier puerto), para que el equipo pruebe en su
  computadora.
- Se compara **exactamente**: `https://app.org.py/callback` y
  `https://app.org.py/callback/` son distintas. Registrá la que el código
  usa, carácter por carácter.

Ejemplos válidos:

```text
https://asistencia.asuncioncentro.org.py/auth/callback
http://localhost:3000/auth/callback
http://127.0.0.1:8765/callback
```

Ejemplos inválidos: `http://asistencia.asuncioncentro.org.py/callback` (http
fuera de localhost), `https://app.org.py/#/callback` (tiene `#`),
`/auth/callback` (no es absoluta).

### 5. Guardá el secreto (se ve una sola vez)

Al registrar una app de tipo Servidor, la consola muestra el **identificador
(`client_id`)** y el **secreto** (`mrs_…`). El secreto se muestra **una
única vez**: Mi Rotaract solo guarda una huella (hash) y los últimos 4
caracteres para que lo reconozcas.

- Copialo y entregáselo al equipo de desarrollo por un canal seguro (un
  gestor de contraseñas compartido, por ejemplo). Nunca por un grupo de
  WhatsApp ni por email en texto plano.
- Si se pierde, no se puede recuperar: se crea uno nuevo (ver rotación).

Una app Web o móvil no tiene secreto: solo el `client_id`, que no es secreto.

## Administrar una app

En el detalle de cada app ves el `client_id` (copiable), qué puede hacer, qué
datos puede leer, las direcciones de regreso y los secretos (con sus últimos
4 caracteres, cuándo se crearon, cuándo vencen y cuándo se usaron por última
vez).

### Editar

Podés cambiar nombre, descripción, datos que puede leer y direcciones de
regreso. Las mismas reglas que en el alta. Si agregás un dato de persona y la
app empieza a pedirlo, cada persona va a ver el consentimiento de nuevo la
próxima vez que ingrese.

### Rotar el secreto

**Crear secreto nuevo** genera otro secreto y lo muestra una sola vez. El
anterior **sigue funcionando 7 días**, para que el equipo actualice la app
sin cortar el servicio:

1. Creá el secreto nuevo y pasáselo al equipo.
2. El equipo despliega la app con el secreto nuevo.
3. Verificá en la consola que el secreto nuevo ya tiene "último uso".
4. Revocá el anterior (o dejá que venza a los 7 días).

Nunca hay más de dos secretos vigentes: si ya hay dos y creás un tercero, el
más viejo se revoca en el acto.

**Si un secreto se filtró**, no esperes los 7 días: creá uno nuevo y
**revocá el filtrado inmediatamente**. Ver [seguridad.md](seguridad.md#si-se-filtra-un-secreto).

### Revocar un secreto

**Revocar secreto** lo invalida al instante: la app ya no puede pedir tokens
con él (`invalid_client`). Los tokens de servicio que ya había obtenido
siguen siendo válidos hasta que vencen (como mucho 10 minutos).

### Pausar y reactivar

**Pausar app** corta el acceso al instante: la app deja de obtener tokens,
sus tokens de servicio dejan de funcionar en la siguiente llamada y nadie
puede ingresar con ella. No se borra nada. **Reactivar app** la devuelve a
la normalidad con las mismas credenciales.

Usalo ante un comportamiento raro mientras se investiga.

### Revocar la app

**Revocar app** es **permanente**: se revocan sus secretos, todas las
sesiones (refresh tokens) y todos los consentimientos de las personas. Una
app revocada no se puede editar ni reactivar; si vuelve a hacer falta, se
registra de nuevo (con otro `client_id`).

## Por API

La consola usa los endpoints del tag `DeveloperApps` de
`kernel-openapi.yaml` (`/developer/apps`, `/developer/apps/{appId}`,
`/developer/apps/{appId}/secrets`, `…/suspend`, `…/activate`, `…/revoke`).
Requieren una sesión de Mi Rotaract con el permiso correspondiente y el
encabezado `Idempotency-Key` en cada `POST` y `PATCH`. No
están pensados para las apps de los comités: la consola es el camino.
