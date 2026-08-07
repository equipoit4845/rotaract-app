# Mi Rotaract — Institutional Kernel

Monorepo del núcleo institucional de Mi Rotaract. Centraliza identidad,
personas, distrito, clubes, membresías, períodos rotarios, cargos,
autorización y contratos de integración para los módulos consumidores.

## Componentes

| Componente           | Ubicación                       | Puerto local |
| -------------------- | ------------------------------- | -----------: |
| API NestJS           | `apps/institutional-kernel-api` |         3001 |
| Web Next.js          | `apps/mirotaract-web`           |         3000 |
| SDK                  | `packages/kernel-sdk`           |            — |
| Contratos TypeScript | `packages/kernel-contracts`     |            — |
| PostgreSQL           | Compose                         |         5432 |
| Redis                | Compose                         |         6379 |
| NATS JetStream       | Compose                         |  4222 / 8222 |

La API se publica bajo `http://localhost:3001/api/kernel/v1`. Las rutas de
salud son `http://localhost:3001/health/live` y
`http://localhost:3001/health/ready`.

## Capacidades implementadas

- Cuentas, sesiones JWT, refresh token, recuperación e invitaciones.
- Personas, organizaciones y jerarquía distrito → clubes.
- Membresías e historial de transiciones.
- Períodos rotarios, cargos de club/distrito y nombramientos.
- Roles, permisos, decisiones contextuales `ALLOW`/`DENY` y roles derivados.
- Solicitudes de membresía, transferencias, módulos y Service API.
- Auditoría, versiones de agregado, idempotencia, Outbox, NATS, Redis y jobs.
- Seeds base, importación legacy y asignación de presidentes actuales.

El contrato normativo está en [`kernel-spec.md`](kernel-spec.md). Las rutas y
payloads públicos están en [`kernel-openapi.yaml`](kernel-openapi.yaml).

## Inicio rápido

Requisitos: Docker, Docker Compose, Node.js 24 y Corepack.

```bash
corepack enable
corepack prepare pnpm@10.13.1 --activate
pnpm install
cp .env.example .env
docker compose up --build
```

Comprobaciones básicas:

```bash
curl http://localhost:3001/health/live
curl http://localhost:3001/health/ready
curl http://localhost:3001/api/kernel/v1/version
```

## Comandos habituales

```bash
# Generación, migraciones y seed de catálogos institucionales
pnpm db:generate
pnpm db:deploy
pnpm db:seed

# Calidad y contratos
pnpm lint
pnpm typecheck
pnpm test
pnpm contracts:validate
pnpm build
```

`db:deploy` y `db:seed` pueden ejecutarse desde el host con las URLs de
`.env`, o dentro de Compose con:

```bash
docker compose --profile tools run --rm migrate
```

## Seguridad e integración

- Las rutas institucionales requieren JWT de usuario y autorización
  contextual.
- Las mutaciones requieren `Idempotency-Key` cuando la operación contractual
  lo declara.
- `/service/*` requiere un token de servicio con audiencia
  `institutional-kernel`; `KERNEL_SERVICE_API_KEY` sólo es una opción de
  desarrollo.
- PostgreSQL es la fuente de verdad. Redis es caché opcional y NATS JetStream
  transporta eventos durables desde Outbox.
- Los consumidores no deben acceder a PostgreSQL del Kernel; deben usar el SDK
  o `/service/*`.

## Datos institucionales cargados

La importación actual creó `Distrito 4845`, 28 clubes hijos, 106 cuentas
legacy y 89 membresías. Para el período 2026–2027 se cargaron 28
nombramientos `CLUB_PRESIDENT` y sus roles derivados.

Los hashes legacy bcrypt se conservan y se reemplazan por Argon2id después del
primer inicio de sesión exitoso.

### Importación legacy

Primero se debe validar sin escribir en la base:

```bash
LEGACY_IMPORT_DUMP_PATH=/ruta/mi_rotaract.sql pnpm db:seed:legacy:dry-run
```

La escritura necesita una confirmación explícita:

```bash
LEGACY_IMPORT_DUMP_PATH=/ruta/mi_rotaract.sql \
LEGACY_IMPORT_CONFIRM=IMPORT_LEGACY_USERS_AND_CLUBS \
pnpm db:seed:legacy
```

### Presidentes actuales

```bash
pnpm db:seed:current-presidents:dry-run

CURRENT_PRESIDENTS_CONFIRM=IMPORT_CURRENT_CLUB_PRESIDENTS \
pnpm db:seed:current-presidents
```

## Documentación

La documentación detallada se encuentra en [docs/README.md](docs/README.md):

- [Arquitectura](docs/01-architecture.md)
- [Dominio y datos](docs/02-domain-and-data.md)
- [API y SDK](docs/03-api-and-sdk.md)
- [Operación y despliegue](docs/04-operations-and-deployment.md)
- [Seeds e importaciones](docs/05-import-and-seeding.md)
- [Verificación y límites conocidos](docs/06-verification-and-known-gaps.md)

## Estado antes de producción

El entorno local Compose, el build/typecheck global del SDK y las pruebas live
de Redis, NATS JetStream, Outbox y SDK están operativos. Antes de un despliegue
externo quedan los puntos de operación de la documentación de verificación:
pruebas de concurrencia, staging/producción, secretos, TLS, backups, métricas y
alertas.
