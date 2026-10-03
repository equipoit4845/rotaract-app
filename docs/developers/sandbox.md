# Sandbox

Un kernel de pruebas separado de producción, con datos sintéticos, para
probar tu app contra un servidor real sin tocar datos de personas reales.

> **Estado:** listo pero todavía no publicado. Cuando esté activo va a vivir
> en `https://api.sandbox.rotaract4845.com/api/kernel/v1` (API) y
> `https://sandbox.rotaract4845.com` (Mi Rotaract), y su estado aparece en
> [/estado](/estado). Mientras tanto, usá el kernel local de la CLI
> (`mirotaract dev up`, ver [cli.md](cli.md)): tiene los mismos datos.

## Qué tiene

- **Distrito 9999 (sandbox):** 6 clubes, unas 60 personas con nombres y
  correos inventados (`@example.org`), el período rotario actual, presidencias,
  secretarías, RDR y secretaría distrital.
- **Cuentas de prueba** por cargo (`rdr@example.org`,
  `presidencia.norte@example.org`, `socio.norte@example.org`, ...) con una
  contraseña compartida que se publica junto con el anuncio del sandbox.
- **Webhooks:** el stream de eventos para `mirotaract webhooks listen` está
  activo. Los endpoints de webhook tienen que ser `https://` públicos.

## Qué no tiene

- Datos reales: nada de lo que hay ahí corresponde a una persona.
- Correo: los mails de verificación e invitación no salen.
- Garantías: el uptime se publica, pero no hay compromiso de servicio.

## Reseteo nocturno

Todas las noches (04:15, hora de Paraguay) el sandbox vuelve a los datos
sintéticos originales: se pierden los socios, cargos y trámites que hayas
creado. **Se conservan** tus apps registradas, sus secretos, los endpoints
de webhook, los consentimientos y las claves de firma, así que tu app sigue
funcionando al día siguiente con las mismas credenciales.

Las cuentas que hayas registrado vos se borran (usá las cuentas de prueba),
y con ellas las apps cuyo responsable eran.

## Claves separadas

El sandbox firma sus tokens con claves propias: un token del sandbox nunca
sirve en producción ni al revés. Usá el issuer del sandbox
(`https://api.sandbox.rotaract4845.com/api/kernel/v1`) en la configuración
OIDC de tu entorno de pruebas.
