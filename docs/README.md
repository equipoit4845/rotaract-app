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

## Alcance actual

El Kernel cubre identidad, personas, organizaciones, membresías, períodos,
cargos, autorización, solicitudes, transferencias, módulos y consultas de
servicio. La Web es un consumidor separado. Las capacidades de gobierno v1.2
(elecciones, delegaciones, incompatibilidades, políticas institucionales
avanzadas y correcciones históricas) siguen fuera de este alcance.

No se deben integrar consumidores directamente a PostgreSQL: deben usar el
SDK o las rutas `/service/*`.
