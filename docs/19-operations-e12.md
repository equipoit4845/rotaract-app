# Operación y confiabilidad (E12)

> "Cuando otras apps dependen del kernel, una caída del kernel es una caída
> del distrito."

E12 agrega cuatro piezas: una **página de estado** pública con incidentes y
mantenimientos (E12.1), **despliegues sin corte** y **backups cifrados fuera
del VPS** con prueba de restauración (E12.2), y un **sandbox** separado de
producción (E12.3). Todo está pensado para el VPS actual: 2 CPU, 3,9 GB de
RAM, sin swap, producción y otras apps en la misma máquina.

Qué está activo y qué no:

| Pieza                         | Estado al mergear                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| Sondas, uptime, API de estado | Se activa con el próximo deploy de api/worker (migración `20261005110000_status_e12`) |
| `/estado` del portal          | Se activa con el próximo deploy del portal                                            |
| Pantalla de incidentes        | Se activa con el próximo deploy de la web (`/developer/estado`)                       |
| `scripts/deploy.sh` sin corte | **Listo, no activado.** Requiere el corte único del runbook                           |
| Backups off-site              | **Listo, no activado.** Falta el remoto rclone, la passphrase y el cron               |
| Sandbox                       | **Listo, no desplegado.** Falta DNS/ingress y decidir si entra en la RAM              |

El paso a paso para el lead está en
[runbooks/e12-lead.md](runbooks/e12-lead.md).

## E12.1 Estado del servicio

### Componentes y sondas

El **worker** (`KERNEL_JOBS_ENABLED=true`) corre `StatusProbeService` cada
minuto (`KERNEL_STATUS_PROBE_INTERVAL_MS`, 60 000):

| Clave      | Nombre                      | Sonda (destinos por defecto, red de compose)                            |
| ---------- | --------------------------- | ----------------------------------------------------------------------- |
| `web`      | Mi Rotaract (web)           | `GET http://web:3000/login`                                             |
| `api`      | API del kernel              | `GET http://api:3001/health/ready` (Postgres, Redis, NATS)              |
| `oidc`     | Inicio de sesión (OIDC)     | discovery con `issuer`/`jwks_uri`/`token_endpoint` + JWKS con ≥ 1 clave |
| `webhooks` | Webhooks                    | en la base: atraso de la cola (outbox sin repartir, envíos vencidos)    |
| `meetings` | Reuniones                   | `meetings-api:3003/meetings-api/health` y `meetings-web:3002/`          |
| `portal`   | Portal para desarrolladores | `GET http://developers-portal:3004/`                                    |
| `sandbox`  | Sandbox                     | sólo si `KERNEL_STATUS_PROBE_SANDBOX_URLS` tiene valor                  |

Reglas (puras, en `application/status/status-probes.ts`):

- 2xx o redirección = `UP`; más lento que `KERNEL_STATUS_DEGRADED_MS` (3000)
  = `DEGRADED`; error, timeout (`KERNEL_STATUS_PROBE_TIMEOUT_MS`, 10 s),
  4xx o 5xx = `DOWN`.
- Varios destinos (Reuniones): todos caídos = `DOWN`; alguno caído =
  `DEGRADED` (interrupción parcial).
- Webhooks: atraso > 5 min = `DEGRADED`, > 15 min = `DOWN`. Un envío que
  espera su próximo reintento no es atraso: los receptores caídos de
  terceros no pintan de rojo al kernel.
- Una falla se **confirma** con un segundo intento 2 s después
  (`KERNEL_STATUS_PROBE_RETRY_MS`) antes de registrarse.
- Cada destino se configura con `KERNEL_STATUS_PROBE_<CLAVE>_URLS` (lista
  separada por comas); `off` saca el componente de la página.

### Almacenamiento, retención y uptime

- `StatusCheck`: una fila por componente y **minuto** (único
  `(component, bucket)`: dos workers nunca cuentan doble). Se guarda 7 días
  (`KERNEL_STATUS_RAW_RETENTION_DAYS`).
- `StatusDailySummary`: por componente y día UTC, contadores `up`,
  `degraded`, `down`, `maintenance` y latencia. Se guarda 90 días
  (`KERNEL_STATUS_HISTORY_DAYS`). Unas 7 × 90 filas en total.
- **Uptime** = minutos que respondieron (`UP` + `DEGRADED`) / minutos que
  cuentan. Los minutos dentro de un mantenimiento anunciado de ese
  componente no cuentan. Sin minutos que cuenten no hay uptime (`null`),
  nunca 100 %. Se redondea **hacia abajo** con dos decimales: un minuto caído
  en 90 días es 99,99 %.
