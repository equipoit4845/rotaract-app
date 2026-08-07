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

| Variable                                    | Uso                                              |
| ------------------------------------------- | ------------------------------------------------ |
| `KERNEL_DATABASE_URL` / `KERNEL_DIRECT_URL` | PostgreSQL del Kernel                            |
| `REDIS_URL`                                 | cache y rate limiting distribuido                |
| `NATS_URL`                                  | NATS JetStream para Outbox                       |
| `JWT_SECRET`                                | firma/verificación de JWT                        |
| `KERNEL_SERVICE_API_KEY`                    | compatibilidad de servicio sólo en desarrollo    |
| `KERNEL_JOBS_ENABLED`                       | habilita jobs en el proceso actual               |
| `KERNEL_NATS_STREAM`                        | stream JetStream, por defecto `KERNEL_EVENTS`    |
| `KERNEL_NATS_SUBJECT_PREFIX`                | prefijo de subjects, por defecto `kernel.events` |
| `KERNEL_OPENAPI_RUNTIME_VALIDATION`         | valida requests contra OpenAPI en runtime        |
| `KERNEL_OPENAPI_RESPONSE_VALIDATION`        | valida respuestas JSON contra OpenAPI            |
| `KERNEL_OPENAPI_PATH`                       | ruta explícita de `kernel-openapi.yaml`          |
| `CLICKMAIL_*`                               | adaptador de email opcional                      |

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

## Despliegue fuera de local

El repositorio contiene Dockerfiles y Compose, pero no definición de staging o
producción, registry, dominio/TLS ni infraestructura como código. Antes de un
despliegue externo deben proveerse esos recursos, secretos seguros, estrategia
de backups y una credencial de servicio para pruebas del SDK.
