# Documentación del Institutional Kernel

Este directorio describe el estado implementado del Kernel institucional. La
fuente normativa sigue siendo [`kernel-spec.md`](../kernel-spec.md); los
contratos públicos son [`kernel-openapi.yaml`](../kernel-openapi.yaml),
[`kernel-events-contract.md`](../kernel-events-contract.md) y
[`kernel-sdk-contract.md`](../kernel-sdk-contract.md).

## Índice

- [Arquitectura](01-architecture.md): componentes, capas y flujos técnicos.
- [Dominio y datos](02-domain-and-data.md): entidades, estados e invariantes.
- [API y SDK](03-api-and-sdk.md): prefijo HTTP, autenticación y cliente SDK.
- [Operación y despliegue](04-operations-and-deployment.md): Compose,
  variables, health checks, Outbox y jobs.
- [Importaciones y seeds](05-import-and-seeding.md): seed base, importación
  legacy y presidentes actuales.
- [Verificación y límites conocidos](06-verification-and-known-gaps.md): qué
  está comprobado y qué debe cerrarse antes de producción.
- [Frontend Web](07-frontend-web.md): capa de consumo de la API en
  `apps/mirotaract-web` — arquitectura, autenticación, dominios y testing.
- [Validación de la capa de consumo](kernel-api-consumption-validation.md):
  auditoría adversarial estructural de esa capa (hallazgos, fixes aplicados,
  deuda pendiente).
- [Validación de runtime](kernel-api-runtime-validation.md): la misma capa
  ejercitada con hooks renderizados de verdad (login, reload, concurrencia
  de refresh, invalidación de permisos efectivos, aislamiento de cache entre
  usuarios, paginación, bundle de producción).

## Alcance actual

El Kernel cubre identidad, personas, organizaciones, membresías, períodos,
cargos, autorización, solicitudes, transferencias, módulos y consultas de
servicio. La Web es un consumidor separado; su capa de consumo de API está
implementada y documentada en [07-frontend-web.md](07-frontend-web.md), pero
todavía no tiene pantallas de negocio. Las capacidades de gobierno v1.2
(elecciones, delegaciones, incompatibilidades, políticas institucionales
avanzadas y correcciones históricas) siguen fuera de este alcance.

No se deben integrar consumidores directamente a PostgreSQL: deben usar el
SDK o las rutas `/service/*`.