- Estado que se muestra: la sonda; si hay un mantenimiento en curso,
  `MAINTENANCE`; nunca menos grave que un incidente abierto (`MINOR` →
  `DEGRADED`, `MAJOR` → `PARTIAL_OUTAGE`, `CRITICAL` → `MAJOR_OUTAGE`). Sin
  mediciones de los últimos 5 minutos: `UNKNOWN`. El general es el más grave.

### Incidentes y mantenimientos

Reglas en `application/status/incident-rules.ts`:

- **Incidente** (`INCIDENT`): algo ya falla. `INVESTIGATING` →
  `IDENTIFIED` → `MONITORING` (se alternan libremente) → `RESOLVED`, que es
  final: si vuelve a fallar, se abre otro (la historia queda honesta).
- **Mantenimiento** (`MAINTENANCE`): se anuncia con al menos **24 h** de
  anticipación (`KERNEL_STATUS_MAINTENANCE_NOTICE_HOURS`) y dura hasta
  **72 h** (`KERNEL_STATUS_MAINTENANCE_MAX_HOURS`). `SCHEDULED` →
  `IN_PROGRESS` → `COMPLETED`, o `SCHEDULED` → `CANCELLED`. **El worker lo
  inicia y lo completa solo** cuando se abre y cierra la ventana. La ventana
  se puede postergar libremente; adelantarla exige la misma anticipación.
  Urgente = incidente.
- Cada cambio de estado lleva un mensaje público. Cerrado sólo admite
  corregir el título. Ninguna respuesta pública tiene autor ni datos
  personales (`createdById` es interno).

Permiso: `kernel.status.manage`, que la migración y el seed le dan al rol
`DISTRICT_RDR` (alcance del distrito); SUPERADMIN pasa por el bypass. Se
evalúa contra las organizaciones `DISTRICT` y a nivel plataforma; nada de lo
que manda el cliente elige el alcance.

### API

| Operación                                       | Auth                   | Cache         |
| ----------------------------------------------- | ---------------------- | ------------- |
| `GET /status`                                   | pública                | `max-age=30`  |
| `GET /status/history?days=1..90`                | pública                | `max-age=300` |
| `GET /status/incidents?state=open\|closed\|all` | `kernel.status.manage` | —             |
| `POST /status/incidents`                        | `kernel.status.manage` | —             |
| `PATCH /status/incidents/{id}`                  | `kernel.status.manage` | —             |
| `POST /status/incidents/{id}/updates`           | `kernel.status.manage` | —             |

Las públicas responden `Access-Control-Allow-Origin: *` (salvo a los orígenes
de CORS configurados, que reciben el suyo). Errores de reglas:
`400 KERNEL_STATUS_INVALID` con `errors: [{path, message}]` en castellano.

### Pantallas

- **Portal** (`apps/developers-portal`): `/estado` (estado actual, barras de
  90 días, incidentes, mantenimientos programados, historial) y
  `/status.json`. Las lee en cada request desde `PORTAL_STATUS_API_URL`
  (compose: `http://api:3001/api/kernel/v1`, dentro de la red). Si el kernel
  no responde, el portal lo dice él mismo y `/status.json` devuelve
  `MAJOR_OUTAGE` con `source: "portal"`.
- **Mi Rotaract** (`apps/mirotaract-web`): _Distrito → Estado_
  (`/developer/estado`), visible con `kernel.status.manage`: estado actual,
  abrir incidente, anunciar mantenimiento, publicar actualizaciones.
- Guía para desarrolladores: [developers/estado.md](developers/estado.md).

## E12.2 Despliegues sin corte

### Diseño

`docker-compose.yml` no cambia de comportamiento (sólo se volvieron
configurables los puertos del host, con los mismos valores por defecto). El
mecanismo nuevo es un overlay, `infra/deploy/compose.zero-downtime.yml`:

```
cloudflared ─▶ 127.0.0.1:3001/3000 ─▶ edge (nginx, ~4 MB) ─▶ api-blue | api-green
                                                         └▶ web-blue | web-green
```

- `edge` toma los puertos del host de api y web, así que **cloudflared no
  cambia**. También responde a los nombres `api` y `web` dentro de la red:
  meetings-api (`http://api:3001/...`), el portal y las sondas siguen igual.
