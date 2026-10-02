# Conceptos

Lo que necesitás saber del modelo de Mi Rotaract antes de escribir código.
Los nombres de campos y estados son los del contrato (`kernel-openapi.yaml`).

## El modelo institucional

### Organizaciones

Una organización es un distrito, un club u otra entidad
(`type`: `DISTRICT`, `CLUB`, `OTHER`). Forman un árbol: el **Distrito 4845**
es la raíz y los clubes cuelgan de él (`parentId` apunta al padre).

```text
Distrito 4845 (DISTRICT)
├── Club Rotaract Asunción Centro (CLUB)
├── Club Rotaract Encarnación Sur (CLUB)
└── Club Rotaract Villarrica del Espíritu Santo (CLUB)
```

Estados (`OrganizationStatus`): `DRAFT`, `ACTIVE`, `INACTIVE`, `ARCHIVED`.

Cada organización tiene un `id` (opaco, no lo interpretes), un `code` y un
`slug` legibles, y datos como `city`, `countryCode` y `timezone`
(`America/Asuncion`).

### Personas

Una **persona** es la identidad institucional de alguien (nombre, apellido,
foto). Puede existir sin cuenta: hay socios cargados en el padrón que todavía
no activaron su acceso a Mi Rotaract. Una **cuenta** (`accountId`) es el
acceso a la plataforma (email y contraseña) y pertenece a una persona.

El identificador que te importa casi siempre es el de la persona
(`personId`): es estable y es el `sub` de los tokens de "Ingresar con Mi
Rotaract".

Los datos de contacto (email, teléfono, fecha de nacimiento) son
**sensibles** y solo los ve una app que tenga el scope
`kernel.service.persons.contact.read`.

### Membresías

Una membresía une a una persona con una organización. Estados
(`MembershipStatus`):

| Estado | Significado |
|---|---|
| `PENDING` | Alta iniciada, todavía no es socio/a pleno/a. |
| `ACTIVE` | Socio/a activo/a. |
| `ON_LEAVE` | Con licencia: sigue siendo socio/a, temporalmente sin actividad. |
| `INACTIVE` | Dado/a de baja. |
| `GRADUATED` | Egresó (por ejemplo, por edad). |
| `TRANSFERRED` | Se transfirió a otro club. |

Una persona tiene como máximo una membresía por organización, y puede ser
socia de más de un club. Las membresías no se borran: cada cambio queda en el
historial y se ve como un cambio de `status`.

### Períodos rotarios

Cada organización tiene **períodos**: el año rotario va del **1 de julio al
30 de junio** del año siguiente (por ejemplo, 2026-2027: 1/7/2026 a
30/6/2027). Estados (`PeriodStatus`): `DRAFT`, `SCHEDULED`, `ACTIVE`,
`CLOSED`, `CANCELLED`. Hay como mucho un período `ACTIVE` por organización.

### Cargos y autoridades

Un **cargo** (`positionCode`) es un puesto del catálogo: `CLUB_PRESIDENT`
(Presidencia), `CLUB_VICE_PRESIDENT`, `CLUB_SECRETARY`, `CLUB_TREASURER`,
`CLUB_PRESIDENT_ELECT`, `CLUB_PAST_PRESIDENT`, `DISTRICT_RDR`
(Representante Distrital), `DISTRICT_SECRETARY`, `DISTRICT_TREASURER`.

Un **nombramiento** (`appointmentId`) asigna un cargo a una membresía en un
período. Estados (`AppointmentStatus`): `NOMINATED`, `ELECTED`, `ACTIVE`,
`ENDED`, `REVOKED`. Las **autoridades vigentes** son los nombramientos
`ACTIVE`.

Usá `positionCode` en tu lógica (es estable) y `positionName` para mostrar.

### Permisos

