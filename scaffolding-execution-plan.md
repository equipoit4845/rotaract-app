# Plan de ejecución — Scaffolding del monorepo

## Objetivo

Crear la base técnica para Institutional Kernel sin implementar todavía los
casos de uso. El resultado es un monorepo TypeScript con API y web como
aplicaciones independientes, contratos compartidos y un `docker-compose.yml`
en la raíz para levantar el entorno completo de desarrollo.

## Decisiones base

| Área | Decisión |
|---|---|
| Monorepo | `pnpm` workspaces + Turborepo. |
| API | NestJS, Prisma y PostgreSQL. |
| Web | Next.js (App Router), TypeScript y cliente HTTP del SDK. |
| Eventos | NATS JetStream como broker durable; abstraído detrás de un puerto Outbox. |
| Caché / locks | Redis, nunca fuente de verdad. |
| Contenedores | API y Web con Dockerfiles independientes; Compose sólo orquesta. |
| Contratos | OpenAPI/AsyncAPI y schemas en `packages/kernel-contracts`; SDK generado/implementado en paquete separado. |

## Estructura objetivo

```text
rotaract-app/
  apps/
    institutional-kernel-api/      # NestJS; puerto 3001 interno
    mirotaract-web/                # Next.js; puerto 3000
  packages/
    kernel-contracts/              # OpenAPI, schemas, tipos compartidos
    kernel-sdk/                    # cliente tipado para consumidores
    auth-middleware/               # JWT de usuario y servicio
    eslint-config/
    tsconfig/
  infra/
    docker/
      api.Dockerfile
      web.Dockerfile
  prisma/
    schema.prisma
    migrations/
  scripts/
  docker-compose.yml               # fuera de apps; punto de entrada local
  docker-compose.override.yml      # opcional, sólo desarrollo
  pnpm-workspace.yaml
  turbo.json
  package.json
  .env.example
  README.md
```

`apps/` no comparte código de dominio entre API y Web. Sólo se comparten
contratos, SDK, configuración y middleware mediante `packages/`.

## Servicios de Docker Compose

| Servicio | Puerto host | Responsabilidad | Dependencias |
|---|---:|---|---|
| `web` | 3000 | Next.js | `api` | 
| `api` | 3001 | NestJS / Kernel | `postgres`, `redis`, `nats` |
| `postgres` | 5432 | Fuente de verdad | volumen persistente |
| `redis` | 6379 | caché, rate limit, locks | volumen opcional |
| `nats` | 4222 / 8222 | JetStream y monitoreo | volumen persistente |

Cada servicio tendrá `healthcheck`. `api` esperará salud de PostgreSQL y NATS
en readiness, pero una caída posterior de Redis o broker no impedirá leer o
confirmar transacciones locales; el Outbox queda pendiente hasta recuperación.

## Fases de ejecución

### Fase 0 — Preparación y reglas

1. Inicializar `pnpm`, workspaces y Turborepo.
2. Definir Node LTS, `corepack`, `.nvmrc`, EditorConfig, Prettier, ESLint y
   TypeScript estricto.
3. Crear `.env.example` sin secretos y separar variables de host de variables
   usadas dentro de Compose.
4. Mover los contratos existentes a `packages/kernel-contracts/docs/` sin
   modificar su contenido normativo; dejar referencias estables desde raíz.

**Salida:** `pnpm install`, `pnpm lint` y `pnpm typecheck` ejecutan aunque no
haya funcionalidad de negocio.

### Fase 1 — Aplicaciones vacías y límites

1. Crear `institutional-kernel-api` NestJS con módulos vacíos:
   `identity`, `persons`, `organizations`, `memberships`, `periods`,
   `appointments`, `authorization`, `outbox`, `policies` y `governance`.
2. Aplicar estructura `interfaces → application → domain ← infrastructure`
   desde el inicio; no exponer Prisma fuera de infraestructura.