- Cada uno de api y web tiene dos slots; **entre deploys corre uno solo**.
  Dos copias conviven sólo durante el deploy (~1 min, ~250 MB extra para la
  API y ~130 MB para la web).
- Los slots arrancan `node dist/main` / `next start` directamente (sin pnpm
  ni Prisma CLI: ~150 MB menos y arranque en ~14 s) bajo `tini`
  (`init: true`), así un `docker stop` termina en el acto.
- El slot activo vive en `infra/deploy/state/upstreams.conf` (montado en el
  edge); `history.log` registra cada deploy.

### `scripts/deploy.sh`

```bash
scripts/deploy.sh api web            # release habitual del kernel
scripts/deploy.sh worker             # sin tráfico: se recrea
scripts/deploy.sh developers-portal  # se recrea (segundos de corte)
scripts/deploy.sh --rollback api     # vuelve al slot anterior (ya detenido, imagen anterior)
scripts/deploy.sh --cutover          # una sola vez: pasar de compose clásico al edge
```

Pasos: lock (`flock`) → backup de la base (`scripts/backup-postgres.sh`, si
toca api/worker) → build (una vez, con la caché de Docker) → migraciones
como paso aparte (`docker compose run --rm migrate`) → arranca el slot
inactivo con la imagen nueva → espera _healthy_ y además prueba la ruta de
readiness **desde el edge** (`/health/ready`, `/login`) → reescribe
`upstreams.conf` y `nginx -s reload` (los workers viejos terminan sus
requests) → verifica el tráfico a través del edge → drena 15 s
(`DEPLOY_DRAIN_SECONDS`) → detiene el slot viejo (se conserva para
`--rollback`).

Fallas: si el slot nuevo no queda sano en `DEPLOY_HEALTH_TIMEOUT` (240 s),
se muestran sus logs, se detiene y **el viejo sigue sirviendo** (exit 1). Si
falla la verificación después del cambio, se restaura `upstreams.conf`, se
recarga nginx y se detiene el nuevo.

`worker`, `developers-portal`, `meetings-api` y `meetings-web` se recrean
(`up --force-recreate`): el worker no recibe tráfico; los otros tienen unos
segundos de corte (meetings mantiene sockets y estado en memoria; el portal
podría sumarse a blue/green copiando el patrón si hace falta).

### Migraciones compatibles hacia atrás

Durante el deploy la versión vieja sigue atendiendo contra el esquema nuevo.
Toda migración tiene que ser **expand/contract**: agregar tablas, columnas
opcionales o con default, índices (`CONCURRENTLY` si la tabla es grande);
renombrar o borrar en dos releases (primero el código deja de usarlo, después
la migración lo quita). La de E12 sólo agrega.

### Prueba sin corte (proyecto descartable `e12zd`, puertos 55900/55901)

Stack completo de producción (postgres, redis, nats, api, web, edge) con las
imágenes construidas desde este árbol, carga continua de 8 clientes
(≈ 28 req/s) repartida entre `/health/ready`, `GET /status`, JWKS,
discovery OIDC y `/login` de la web, con `CF-Connecting-IP` variable (como
detrás de Cloudflare).

| Corrida (2026-10-03)                                                         | Requests | Fallidos                | p50 / p99 / máx         |
| ---------------------------------------------------------------------------- | -------- | ----------------------- | ----------------------- |
| 2 redeploys completos de api + web, rollback de web y un release roto de api | 8 860    | **0**                   | 10 ms / 30 ms / 169 ms  |
| Igual, corrida anterior                                                      | 9 776    | 3¹                      | 12 ms / 132 ms / 13,9 s |
| Corte inicial (`--cutover`, compose clásico → edge)                          | —        | ~1 s de corte, esperado | —                       |

¹ Tres `503` del propio `/health/ready` (un chequeo de dependencias que
superó su timeout de 1 s) en un instante sin cambio de slot; ningún
request a la API o a la web falló. En una corrida anterior, con un
`next build` de la web corriendo **a la vez** que dos stacks completos y
pruebas de otro equipo, el VPS se quedó sin memoria (load 170): hubo 89
timeouts repartidos en esos minutos, ninguno en los cambios de slot, y el
`meetings-api` de producción se reinició una vez al perder la base. Por eso:
**construir antes, con la máquina tranquila** (`docker compose build` o un
deploy en horario bajo) y nunca dos builds a la vez.

El release roto (readiness 404) quedó detenido a los 45 s y el slot viejo
siguió sirviendo sin un solo error.

