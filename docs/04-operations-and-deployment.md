# Operación y despliegue

## Desarrollo local

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up --build
```

Servicios expuestos:

| Servicio        | Dirección                             |
| --------------- | ------------------------------------- |
| Web             | `http://localhost:3000`               |
| API             | `http://localhost:3001/api/kernel/v1` |
| Live health     | `http://localhost:3001/health/live`   |
| Ready health    | `http://localhost:3001/health/ready`  |
| NATS monitoring | `http://localhost:8222`               |

`/health/live` confirma que el proceso está vivo. `/health/ready` verifica
PostgreSQL, Redis y NATS.

## Variables principales

| Variable                                    | Uso                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `KERNEL_DATABASE_URL` / `KERNEL_DIRECT_URL` | PostgreSQL del Kernel                                                     |
| `REDIS_URL`                                 | cache y rate limiting distribuido                                         |
| `NATS_URL`                                  | NATS JetStream para Outbox                                                |
| `JWT_SECRET`                                | firma/verificación de JWT                                                 |
| `KERNEL_SERVICE_API_KEY`                    | compatibilidad de servicio sólo en desarrollo                             |
| `KERNEL_JOBS_ENABLED`                       | habilita jobs en el proceso actual                                        |
| `KERNEL_NATS_STREAM`                        | stream JetStream, por defecto `KERNEL_EVENTS`                             |
| `KERNEL_NATS_SUBJECT_PREFIX`                | prefijo de subjects, por defecto `kernel.events`                          |
| `KERNEL_OPENAPI_RUNTIME_VALIDATION`         | valida requests contra OpenAPI en runtime                                 |
| `KERNEL_OPENAPI_RESPONSE_VALIDATION`        | valida respuestas JSON contra OpenAPI                                     |
| `KERNEL_OPENAPI_PATH`                       | ruta explícita de `kernel-openapi.yaml`                                   |
| `KERNEL_WEBHOOKS_ALLOW_INSECURE`            | `true` permite webhooks http y a destinos privados (solo local/sandbox)   |
| `KERNEL_WEBHOOK_STREAM_ENABLED`             | `true` habilita el stream SSE de eventos para la CLI (solo local/sandbox) |
| `KERNEL_WEBHOOKS_DISPATCH_ENABLED`          | `false` apaga el envío de webhooks en un proceso con jobs                 |
| `KERNEL_WEBHOOKS_DISPATCH_INTERVAL_MS`      | cada cuánto el worker reparte y envía webhooks (5000)                     |
| `CLICKMAIL_*`                               | adaptador de email opcional                                               |
| `KERNEL_STATUS_*`                           | sondas y reglas de la página de estado (E12, ver doc 19)                  |
| `PORTAL_STATUS_API_URL`                     | de dónde lee el portal el estado (`/estado`)                              |

Los secretos nunca deben usarse con los valores por defecto de `.env.example`
en un entorno público.

## Migraciones y seed base

```bash
pnpm db:generate
pnpm db:deploy
pnpm db:seed
```

El servicio `migrate` de Compose está disponible bajo el perfil `tools`.
Las migraciones se aplican también al iniciar la API si hay pendientes.

## Worker y jobs

El worker adquiere un advisory lock de PostgreSQL para impedir ejecución
simultánea entre réplicas. Cada intervalo procesa:

- expiración de tokens, invitaciones, sesiones, solicitudes y transferencias;
- activación/cierre de períodos;
- activación/finalización de nombramientos por fecha;
- publicación de Outbox.

Redis no es fuente de verdad. Ante caída, la lectura debe degradar a
PostgreSQL; el rate limiting también tiene fallback local.

El worker también corre las **sondas de estado** cada minuto (E12.1, ver
[19-operations-e12.md](19-operations-e12.md)): guarda una medición por
componente y minuto y el resumen diario del que sale el uptime de 90 días.
Se apagan con `KERNEL_STATUS_PROBES_ENABLED=false`.

## Producción en el VPS

Producción corre en un VPS de 2 CPU / 3,9 GB con este mismo
`docker-compose.yml` (proyecto `rotaract-app`), publicada por túneles de
Cloudflare (`cloudflared-distrito4845`, `cloudflared-rotaract`) hacia
`127.0.0.1`: web :3000, API :3001, meetings-web :3002, meetings-api :3003,
portal :3004. Secretos sólo en `.env` (600); el compose exige los
obligatorios con `:?`. Los puertos del host se pueden cambiar con
`*_HOST_PORT` (mismos valores por defecto), lo que permite levantar copias
descartables del stack en otros puertos.

### Despliegues

- **Hoy:** `docker compose build <svc>` + `docker compose run --rm migrate` +
  `docker compose up -d <svc>` (unos segundos de corte por servicio).
- **Sin corte (E12.2, listo, sin activar):** overlay
  `infra/deploy/compose.zero-downtime.yml` (nginx `edge` + slots blue/green
  de api y web) y `scripts/deploy.sh <servicio...>` con backup, build,
  migración aparte, cambio de slot por salud, drenaje y rollback. Probado con
  carga continua: 8 860 requests, 0 fallidos durante dos redeploys de api y
  web. El paso único de activación está en
  [runbooks/e12-lead.md](runbooks/e12-lead.md).
- Las migraciones tienen que ser compatibles hacia atrás (expand/contract).

### Backups

- **Local:** `scripts/backup-postgres.sh` todos los días a las 03:30
  (`~/backups/rotaract`, 14 días), sin cifrar, sólo la base del kernel.
- **Fuera del VPS (E12.2, listo, sin activar):** `scripts/backup-offsite.sh`
  (kernel + meetings + uploads de Reuniones, cifrado GPG AES-256, rclone a
  R2/S3/Drive) y `scripts/restore-drill.sh` (restauración mensual en un
  postgres descartable con chequeos). Líneas de cron en
  [19-operations-e12.md](19-operations-e12.md#cron-no-instalado-lo-agrega-el-lead).

### Estado y sandbox

- Página pública: `developers.rotaract4845.com/estado`; API pública
  `GET /api/kernel/v1/status` y `/status/history`; incidentes y
  mantenimientos desde Mi Rotaract → Distrito → Estado.
- Sandbox con el Distrito 9999 (`infra/sandbox/`), separado de producción,
  con reseteo nocturno: listo, sin desplegar.