3. Crear `mirotaract-web` con layout, health page y cliente del SDK, sin
   importar código interno de API.
4. Agregar endpoints API mínimos: `/health/live`, `/health/ready` y
   `/api/kernel/v1/version`.

**Salida:** web y API compilan y se ejecutan de forma independiente.

### Fase 2 — Infraestructura local reproducible

1. Crear los Dockerfiles multi-stage de API y Web en `infra/docker/`.
2. Crear `docker-compose.yml` raíz con red privada, volúmenes nombrados,
   servicios, healthchecks y perfiles opcionales (`observability`, `tools`).
3. Configurar PostgreSQL con dos URLs: conexión pool para runtime y conexión
   directa para Prisma migrations.
4. Habilitar JetStream y volumen para NATS; no usar Redis Pub/Sub.
5. Documentar comandos únicos:

```bash
docker compose up --build
docker compose down
pnpm dev
pnpm db:migrate
pnpm test
```

**Salida:** `docker compose up --build` deja `web`, `api`, `postgres`,
`redis` y `nats` saludables, sin pasos manuales.

### Fase 3 — Base de plataforma

1. Incorporar el esquema Prisma normativo y primera migración SQL para
   restricciones no expresables por Prisma.
2. Crear contexto de comando, IDs opacos, reloj inyectable, Problem Details,
   correlación (`traceparent`, `X-Correlation-Id`) y auditoría base.
3. Implementar Outbox, `AggregateVersion`, worker NATS y contratos de
   publicación sin consumidores.
4. Agregar Redis como adaptador opcional y locks distribuidos; validar que la
   API continúe operativa si Redis no está disponible.

**Salida:** una operación de prueba confirma entidad + audit + Outbox en una
transacción y publica de manera reintentable.

### Fase 4 — Contratos y SDK

1. Ubicar `kernel-openapi.yaml` en `packages/kernel-contracts/openapi/` y
   agregar validación OpenAPI 3.1 en CI.
2. Crear el contrato AsyncAPI del Outbox/NATS desde
   `kernel-events-contract.md`.
3. Generar o implementar `@mirotaract/kernel-sdk` contra `/service/*`.
4. Añadir pruebas de contrato API, eventos, idempotencia y compatibilidad.

**Salida:** Web usa exclusivamente SDK/HTTP; ningún paquete consumidor importa
Prisma, entidades de dominio ni repositorios del Kernel.

### Fase 5 — Primer corte vertical institucional

1. Implementar organizaciones, períodos rotarios, membresías y cargos.
2. Agregar políticas, catálogo distrital de cargos y autorización contextual
   mínima para RDR/club.
3. Incluir una pantalla web administrativa mínima para salud, sesión y
   listado de organizaciones; no implementar Meetings ni Events.
4. Ejecutar seeds reproducibles: plataforma, distrito de prueba, club,
   período 1 de julio–30 de junio, roles y posiciones base.

**Salida:** se puede crear un distrito/club, administrar un período, designar
una autoridad de club o distrito y observar sus eventos.

## Orden de commits recomendado

1. `chore: initialize pnpm turborepo workspace`
2. `feat: scaffold api and web applications`
3. `chore: add docker compose development stack`
4. `feat: add kernel platform foundation`
5. `feat: add contracts sdk and contract tests`
6. `feat: add institutional vertical slice`

## Criterios de aceptación del scaffolding

- `docker compose up --build` expone Web en `:3000` y API en `:3001`.
- API y Web tienen builds, tests y Dockerfiles separados.
- PostgreSQL, Redis y NATS son sustituibles mediante variables de entorno.
- API no depende de Web para arrancar; Web no accede a PostgreSQL.
- Las rutas `/health/live` y `/health/ready` reflejan correctamente el estado.
- Migraciones y seeds son reproducibles desde un checkout vacío.
- El pipeline valida lint, tipos, tests, OpenAPI y compatibilidad de eventos.
