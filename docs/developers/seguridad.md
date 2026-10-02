# Seguridad

Tu app va a manejar datos de socios y socias reales del distrito. Esta
checklist es **obligatoria**: el RDR la va a repasar con vos antes de
registrar la app definitiva o de ampliarle los permisos.

## Checklist antes de pedir producción

### Credenciales

- [ ] El secreto (`mrs_…`) está en una variable de entorno o en un gestor de
      secretos (Vault, Doppler, 1Password, los secretos de tu proveedor de
      hosting). **No** está en el código, en el repositorio, en un `.env`
      versionado, en capturas de pantalla ni en tickets.
- [ ] El secreto **nunca** llega al navegador ni a una app móvil. Si tu app
      corre ahí, es `PUBLIC` y no tiene secreto.
- [ ] Solo las personas que operan el servidor tienen acceso al secreto.
- [ ] Sabés cómo rotarlo sin cortar el servicio (ver
      [registrar-una-app.md](registrar-una-app.md#rotar-el-secreto)) y lo
      probaste al menos una vez.
- [ ] Los logs no imprimen secretos, tokens, códigos ni encabezados
      `Authorization`.

### Ingresar con Mi Rotaract

- [ ] Usás **PKCE `S256`** en todos los ingresos (el kernel no acepta otra
      cosa).
- [ ] Generás `state` aleatorio por intento y lo **comparás** en el callback.
- [ ] Generás `nonce` aleatorio por intento y lo comparás con el del
      `id_token`.
- [ ] Guardás `state`, `nonce` y `code_verifier` **del lado del servidor**
      (o en cookie cifrada `httpOnly`), y los borrás después de usarlos.
- [ ] **Verificás el `id_token`**: firma ES256 contra el JWKS, `iss`,
      `aud` = tu `client_id`, `exp`, `nonce`. Decodificar sin verificar no
      cuenta.
- [ ] Identificás a las personas por `sub`, no por email.
- [ ] En apps web, los tokens **no** están en `localStorage` ni
      `sessionStorage`. Usás sesión del lado del servidor (BFF) con cookie
      `httpOnly`, `Secure`, `SameSite=Lax`.
- [ ] Los refresh tokens se guardan del lado del servidor y cifrados en
      reposo (o en Keychain/Keystore en móvil).
- [ ] Manejás la rotación del refresh token sin carreras (un refresh a la
      vez por persona).
- [ ] Tus direcciones de regreso son `https://` en producción. Las de
      `localhost` son solo para desarrollo y se sacan de la app de
      producción cuando no hacen falta.
- [ ] Tu callback no tiene un "redirect abierto" (no redirige a una URL que
      viene en la query sin validarla).

### Mínimo de permisos

- [ ] Cada scope que pedís tiene un uso concreto en tu app, y lo podés
      explicar en una oración.
- [ ] No pedís `kernel.service.persons.contact.read` salvo que tengas que
      contactar personas, y en ese caso está documentado para qué.
- [ ] Si un proceso usa menos scopes que la app, pide el token solo con esos
      (`scope=` en `client_credentials`).
- [ ] La app está atada a la organización más chica posible: si es de un
      club, es del club, no del distrito.

### Datos personales

- [ ] Guardás solo lo que necesitás y lo borrás cuando deja de hacer falta.
      Si podés consultar al kernel en el momento, no guardes copia.
- [ ] Si guardás una copia, es una caché: el kernel sigue siendo la fuente
      de verdad. Nunca "corregís" datos institucionales en tu app.
- [ ] Los datos de contacto (email, teléfono, fecha de nacimiento) no se
      muestran a quien no los necesita, no se exportan a planillas
      compartidas y no se usan para otra cosa que la declarada.
- [ ] Respetás las bajas: si alguien deja de ser socio/a (`status` distinto
      de `ACTIVE`) o le quita el acceso a tu app, dejás de tratarlo/a como
      activo/a.
- [ ] Tu base y tus backups están cifrados y con acceso restringido.
- [ ] Sabés a quién avisar (el RDR) si hay un incidente con datos
      personales.

### Operación

- [ ] Cacheás el token de servicio (no pedís uno por llamada).
- [ ] Respetás `Retry-After` y no reintentás en bucle errores `4xx`.
- [ ] Tenés una persona responsable de la app, conocida por el RDR.
- [ ] Nada de tu app se conecta a la base de datos de Mi Rotaract: todo pasa
      por la API.

## Si se filtra un secreto

Un secreto filtrado (subido a un repo público, pegado en un chat, en una
captura) se considera comprometido aunque creas que nadie lo vio.

1. **Avisale al RDR en el momento.**
2. El RDR crea un **secreto nuevo** en la consola.
3. Desplegás la app con el secreto nuevo.
4. El RDR **revoca el secreto filtrado de inmediato** (no espera los 7 días
   de convivencia).
5. Si sospechás uso indebido, el RDR **pausa la app** mientras se revisa.
   Pausar corta también los tokens ya emitidos en la siguiente llamada.
6. Borrá el secreto de donde se filtró (y del historial de git, si fue ahí;
   igual hay que rotarlo).

Si se filtró un refresh token, revocalo con `POST /oauth/revoke`. Si no
sabés cuáles se filtraron, el RDR puede revocar la app (eso desconecta a
todas las personas) y registrar una nueva.

## Si encontrás una vulnerabilidad

En Mi Rotaract o en otra app del distrito: no la explotes ni la publiques.
Reportala en privado al RDR con los pasos para reproducirla.
