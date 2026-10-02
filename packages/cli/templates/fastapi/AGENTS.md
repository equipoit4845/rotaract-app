# AGENTS.md — contexto para asistentes de IA (y personas)

Esta app es un cliente de **Mi Rotaract**, el sistema institucional del
Distrito Rotaract 4845. Leé esto antes de cambiar código.

## Qué es la fuente de verdad

- El **kernel** de Mi Rotaract es la única fuente de verdad de personas,
  clubes, membresías, períodos y cargos. Esta app **consulta** esos datos por
  la API; nunca los copia para "corregirlos" ni se conecta a la base del
  kernel.
- API = issuer OIDC: `MIROTARACT_ISSUER` (`https://api.rotaract4845.com/api/kernel/v1`
  en producción; `http://localhost:54321/api/kernel/v1` con `mirotaract dev`).
- Contrato: `kernel-openapi.yaml` del repo del kernel; tipos con
  `mirotaract gen types --lang python`. Guías: `docs/developers/*.md`.

## Cómo está armada

- FastAPI + SDK `mirotaract` (`AsyncMiRotaractAuth` para el login,
  `AsyncMiRotaract` para la API de datos). Todo asíncrono: no uses los
  clientes síncronos dentro de rutas `async`.
- Login: `/auth/login` → Mi Rotaract → `/auth/callback`. La sesión vive en el
  servidor (`app/sessions.py`); el navegador solo tiene un id aleatorio en
  una cookie `httpOnly`, `SameSite=Lax` (`Secure` con https). Se guardan solo
  los claims verificados del `id_token`, no los tokens.
- Datos: el **token de servicio** (`client_credentials`) ve toda la
  organización de la app; **la regla de quién ve qué la pone esta app**
  (`rosters_for`: solo socios activos/de licencia del club). Los access
  tokens de personas solo sirven para `/oauth/userinfo`.

## Checklist de seguridad (obligatoria)

Credenciales
- [ ] `MIROTARACT_CLIENT_SECRET` solo en variables de entorno del servidor.
      Nunca en el código, en el repo, en logs ni en respuestas.
- [ ] `.env.local` está en `.gitignore`.

Tokens y sesión
- [ ] **Nunca** mandes tokens al navegador para guardarlos en
      `localStorage`/`sessionStorage`. La sesión es del servidor.
- [ ] Los `id_token` y access tokens se **verifican con el JWKS**
      (`/.well-known/jwks.json`): firma ES256, `iss`, `aud`, `exp`, `nonce`.
      El SDK ya lo hace; no lo reemplaces por `jwt.decode(..., verify=False)`.
- [ ] Identificá a las personas por `sub` (personId), no por email.
- [ ] `state`, `nonce` y PKCE `S256` en cada ingreso; se guardan en el
      servidor y se borran después del callback.
- [ ] Id de sesión nuevo después del login (ya está: evita fijación).
- [ ] `returnTo` solo rutas relativas (`safe_return_to`); sin redirecciones
      abiertas.
- [ ] Logout por `POST`.
- [ ] `/api/members` acepta solo tokens emitidos a TU app móvil
      (`MIROTARACT_PUBLIC_CLIENT_ID`) y consulta userinfo (ve revocaciones).

Mínimo de permisos
- [ ] Pedí solo los scopes que usás (`LOGIN_SCOPE` en `app/config.py`).
- [ ] No pidas `kernel.service.persons.contact.read` salvo que la app tenga
      que contactar personas.
- [ ] La app debería estar atada a la organización más chica posible.

Webhooks
- [ ] **Verificá la firma** (`app/webhooks.py`) sobre el **cuerpo crudo**
      (`await request.body()`), con tolerancia de 5 minutos y
      `hmac.compare_digest`.
- [ ] Deduplicá por `event["id"]` (hay reintentos) en tu base.
- [ ] Respondé 2xx en menos de 10 s; lo pesado va a una cola.

Datos personales
- [ ] Guardá lo mínimo y por el tiempo mínimo.
- [ ] Respetá bajas: una membresía que deja de estar `ACTIVE` deja de ver el
      padrón.
- [ ] Escapá todo lo que viene de la API al generar HTML (`html.escape`).
- [ ] Los errores que ve la persona no incluyen detalles internos (solo el
      `traceId`).

## Desarrollo

- `mirotaract dev up --app-url http://localhost:8000` levanta un kernel
  local con datos **sintéticos** (Distrito 9999) y escribe `.env.local`.
  Cuentas de prueba: `mirotaract dev status` (contraseña `sandbox-9999`).
- `mirotaract webhooks listen --forward-to http://localhost:8000/api/webhooks`.
- `python -m pytest` tiene que pasar antes de un PR.
