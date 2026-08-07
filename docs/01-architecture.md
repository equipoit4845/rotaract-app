# Arquitectura

## Componentes

El monorepo contiene los siguientes componentes principales:

| Componente   | Ubicación                       | Responsabilidad                           |
| ------------ | ------------------------------- | ----------------------------------------- |
| API Kernel   | `apps/institutional-kernel-api` | Dominio institucional y API NestJS        |
| Web          | `apps/mirotaract-web`           | Consumidor HTTP del Kernel                |
| SDK          | `packages/kernel-sdk`           | Cliente tipado para consumidores internos |
| Contratos    | `packages/kernel-contracts`     | Shapes TypeScript compartidos             |
| Persistencia | `prisma/schema.prisma`          | Modelo PostgreSQL y migraciones           |

La API usa el prefijo `/api/kernel/v1`. Las rutas de health quedan fuera del
prefijo: `/health/live` y `/health/ready`.

## Capas

La implementación está organizada conceptualmente como:

```text
HTTP controllers / guards
        ↓
Application services and command executor
        ↓
Domain invariants and state machines
        ↓
Prisma, PostgreSQL, Redis, NATS and external adapters
```

- `interfaces/http`: controllers, Problem Details, guard global y creación de
  `CommandContext` desde HTTP.
- `application`: autenticación, autorización, KernelService, Outbox,
  auditoría, jobs y comandos transaccionales.
- `domain`: máquinas de estado, invariantes, errores y contexto de comando.
- `infrastructure`: Prisma, cache Redis, publisher JetStream y health checks.

`KernelService` centraliza los casos de uso institucionales; los controllers
actúan como adaptadores HTTP y no realizan escrituras de dominio por sí mismos.

## Comandos mutantes

Cada mutación institucional se ejecuta con `CommandContext`, que transporta
actor, correlación, causación, traza, operación e idempotencia. El executor
transaccional registra, según el comando:

1. cambio del agregado;
2. versión del agregado;
3. auditoría;
4. mensaje Outbox;
5. resultado idempotente reutilizable.

La clave de idempotencia se vincula a operación y alcance del actor. Repetir
la misma solicitud devuelve el resultado almacenado; reutilizar una clave con
payload distinto se considera conflicto.

## Integración asíncrona

Los eventos se escriben en `OutboxMessage` dentro de la transacción de negocio.
El worker publica los pendientes a NATS JetStream con `Msg-Id` igual al ID del
mensaje, lo que hace idempotente la publicación del productor. Ante fallo,
incrementa intentos y programa backoff exponencial.

```text
Comando → PostgreSQL (agregado + audit + outbox) → Worker → NATS JetStream
```

PostgreSQL es la fuente de verdad. Redis sólo es una optimización; la API debe
seguir respondiendo correctamente cuando Redis no está disponible.

## Procesos

- `api`: expone HTTP y tiene jobs deshabilitados en Compose.
- `worker`: inicializa Nest sin abrir puerto HTTP y ejecuta jobs/Outbox.
- `postgres`, `redis`, `nats`: dependencias reemplazables por variables de
  entorno.
- `web`: aplicación Next.js separada de la API y de PostgreSQL.