## E12.2 Backups fuera del VPS y prueba de restauración

### `scripts/backup-offsite.sh`

1. `pg_dump --format=custom` de `institutional_kernel` y `meetings`;
   cada dump se valida con `pg_restore --list`.
2. El volumen `rotaract-app_meetings-uploads` en `tar.gz` (contenedor
   auxiliar de sólo lectura); se valida con `gzip -t`.
3. `MANIFEST` con `sha256` de cada pieza.
4. Todo en **un archivo** cifrado con GPG simétrico AES-256
   (`rotaract-<UTC>.tar.gpg`). `tar` va directo a `gpg`: nunca queda un
   paquete en claro en disco.
5. `rclone copyto` al remoto (`RCLONE_REMOTE`, cualquier backend: R2, S3,
   Google Drive, una carpeta) y verificación del tamaño subido.
6. Retención: 14 días locales (`RETENTION_DAYS`), 90 en el remoto
   (`REMOTE_RETENTION_DAYS`, `rclone delete --min-age`).

Sin `RCLONE_REMOTE`: guarda el archivo cifrado local y avisa
`WARNING ... upload skipped` (exit 0). Sin passphrase: **no corre** (exit 1).
Configuración en `~/.config/rotaract-backup/env` (o `BACKUP_CONFIG`); la
passphrase en `~/.config/rotaract-backup/passphrase` (600). **Guardar una
copia de la passphrase fuera del VPS**: sin ella los backups no sirven.

`scripts/backup-postgres.sh` (diario 03:30, local, sin cifrar) sigue igual;
el off-site lo complementa.

### `scripts/restore-drill.sh`

Baja el último backup del remoto (o del directorio local si no hay remoto,
o el archivo que se le pase), lo descifra (GPG detecta manipulación), verifica
el `MANIFEST`, restaura cada base en un **postgres descartable** (sin red,
password aleatoria, se borra al terminar) y revisa: `_prisma_migrations`
completa y sin migraciones a medio aplicar, tablas núcleo con filas
(`Person` ≥ `DRILL_MIN_PERSONS`), tablas de meetings, archivo de uploads
legible, antigüedad ≤ 48 h. Escribe el informe en
`BACKUP_DIR/drill-<UTC>.txt`; exit 1 = tratarlo como incidente.

### Cron (no instalado; lo agrega el lead)

```cron
# Backup local (ya existe)
30 3 * * * /home/equipoit/rotaract-app/scripts/backup-postgres.sh >> /home/equipoit/backups/rotaract/backup.log 2>&1
# Backup cifrado fuera del VPS, todos los días
45 3 * * * /home/equipoit/rotaract-app/scripts/backup-offsite.sh >> /home/equipoit/backups/rotaract/offsite.log 2>&1
# Prueba de restauración, el día 1 de cada mes
30 5 1 * * /home/equipoit/rotaract-app/scripts/restore-drill.sh >> /home/equipoit/backups/rotaract/drill.log 2>&1
# Reseteo del sandbox (sólo cuando esté desplegado)
15 4 * * * /home/equipoit/rotaract-app/infra/sandbox/sandbox.sh reset >> /home/equipoit/logs/sandbox-reset.log 2>&1
```

### Prueba del camino completo (2026-10-03)

Contra el proyecto descartable `e12zd` con datos sintéticos (60 personas) y
la base `meetings` migrada, rclone 1.75.1 con un remoto `type = local`:

- sin passphrase → exit 1; sin remoto → archivo cifrado + WARNING, exit 0;
- con remoto → subido y verificado (215 160 bytes);
- `restore-drill.sh` desde el remoto → `RESULTADO: OK` (9 migraciones del
  kernel hasta `20261005110000_status_e12`, `Person=60`, meetings con 24
  tablas, 2 archivos de uploads); contenedor descartable eliminado;
- un archivo con 4 bytes alterados → GPG `message has been manipulated`,
  exit 1.

## E12.3 Sandbox

`infra/sandbox/docker-compose.yml` (proyecto `mirotaract-sandbox`) y
`infra/sandbox/sandbox.sh`:

- Base propia, volúmenes propios, red propia, **`JWT_SECRET` y
  `KERNEL_SIGNING_KEY_SECRET` propios** (`sandbox.sh init-env` los genera):
  un token del sandbox no vale en producción ni al revés.
