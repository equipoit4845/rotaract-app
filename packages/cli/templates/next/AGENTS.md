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
  `mirotaract gen types`. Guías: `docs/developers/*.md` del repo del kernel.

## Cómo está armada

- Next.js 15 App Router + `@mirotaract/sdk` (`MiRotaract`, `MiRotaractAuth`,
  `createMiRotaractNext` de `@mirotaract/sdk/next`).
- Login: `/auth/login` → Mi Rotaract → `/auth/callback`. La sesión es una
  cookie `httpOnly` cifrada (JWE) que guarda solo los claims del `id_token`
  verificado, no los tokens.
- Datos: `miRotaractData()` usa el **token de servicio** (`client_credentials`).
  Ese token ve toda la organización de la app; **la regla de quién ve qué la
  pone esta app** (`src/lib/clubs.ts`: solo socios activos/de licencia del
  club). Los access tokens de personas solo sirven para `/oauth/userinfo`, no
  para la API de datos.
- Todo lo de `src/lib/*` es `server-only`. No lo importes desde un
  componente `"use client"`.

## Checklist de seguridad (obligatoria)

Credenciales
- [ ] `MIROTARACT_CLIENT_SECRET` y `SESSION_SECRET` solo en variables de
      entorno del servidor. Nunca en el código, en el repo, en
      `NEXT_PUBLIC_*`, en logs ni en mensajes de error.
- [ ] `.env.local` está en `.gitignore`.
- [ ] Ninguna variable `NEXT_PUBLIC_` contiene secretos ni tokens.

Tokens y sesión
- [ ] **Nunca** guardes tokens en `localStorage` ni `sessionStorage` (ni en
      estado de React que se serialice al cliente). La sesión es la cookie
      `httpOnly` del SDK.
- [ ] Los `id_token` y access tokens se **verifican con el JWKS**
      (`/.well-known/jwks.json`): firma ES256, `iss`, `aud`, `exp`, `nonce`.
      El SDK ya lo hace; no reemplaces eso por un `jwt.decode`.
- [ ] Identificá a las personas por `sub` (personId), no por email.
- [ ] `state`, `nonce` y PKCE `S256` en cada ingreso (lo hace el SDK).
- [ ] `returnTo` solo acepta rutas relativas (lo valida el SDK); no agregues
      redirecciones a URLs que vengan de la query.
- [ ] Logout por `POST`.

Mínimo de permisos
- [ ] Pedí solo los scopes que usás (`LOGIN_SCOPE` en `src/lib/mirotaract.ts`).
      Si agregás uno, explicá en una línea para qué.
- [ ] No pidas `kernel.service.persons.contact.read` salvo que la app tenga
      que contactar personas.
- [ ] La app debería estar atada a la organización más chica posible (un
      club, no el distrito).

Webhooks
- [ ] **Verificá la firma** de cada webhook (`src/lib/webhooks.ts`): HMAC
      sobre `"<timestamp>.<cuerpo crudo>"`, tolerancia de 5 minutos,
      comparación en tiempo constante. Leé el cuerpo crudo
      (`request.text()`), no un JSON re-serializado.
- [ ] Deduplicá por `MiRotaract-Webhook-Id` / `event.id` (hay reintentos).
- [ ] Respondé 2xx en menos de 10 s; el trabajo pesado va a una cola.

Datos personales
- [ ] Guardá lo mínimo y por el tiempo mínimo; si podés consultar al kernel,
      no guardes copia.
- [ ] Respetá bajas: una membresía que deja de estar `ACTIVE` deja de ver el
      padrón.
- [ ] Los errores que ve la persona no incluyen detalles internos (solo el
      `traceId`).

## Desarrollo

- `mirotaract dev up` levanta un kernel local con datos **sintéticos**
  (Distrito 9999) y escribe `.env.local`. Cuentas de prueba:
  `mirotaract dev status` (contraseña `sandbox-9999`).
- `mirotaract webhooks listen --forward-to http://localhost:3000/api/webhooks`
  reenvía eventos firmados a esta app.
- `npm run typecheck` y `npm run build` tienen que pasar antes de un PR.
