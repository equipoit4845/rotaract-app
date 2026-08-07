# Plan de contrato OpenAPI — Institutional Kernel v1.1

## Decisión de gobierno

`kernel-spec.md` es la norma de dominio. `kernel-openapi.yaml` es el contrato
HTTP ejecutable que se deriva de ella. Ningún endpoint, payload o estado se
considera disponible hasta estar presente en ambos documentos. Los contratos
de SDK y eventos sólo pueden añadir explicaciones, nunca semántica nueva.

## Línea base v1.1

La versión `1.1.0` consolida cambios aditivos y correcciones antes de que
existan consumidores externos:

- activación de cargos exclusivamente `ELECTED -> ACTIVE`;
- un único hecho de completado de transferencia:
  `kernel.membership.transferred.v1`;
- aceptación pública de invitación mediante
  `POST /auth/invitations/accept`;
- `sourceAppointmentId` visible en asignaciones de rol derivadas;
- cargos DISTRICT habilitados por membresía activa de un club descendiente,
  expuesta como `membershipOrganizationId` en autoridades y eventos;
- eliminación de `activeOrganizationId` de `UserContext`;
- idempotencia definida por `(operationId, actorScope, Idempotency-Key)`.

## Reglas de compatibilidad

| Cambio | Tratamiento |
|---|---|
| Añadir campo opcional o endpoint | Menor (`v1.x`). |
| Añadir valor de enum | Menor, sólo si los clientes deben tolerar valores desconocidos. |
| Cambiar/eliminar campo requerido, ruta, semántica o transición | Nueva API mayor (`/v2`) y período de coexistencia. |
| Cambiar payload de evento de forma incompatible | Nuevo `eventType` con `.v2`; nunca se reescribe `.v1`. |
| Corregir una contradicción antes de publicar | Se consolida en `v1.1` sin capa de compatibilidad. |

## Convención obligatoria por operación

Cada operación OpenAPI debe declarar: `operationId` estable, seguridad,
`x-required-permission`, códigos Problem Details y si requiere
`Idempotency-Key`. Todos los POST de comando llevan
`x-idempotency-required: true`; las excepciones públicas de Auth lo declaran
en `x-idempotency-required: false` y explican su protección alternativa.

Los endpoints de lectura sólo aceptan parámetros explícitos y paginación por
cursor. Los de servicio usan exclusivamente `serviceAuth`; las decisiones de
autorización devuelven `200` con `allowed: false`, no `403` por decisión de
negocio.

## Secuencia de publicación

1. Validar `kernel-openapi.yaml` contra OpenAPI 3.1 y generar tipos del SDK.
2. Generar tests de contrato para cada `operationId`, error y schema de
   eventos.
3. Publicar la especificación y changelog de `v1.1` antes de desplegar.
4. Hacer que el gateway y los consumidores toleren campos desconocidos.
5. Bloquear cambios incompatibles mediante diff de OpenAPI/AsyncAPI en CI.
6. Para una futura `v2`, servir ambos prefijos durante una ventana anunciada,
   medir tráfico por versión y retirar v1 sólo al llegar a cero consumidores.

Las extensiones de gobierno institucional están definidas en
`institutional-governance-spec.md`. Se publicarán como agregados y contratos
versionados propios; no se agregarán como campos ad hoc a Meetings u otros
consumidores.

## Criterios de salida

- Todo POST de comando prueba replay idempotente y conflicto por body distinto.
- Se prueban carreras para período activo y cargo singleton.
- Cada transición de estado tiene endpoint, job si aplica, evento y test.
- Ningún contrato SDK contiene campos sin almacenamiento o cálculo definido.
- El catálogo de eventos tiene exactamente un evento canónico por hecho de
  negocio, salvo que la especificación declare expresamente efectos derivados.