- Distrito 9999 de E6 (`prisma/seed-synthetic.ts`). Las cuentas de prueba
  usan `SANDBOX_TEST_PASSWORD` (publicable); el superadmin usa
  `SANDBOX_ADMIN_PASSWORD`, secreta (variables nuevas
  `MIROTARACT_SANDBOX_PASSWORD` / `_ADMIN_PASSWORD` del seed).
- `KERNEL_WEBHOOK_STREAM_ENABLED=true`; `KERNEL_WEBHOOKS_ALLOW_INSECURE=false`
  (es público: webhooks sólo a https públicos, nunca a la red del VPS).
- Un proceso hace de API y worker; sin Redis; sin correo. ~250 MB de API +
  ~50 MB de Postgres; la web es opcional (`up --web`, ~130 MB más).
- Puertos `127.0.0.1:3011` (API) y `3010` (web), para
  `api.sandbox.rotaract4845.com` y `sandbox.rotaract4845.com`.
- **Reseteo nocturno** (`sandbox.sh reset`): guarda las tablas de
  desarrolladores (`SANDBOX_PRESERVE_TABLES`: apps, secretos, claves de
  firma, endpoints de webhook, consentimientos), restaura la **foto dorada**
  tomada tras el primer seed (ids estables), aplica migraciones nuevas y
  reinserta lo guardado. Las apps siguen andando con las mismas
  credenciales; las cuentas creadas después de la foto se pierden.
  Si E11 u otra épica agrega tablas de apps, sumarlas a
  `SANDBOX_PRESERVE_TABLES`.
- El worker de producción lo sondea cuando se define en el `.env`
  `KERNEL_STATUS_PROBE_SANDBOX_URLS=https://api.sandbox.rotaract4845.com/health/ready`
  (el hostname público: `127.0.0.1` dentro del contenedor del worker es el
  propio worker).

Prueba (proyecto `e12sbx`, API en 55931, imagen de este árbol): `up` (migra,
siembra, foto dorada, arranca) → 11/11 chequeos: login de RDR y socio con la
contraseña publicada; el superadmin **rechaza** la publicada y acepta la
suya; Distrito 9999 visible; el RDR registra una app; token
`client_credentials`; Data API (`/service/organizations/{distrito}` y
miembros de un club); clave ES256 propia; stream de webhooks activo. Se
vandalizó un club, `reset` (13 s) lo restauró, las 3 apps y la clave de
firma sobrevivieron, 11/11 de nuevo. Bajado con `down --volumes`.

## Variables nuevas

| Variable                                                                     | Dónde     | Default                         |
| ---------------------------------------------------------------------------- | --------- | ------------------------------- |
| `KERNEL_STATUS_PROBES_ENABLED`                                               | worker    | `true`                          |
| `KERNEL_STATUS_PROBE_INTERVAL_MS`                                            | worker    | `60000`                         |
| `KERNEL_STATUS_PROBE_<CLAVE>_URLS`                                           | worker    | nombres de la red de compose    |
| `KERNEL_STATUS_PROBE_TIMEOUT_MS` / `_RETRY_MS` / `KERNEL_STATUS_DEGRADED_MS` | worker    | `10000` / `2000` / `3000`       |
| `KERNEL_STATUS_RAW_RETENTION_DAYS` / `KERNEL_STATUS_HISTORY_DAYS`            | worker    | `7` / `90`                      |
| `KERNEL_STATUS_MAINTENANCE_NOTICE_HOURS` / `_MAX_HOURS`                      | api       | `24` / `72`                     |
| `PORTAL_STATUS_API_URL`                                                      | portal    | `http://api:3001/api/kernel/v1` |
| `*_HOST_PORT`                                                                | compose   | los puertos actuales            |
| `DEPLOY_*`                                                                   | deploy.sh | ver el encabezado del script    |
| `RCLONE_REMOTE`, `BACKUP_*`, `DRILL_*`                                       | backups   | ver los encabezados             |
| `SANDBOX_*`                                                                  | sandbox   | `sandbox.sh init-env`           |

## Pruebas

- Unitarias del kernel: `status-probes.spec.ts`, `uptime.spec.ts`,
  `incident-rules.spec.ts` (29 casos).
- E2E del kernel: `test/status.e2e-spec.ts` (9 casos, sondas contra destinos
  HTTP reales, validación de respuestas contra el contrato).
- Backups: `scripts/test/backup.test.mjs` (8 casos, docker/rclone falsos,
  gpg y tar reales).
- Web: `test/status-labels.test.mjs`; portal: `test/status.test.mjs`.
