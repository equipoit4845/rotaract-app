# Verificación y límites conocidos

## Controles ejecutados

- OpenAPI válido y 117 adaptadores HTTP detectados.
- Contrato de eventos: 52 tipos reconocidos por el validador.
- Workspace: lint, typecheck, build y pruebas unitarias globales correctos;
  SDK y contratos se construyen como artefactos distribuibles.
- Pruebas live: Redis (incluido fallback), Outbox → NATS JetStream y SDK ESM
  contra API real con JWT de servicio.
- Validación OpenAPI de requests en toda la suite E2E y prueba dedicada de
  response validation estricta.
- Compose: API, worker, PostgreSQL, Redis, NATS y Web pueden arrancar de
  manera separada.
- Importación legacy validada y aplicada con conteos de organizaciones,
  cuentas, membresías, períodos y presidentes verificados directamente en
  PostgreSQL.

## Pendientes para considerar producción

Estos puntos no deben interpretarse como funcionalidad finalizada:

1. Faltan pruebas de concurrencia sobre períodos activos, cargos singleton,
   transferencias e idempotencia bajo PostgreSQL real.
2. La autorización aún debe terminar de desacoplar lecturas Prisma de la capa
   HTTP y comprobar aislamiento de recurso en todas las operaciones.
3. El adaptador de notificaciones usa ClickMail de forma opcional; el diseño
   objetivo de Kernel es publicar solicitudes de notificación por Outbox y no
   depender de SMTP/HTTP directo.
4. Falta configuración de despliegue real: CI/CD de artefactos, staging,
   secretos, TLS, backups, métricas y alertas.

## Comandos de validación

```bash
pnpm contracts:validate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:live
pnpm test:contract
```

`pnpm test:live` requiere `docker compose up -d postgres redis nats` y prueba
infraestructura real con datos efímeros autolimpiables. Para staging se
recomienda habilitar ambas variables `KERNEL_OPENAPI_*_VALIDATION`.
