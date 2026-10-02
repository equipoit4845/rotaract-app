# Preguntas frecuentes

### ¿Cómo consigo credenciales?

Pidiéndoselas al Representante Distrital (RDR), que registra las apps en la
consola. Ver qué datos llevarle en el [README](README.md#cómo-pedir-una-app-al-distrito).
No hay registro autoservicio ni registro dinámico de clientes.

### ¿Hay un entorno de pruebas (sandbox)?

Todavía no; está planificado. Mientras tanto se desarrolla contra producción
con una app de desarrollo: pedile al RDR una app atada a tu club, con los
scopes mínimos y una dirección de regreso `http://localhost:<puerto>/…`.
Tratá esos datos como reales, porque lo son.

### ¿Puedo usar `http://` en la dirección de regreso?

Solo para `localhost` o `127.0.0.1` (con cualquier puerto). En cualquier
otro host, `https://`.

### ¿Y un esquema propio para mi app móvil (`miapp://callback`)?

No. Las direcciones de regreso tienen que ser `https://` (Universal Links /
App Links) o `http://localhost` / `http://127.0.0.1`.

### Mi app de club no ve el distrito ni los otros clubes. ¿Es un error?

No. Una app ve su organización y sus descendientes. Una app del club ve solo
el club; para ver todos los clubes, la app tiene que ser del distrito (y
tener una justificación).

### Una persona ingresó, pero `memberships` no muestra todos sus clubes.

Correcto: solo aparecen las membresías (`ACTIVE` u `ON_LEAVE`) y cargos
dentro de la organización de tu app. Es minimización de datos.

### ¿Puedo usar el `access_token` de una persona para leer el padrón?

No. El access token de "Ingresar con Mi Rotaract" solo sirve para
`/oauth/userinfo`. Para leer datos institucionales, tu servidor usa su propio
token de servicio (`client_credentials`), limitado a la organización de la
app. Si tenés que saber si esa persona puede ver algo, preguntalo con
`POST /service/authorization/check`.

### ¿Cuánto duran los tokens?

| Token | Duración |
|---|---|
| Token de servicio | 10 minutos |
| Access token de usuario | 10 minutos |
| `id_token` | 10 minutos |
| Código de autorización | 60 segundos, un solo uso |
| Refresh token | 30 días; cada uso emite uno nuevo |

### Me da `invalid_grant` al refrescar y la persona tiene que volver a ingresar.

Causas posibles: la persona quitó el acceso a tu app en **Apps conectadas**,
su cuenta dejó de estar activa, el token venció, o **usaste dos veces el
mismo refresh token** (por ejemplo, dos pedidos en paralelo). En el último
caso el kernel revoca todas las sesiones de esa persona con tu app.
Serializá los refresh.

### ¿Por qué no veo el email ni el teléfono en el padrón?

Porque tu app no tiene `kernel.service.persons.contact.read`. Sin ese scope
esos campos se omiten. Si de verdad los necesitás, pedíselo al RDR
explicando para qué.

### ¿Cómo cierro la sesión de la persona?

Borrá tu sesión y revocá el refresh token con `POST /oauth/revoke`. Todavía
no hay cierre de sesión OIDC (`end_session`): la persona sigue con su sesión
abierta en Mi Rotaract.

### ¿Hay webhooks para enterarme de cambios en el padrón?

Todavía no; los eventos para apps están planificados. Por ahora, sincronizá
periódicamente con `updatedSince` y `If-None-Match` (ver
[api-de-datos.md](api-de-datos.md#sincronización-incremental-updatedsince)).

### ¿Puedo escribir datos (dar de alta socios, cargar cargos)?

No desde una app de comité: la API de datos es de solo lectura. Las altas y
cambios se hacen en Mi Rotaract, por las personas con ese permiso.

### ¿Puedo leer la base de datos directamente o pedir un volcado?

No. Toda integración pasa por la API. Así se aplican los permisos, el
alcance por organización y la auditoría.

### ¿Hay SDK para mi lenguaje?

Sí para JavaScript/TypeScript (`@mirotaract/sdk`, Node 20+, con
adaptadores para Express y Next.js) y Python (`mirotaract`, Python ≥ 3.10,
con dependencia para FastAPI). Están en el monorepo (`packages/sdk-js` y
`sdks/python`) pero **todavía no en npm ni PyPI**: instalalos desde el
repositorio como se explica en [README.md](README.md#sdks-oficiales).
Flutter, PHP, Kotlin, Swift, .NET y Go vienen después. Para otros lenguajes,
cualquier librería OAuth 2.0 / OpenID Connect estándar sirve
(por ejemplo `openid-client` o `jose` en Node, `Authlib` o `PyJWT` en
Python).

### La pantalla de consentimiento no aparece la segunda vez.

Es lo esperado: si la persona ya aceptó esos scopes, se saltea. Vuelve a
aparecer si pedís scopes nuevos o si la persona le quitó el acceso a tu app.

### ¿La persona puede aceptar algunos datos y otros no?

Hoy no: acepta o rechaza el pedido completo. Por eso conviene pedir lo
mínimo.

### Rotaron el secreto. ¿Se cae mi app?

No inmediatamente: el secreto anterior sigue funcionando 7 días (salvo que
lo revoquen antes). Desplegá el nuevo dentro de ese plazo.

### Pausaron mi app. ¿Qué pasa con las personas que ya ingresaron?

Mientras está pausada, no se emiten tokens, los tokens de servicio dejan de
funcionar y userinfo responde `401`. Al reactivarla, todo vuelve a funcionar
con las mismas credenciales. Si la **revocan**, en cambio, es definitivo: se
revocan secretos, consentimientos y sesiones.

### ¿Dónde está el contrato completo?

En `kernel-openapi.yaml` del repositorio, tags `OAuth`, `DeveloperApps` y
`Service`.
