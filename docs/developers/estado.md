# Estado del servicio

Cuando tu app depende del kernel, una caída del kernel también es una caída
de tu app. Esta página explica dónde ver el estado, cómo leerlo desde tu
código y qué hacer cuando algo falla.

## Dónde mirar

- **Página pública:** [developers.rotaract4845.com/estado](/estado). Estado
  actual de cada servicio, barras de los últimos 90 días, incidentes abiertos,
  mantenimientos anunciados e historial.
- **JSON:** `GET https://api.rotaract4845.com/api/kernel/v1/status` y
  `GET .../status/history?days=90`. Son públicos (sin token), se pueden leer
  desde cualquier origen y se cachean 30 s y 5 min.
- **`/status.json` del portal:** el mismo `GET /status`, pero servido por el
  portal. Si la API no responde, igual contesta, con `status: "MAJOR_OUTAGE"`
  y `source: "portal"`.

## Servicios

| Clave      | Servicio                    | Cómo se mide                                        |
| ---------- | --------------------------- | --------------------------------------------------- |
| `web`      | Mi Rotaract (web)           | La pantalla de ingreso responde                     |
| `api`      | API del kernel              | `/health/ready`: base de datos, Redis y NATS        |
| `oidc`     | Inicio de sesión (OIDC)     | Descubrimiento OpenID y JWKS con al menos una clave |
| `webhooks` | Webhooks                    | La cola de eventos y envíos no se atrasa            |
| `meetings` | Reuniones                   | API y web de reuniones                              |
| `portal`   | Portal para desarrolladores | El portal responde                                  |
| `sandbox`  | Sandbox                     | El kernel de pruebas responde (cuando esté activo)  |

El worker del kernel mide cada servicio **una vez por minuto** desde el
servidor. Una falla se confirma con un segundo intento antes de registrarla.

## Estados

| Estado           | Significa                                              |
| ---------------- | ------------------------------------------------------ |
| `OPERATIONAL`    | Funciona                                               |
| `DEGRADED`       | Responde, pero lento (más de 3 s) o con partes caídas  |
| `PARTIAL_OUTAGE` | Una parte importante no funciona (incidente declarado) |
| `MAJOR_OUTAGE`   | No responde                                            |
| `MAINTENANCE`    | Mantenimiento anunciado en curso                       |
| `UNKNOWN`        | Sin mediciones de los últimos 5 minutos                |

La **disponibilidad** (uptime) es la proporción de minutos en que el servicio
respondió. Los minutos lentos cuentan como disponibles; los de un
mantenimiento anunciado no cuentan. Se redondea hacia abajo: un solo minuto
caído en 90 días ya es 99,99 %, nunca 100 %.

## Incidentes y mantenimientos

- Un **incidente** se abre cuando algo ya falla y pasa por _Investigando_,
  _Causa identificada_, _En observación_ y _Resuelto_.
- Un **mantenimiento** se anuncia **con al menos 24 horas de anticipación**.
  Empieza y termina solo a la hora anunciada.

Los publica el distrito (RDR) desde Mi Rotaract → _Distrito → Estado_.

## Qué hacer desde tu app

- Los SDKs oficiales ya reintentan lecturas ante `503` y `429`. No reintentes
  escrituras sin `Idempotency-Key`.
- Si tu app tiene una pantalla de error, podés leer `GET /status` y mostrar
  "Mi Rotaract tiene un problema, ya lo estamos viendo" en vez de un error
  genérico.
- Antes de un evento importante, revisá los mantenimientos programados en
  `scheduledMaintenances`.

```ts
const res = await fetch("https://api.rotaract4845.com/api/kernel/v1/status");
const status = await res.json();
if (status.status !== "OPERATIONAL") console.warn(status.description);
```
