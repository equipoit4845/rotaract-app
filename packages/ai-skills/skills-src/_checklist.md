## Checklist de seguridad (obligatoria)

Repasala antes de dar la tarea por terminada. Es la misma del `AGENTS.md` de
las plantillas de `mirotaract init` y de `docs/developers/seguridad.md`.

- [ ] **Tokens nunca en `localStorage` ni `sessionStorage`** (ni en estado del
      cliente que se serialice al navegador). En web: sesión del lado del
      servidor (BFF) con cookie `httpOnly`, `Secure`, `SameSite=Lax`. En móvil:
      access token solo en memoria y refresh token en Keychain/Keystore.
- [ ] **Verificá los tokens con el JWKS** (`{issuer}/.well-known/jwks.json`):
      firma `ES256` (fijá `algorithms: ["ES256"]`), `iss` = issuer, `aud` = tu
      `client_id`, `exp`, y `nonce` en el ingreso. Decodificar sin verificar
      (`jwt.decode`, `decodeJwt`, `verify_signature: False`) no cuenta. Los
      SDKs oficiales ya lo hacen: no los reemplaces.
- [ ] **Scopes mínimos**: cada scope tiene un uso concreto que podés explicar
      en una oración. `kernel.service.persons.contact.read` solo si la app
      tiene que contactar personas. La app, atada a la organización más chica
      posible (un club, no el distrito).
- [ ] **Verificá la firma de cada webhook** con el SDK (`verifyWebhook`,
      `createWebhookHandler`, `miRotaractWebhook`, `verify_webhook`) o con
      HMAC-SHA256 sobre `"<timestamp>.<cuerpo crudo>"`, tolerancia de 300 s y
      comparación en tiempo constante. Deduplicá por `event.id`.
- [ ] **Secretos solo en variables de entorno del servidor**
      (`MIROTARACT_CLIENT_SECRET`, `MIROTARACT_WEBHOOK_SECRET`,
      `SESSION_SECRET`): nunca en el código, el repo, `NEXT_PUBLIC_*`,
      `--dart-define`, componentes `"use client"` ni respuestas al navegador.
      `.env.local` en `.gitignore`.
- [ ] **Nada de datos personales en los logs**: ni tokens, ni secretos, ni
      encabezados `Authorization`, ni emails, teléfonos, nombres o el cuerpo
      completo de un evento. Logueá ids (`event.id`, `traceId`) y tipos.
- [ ] Identificá a las personas por `sub` / `personId`, nunca por email.
- [ ] El kernel es la fuente de verdad: no mantengas un padrón paralelo que
      lo "corrija" y nunca te conectes a su base de datos.
