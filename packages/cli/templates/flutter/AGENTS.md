# AGENTS.md — contexto para asistentes de IA (y personas)

Esta app móvil es un cliente de **Mi Rotaract**, el sistema institucional del
Distrito Rotaract 4845. Leé esto antes de cambiar código.

## Reglas de arquitectura

- El **kernel** de Mi Rotaract es la única fuente de verdad. La app no copia
  ni corrige datos institucionales.
- La app es un cliente OAuth **`PUBLIC`**: se identifica solo con su
  `client_id` + **PKCE S256**. **No hay secreto y no tiene que haberlo**: todo
  lo que se compila en la app (incluidos los `--dart-define`) se puede
  extraer del binario.
- La API de datos (`/service/*`) **no se llama desde la app**: necesita un
  token de servicio con secreto. La app llama a su backend (`/api/members`)
  con el access token de la persona y el backend decide qué devolver.
- Login en el **navegador del sistema** (Custom Tabs / ASWebAuthenticationSession
  vía `flutter_appauth`). **Nunca** un WebView embebido.

## Checklist de seguridad (obligatoria)

Tokens
- [ ] Access token **solo en memoria**. Nunca en `SharedPreferences`,
      archivos, logs ni analytics (en web: nunca en `localStorage`).
- [ ] Refresh token solo en `flutter_secure_storage` (Keychain/Keystore);
      guardá siempre el último (rota en cada uso) y borralo al salir.
- [ ] PKCE `S256`, `state` y `nonce` en cada ingreso (lo hace AppAuth; no lo
      desactives).
- [ ] La app no "verifica" permisos con claims decodificados: quien autoriza
      es el backend, que **verifica el access token con el JWKS** del kernel
      (firma, `iss`, `aud`, que el `client_id` sea el de esta app) y consulta
      userinfo.
- [ ] Identificá a las personas por `sub`, no por email.

Configuración
- [ ] `dart_defines.json` y `.env*` no van al repo, y no contienen secretos.
- [ ] Direcciones de regreso `https://` con App Links / Universal Links
      verificados en producción. Nada de esquemas propios (el kernel no los
      acepta) ni de `http://` fuera de desarrollo.
- [ ] `allowInsecureConnections` solo se activa contra `http://localhost`.

Mínimo de permisos
- [ ] Pedí solo los scopes que usás (`AppConfig.scopes`). Si agregás uno,
      explicá en una línea para qué.

Webhooks
- [ ] Una app móvil no recibe webhooks: los recibe y **verifica su firma**
      el backend (HMAC con marca de tiempo, ver la plantilla `next`/`fastapi`),
      que después notifica a la app por su propio canal.

Datos personales
- [ ] No caches el padrón en el dispositivo más de lo necesario; si lo
      cacheás, cifralo y borralo al salir.
- [ ] Respetá bajas: si el backend responde 401/403, cerrá la sesión.

## Desarrollo

- `flutter analyze` y `flutter test` tienen que pasar antes de un PR.
- Kernel local: `mirotaract dev up` (datos sintéticos, Distrito 9999);
  `mirotaract dev status` muestra el `client_id` de la app `PUBLIC` de prueba.
