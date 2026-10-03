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
- [Design System](08-design-system.md): `@equipoit4845/design-tokens`,
  `icons`, `ui` y `admin-shell` — arquitectura de paquetes, theming,
  componentes, catálogo Storybook, boundaries y publicación.
- [Contrato de UI para módulos externos](module-ui-contract.md): qué
  instala un módulo, CSS isolation, `ModuleFrame`, compatibilidad de
  versiones y reglas de PR.
- [CLI y kernel local](14-cli-and-local-kernel.md): `mirotaract init`,
  `dev`, `gen types` y `webhooks listen`; distrito sintético
  (`prisma/seed-synthetic.ts`) y compose `mirotaract-dev`. Guía para
  desarrolladores: [developers/cli.md](developers/cli.md).
- [Módulos y kit de UI](15-modules.md): manifiesto de módulos
  (`packages/module-manifest`), registro desde el manifiesto, permisos de
  módulos en cargos, instalación y configuración por club, y el registro
  shadcn (`packages/registry`). Guías:
  [developers/modulos.md](developers/modulos.md) y
  [developers/kit-de-ui.md](developers/kit-de-ui.md).
- [Portal y consola de desarrolladores](16-developer-portal.md):
  `apps/developers-portal` (guías, quickstarts probados en CI, referencia
  con "Probar"), registros de requests de las apps, changelog, política de
  deprecación y avisos por email.
- [Skills de IA, servidor MCP, llms.txt y evals](17-ai-skills.md): skills
  por tarea para Claude Code, Cursor, Copilot y AGENTS.md, `@mirotaract/mcp`,
  `dist/llms/`, evals con graders y gate de publicación. Guía para
  desarrolladores: [developers/ia.md](developers/ia.md).
- [Gobierno y protección de datos](18-data-governance.md): revisión de
  apps por el RDR con lista de control, historial de accesos de cada socio
  y quitar el acceso, límites por app (429 + `Retry-After` + `RateLimit`) y
  catálogo de apps del distrito en el panel. Guías:
  [developers/revision-de-apps.md](developers/revision-de-apps.md) y
  [developers/limites.md](developers/limites.md).
- [Validación v1 del Design System](design-system-v1-validation.md):
  veredicto por área con comandos y resultados reales — no afirmaciones sin
  evidencia.
- [Validación de la capa de consumo](kernel-api-consumption-validation.md):
  auditoría adversarial estructural de esa capa (hallazgos, fixes aplicados,
  deuda pendiente).
- [Plataforma de desarrolladores: apps e "Ingresar con Mi Rotaract"](11-developer-platform-auth.md),
  [API de datos y SDKs](12-data-api-and-sdks.md) y
  [eventos y webhooks firmados](13-events-and-webhooks.md).
- [Validación de runtime](kernel-api-runtime-validation.md): la misma capa
  ejercitada con hooks renderizados de verdad (login, reload, concurrencia
  de refresh, invalidación de permisos efectivos, aislamiento de cache entre
  usuarios, paginación, bundle de producción).

## Alcance actual

El Kernel cubre identidad, personas, organizaciones, membresías, períodos,
cargos, autorización, solicitudes, transferencias, módulos y consultas de
servicio. La Web es un consumidor separado; su capa de consumo de API está
implementada y documentada en [07-frontend-web.md](07-frontend-web.md).
Tiene un primer shell autenticado (`/dashboard`, sesión + organización +
período + navegación filtrada sobre `AdminFrame`) pero todavía ninguna
pantalla de negocio (miembros, cargos, períodos, solicitudes,
transferencias). Las capacidades de gobierno v1.2 (elecciones,
delegaciones, incompatibilidades, políticas institucionales avanzadas y
correcciones históricas) siguen fuera de este alcance.

No se deben integrar consumidores directamente a PostgreSQL: deben usar el
SDK o las rutas `/service/*`.