Lo que una persona puede hacer en Mi Rotaract lo decide el kernel
(roles, cargos, alcance por organización). Si tu app necesita saber si
alguien puede hacer algo, **preguntale al kernel** con
`POST /service/authorization/check` en vez de deducirlo de los cargos. Ver
[api-de-datos.md](api-de-datos.md#consultar-un-permiso).

## Apps

Una **app** es tu sistema registrado en Mi Rotaract. Tiene un `client_id`
(`mra_` + 20 caracteres hexadecimales) y, si es de servidor, uno o dos
secretos vigentes (`mrs_…`).

### Tipos

| Tipo | En la consola | Dónde corre | Secreto | Puede usar |
|---|---|---|---|---|
| `CONFIDENTIAL` | Servidor | En un servidor tuyo, que guarda el secreto de forma segura. | Sí | `client_credentials`, `authorization_code`, `refresh_token`; scopes de servicio y OIDC. |
| `PUBLIC` | Web o móvil | En el navegador (SPA) o en un teléfono: cualquiera puede inspeccionar el código. | No | `authorization_code`, `refresh_token`; solo scopes OIDC. |

Una app `PUBLIC` no tiene secreto y nunca puede consultar `/service/*`. Si tu
SPA necesita datos del padrón, el camino es un backend tuyo (app
`CONFIDENTIAL`) que los consulte.

El tipo y los accesos (grants) se eligen al registrar la app y no se pueden
cambiar después; para cambiarlos se registra una app nueva.

### Estados

`ACTIVE` ⇄ `SUSPENDED` (pausada), y `ACTIVE` o `SUSPENDED` → `REVOKED`
(definitivo). Una app pausada o revocada no obtiene tokens nuevos, y sus
tokens de servicio vigentes dejan de servir **en la siguiente llamada**, sin
esperar a que venzan.

### Alcance por organización

Cada app queda atada a **una organización** (`organizationId`) y solo ve esa
organización y sus descendientes:

- Una app del **Club Rotaract Asunción Centro** ve solo ese club: sus datos,
  su padrón, sus autoridades. No ve otros clubes ni el distrito.
- Una app del **Distrito 4845** ve el distrito y todos sus clubes.

Si pedís algo fuera de ese alcance, el kernel responde `403` con "Fuera del
alcance de esta app". En los listados, lo ajeno directamente no aparece.

Lo mismo vale para "Ingresar con Mi Rotaract": si una socia de dos clubes
entra a la app de uno de ellos, la app solo se entera de su membresía y sus
cargos en ese club.

## Scopes

Un scope es un permiso puntual. Hay dos familias.

### Scopes OIDC (datos de la persona que inicia sesión)

Los habilita el distrito en la app y los **acepta cada persona** en la
pantalla de consentimiento. La etiqueta es lo que la persona lee.

| Scope | Etiqueta en el consentimiento | Qué te da |
|---|---|---|
| `openid` | Saber que sos vos (identificador de tu cuenta) | `sub` (el `personId`). Obligatorio en todo inicio de sesión. |
| `profile` | Tu nombre y foto | `name`, `given_name`, `family_name`, `picture` |
| `email` | Tu correo electrónico | `email`, `email_verified` |
| `memberships` | Los clubes a los que pertenecés | `memberships`: membresías `ACTIVE` y `ON_LEAVE` dentro del alcance de la app |
| `positions` | Tus cargos vigentes | `positions`: nombramientos `ACTIVE` dentro del alcance de la app |

### Scopes de servicio (datos que la app lee por su cuenta)

Los otorga **el distrito** a la app al registrarla. Solo para apps
`CONFIDENTIAL` con `client_credentials`.

| Scope | Etiqueta en la consola | Para qué sirve |
|---|---|---|
| `kernel.service.organizations.read` | Leer clubes y distrito | Listar y leer organizaciones. |
| `kernel.service.persons.read` | Leer datos de personas | Leer personas por id (nombre, foto). |
| `kernel.service.persons.contact.read` | Leer email, teléfono y fecha de nacimiento de personas | Agrega `email`, `phone` y `birthDate` a las personas que ya podés leer. Sin este scope esos campos no aparecen. |
| `kernel.service.memberships.read` | Leer el padrón de socios | Padrón de una organización, membresías de una persona, snapshot de membresías. |
| `kernel.service.authorities.read` | Leer autoridades vigentes | Autoridades de una organización y snapshot de autoridades. |
| `kernel.service.periods.read` | Leer períodos | Períodos de una organización y snapshot del período vigente. |
| `kernel.service.authorization.check` | Consultar permisos de una persona | Preguntar si una persona tiene un permiso en una organización. |
| `kernel.service.users.read` | Leer el contexto de una cuenta | `GET /service/users/{accountId}/context`. |
| `kernel.service.modules.read` | Leer instalaciones de módulos | Estado de instalación de un módulo en una organización. |
| `kernel.service.tokens.introspect` | Validar tokens de sesión | `POST /auth/introspect`, uso interno de servicios de la plataforma. |

`kernel.service.persons.contact.read` es el más delicado: el distrito solo lo
otorga cuando la app de verdad necesita contactar a las personas (por
ejemplo, para enviar el certificado de un evento), y tu app queda obligada a
tratar esos datos según [seguridad.md](seguridad.md).

## Consentimiento

Cuando alguien entra a tu app con Mi Rotaract por primera vez, ve una
pantalla con el nombre de tu app, su organización y la lista de datos que
pedís, y elige **Permitir** o **Cancelar**. No puede aceptar solo una parte.

- Si ya había aceptado esos mismos scopes (o más), la pantalla no se muestra
  de nuevo.
- Si tu app pide un scope nuevo, la pantalla vuelve a aparecer.
- La persona puede quitarle el acceso a tu app cuando quiera desde **Apps
  conectadas** (`https://app.rotaract4845.com/connected-apps`). Desde ese
  momento sus refresh tokens dejan de servir, `/oauth/userinfo` responde
  `401` y la próxima vez que entre verá el consentimiento otra vez.
- Si el distrito revoca la app, se revocan todos los consentimientos.

Los scopes de servicio no pasan por el consentimiento de cada persona: los
decide el distrito al registrar la app. Por eso se piden con criterio y se
justifican.
