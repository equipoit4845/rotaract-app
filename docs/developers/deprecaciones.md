# Política de deprecación

Tu app no puede romperse de un día para el otro por un cambio nuestro. Esta
página dice qué cambios hacemos sin avisar (los compatibles), cómo anunciamos
los que rompen compatibilidad y cuánto tiempo tenés para adaptarte.

## Resumen

- **6 meses como mínimo** entre que una operación, un campo, un scope o un
  evento se anuncia como deprecado y el día en que puede dejar de funcionar
  (el _sunset_).
- **Aviso por email** a la persona responsable de cada app activa, el día que
  se anuncia y de nuevo cerca del sunset.
- **Aviso en cada respuesta**: las operaciones deprecadas responden con las
  cabeceras `Deprecation`, `Sunset` y `Link`.
- **Todo queda en el [changelog](changelog.md)** y en el contrato
  (`kernel-openapi.yaml`).

## Qué es compatible (no se avisa con plazo)

Estos cambios pueden llegar en cualquier momento y tu código tiene que
tolerarlos:

- Agregar endpoints, operaciones, parámetros **opcionales** o cabeceras.
- Agregar campos a una respuesta o a un evento. **Ignorá los campos que no
  conocés**; no valides las respuestas con esquemas cerrados
  (`additionalProperties: false`).
- Agregar valores nuevos a un enum de respuesta (por ejemplo, un estado
  nuevo). Tratá los valores desconocidos con un caso por defecto.
- Agregar tipos de evento nuevos (solo los recibís si te suscribís).
- Cambiar el texto de `detail` o `title` en un error. Para decidir, usá
  `status` y `code`, nunca el texto.
- Cambiar el orden de los campos o el formato de un cursor (es opaco).

## Qué rompe compatibilidad (6 meses de aviso)

- Quitar o renombrar un endpoint, un campo, un parámetro, un scope o un tipo
  de evento.
- Hacer obligatorio algo que era opcional, o restringir los valores que
  aceptamos.
- Cambiar el tipo o el significado de un campo.
- Cambiar el formato de los tokens, de la firma de los webhooks o de los
  errores.

Los eventos de webhook se versionan en el nombre (`membership.activated.v1`).
Un cambio que rompe un evento sale como un tipo nuevo (`.v2`); el viejo se
sigue enviando durante el plazo de deprecación.

Excepción: si un cambio es necesario para cerrar un problema de **seguridad**
o para cumplir una obligación de **protección de datos**, puede llegar con
menos plazo. Lo avisamos igual, lo antes posible, y lo explicamos en el
changelog.

## Cómo te enterás

### En las respuestas de la API

Una operación deprecada sigue funcionando igual, pero agrega:

```http
Deprecation: @1791072000
Sunset: Sun, 04 Apr 2027 00:00:00 GMT
Link: <https://developers.rotaract4845.com/docs/deprecaciones#serviceListMembers>; rel="deprecation"; type="text/html"
```

| Cabecera | Estándar | Qué dice |
|---|---|---|
| `Deprecation` | RFC 9745 | Desde cuándo está deprecada (`@` + segundos Unix). |
| `Sunset` | RFC 8594 | Desde cuándo puede dejar de existir (fecha HTTP). |
| `Link` (`rel="deprecation"`) | RFC 9745 | Dónde leer qué cambia y cómo migrar. |

Conviene que tu app registre una advertencia cuando ve `Deprecation`, así te
enterás aunque no leas el email. Las cabeceras son visibles desde el
navegador (están en `Access-Control-Expose-Headers`).

```ts
const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
if (response.headers.has("Deprecation"))
  console.warn("Mi Rotaract: operación deprecada", url, response.headers.get("Sunset"));
```

### En el contrato

En `kernel-openapi.yaml`, la operación queda con `deprecated: true` y dos
fechas: `x-deprecated-at` (el anuncio) y `x-sunset` (el retiro). La
validación del contrato (`pnpm contracts:openapi`) rechaza una deprecación
sin fechas o con menos de 6 meses de plazo. El kernel lee esas mismas fechas
para las cabeceras, así que nunca se contradicen.

### Por email

Cuando se publica una entrada del changelog que deprecia o retira algo, el
distrito corre:

```bash
pnpm --filter @mirotaract/institutional-kernel-api notify:changelog -- --entry <id>
```

y le llega un email a la persona responsable (`owner`) de cada app **activa**,
con la lista de sus apps afectadas y el enlace al changelog. Un mismo envío
no se repite aunque el comando se corra dos veces. Si la persona
responsable de tu app cambió, pedile al RDR que la actualice en la consola.

### En el changelog y el portal

Cada deprecación tiene una entrada en el [changelog](changelog.md) que dice
qué cambia, desde cuándo, hasta cuándo y cómo migrar. El portal muestra las
operaciones deprecadas tachadas en la referencia de la API, con su fecha de
sunset.

## Calendario de una deprecación

| Cuándo | Qué pasa |
|---|---|
| Día 0 | Entrada en el changelog, `deprecated: true` en el contrato, cabeceras en las respuestas, email a los responsables. |
| Mes 5 | Recordatorio por email a los responsables de apps que **siguen** usando la operación (lo vemos en los registros de requests). |
| Mes 6 (sunset) | La operación puede dejar de existir. Si se retira, responde `410 Gone` durante al menos 30 días más antes de desaparecer. |

## Deprecaciones vigentes

Ninguna por ahora.

| Qué | Deprecada desde | Sunset | Reemplazo |
|---|---|---|---|
| — | — | — | — |
