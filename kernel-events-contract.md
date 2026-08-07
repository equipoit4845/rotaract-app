# Contrato de eventos de integración — Institutional Kernel v1

**Versión:** 1.1.0
**Estado:** Contrato de datos derivado de `kernel-spec.md` §11 (más §5, §6, §8)
**Ámbito:** documentación pura — no contiene implementación. Ante cualquier
conflicto con `kernel-spec.md`, este documento cede.

---

## 1. Propósito

El kernel es la única fuente de verdad para identidad, organizaciones,
membresías, períodos, cargos y autorización (`kernel-spec.md` §1). Los
servicios consumidores (Meetings, Events, Projects, etc.) no consultan sus
tablas ni comparten su esquema Prisma (decisión final #5). Este documento
especifica, evento por evento, el contrato que un consumidor puede asumir
al suscribirse al bus de integración del kernel.

---

## 2. Envelope

Todo evento de integración usa el mismo sobre, publicado vía Outbox
(`kernel-spec.md` §11.1, §11.4):

```json
{
  "specVersion": "1.0",
  "eventId": "evt_123",
  "eventType": "kernel.membership.activated.v1",
  "eventVersion": 1,
  "source": "institutional-kernel",
  "aggregateType": "membership",
  "aggregateId": "mem_123",
  "aggregateVersion": 4,
  "tenantId": "org_district_123",
  "occurredAt": "2026-07-29T15:00:00.000Z",
  "actor": {
    "type": "USER",
    "id": "per_123"
  },
  "correlationId": "cor_123",
  "causationId": "cmd_123",
  "traceId": "trc_123",
  "data": {}
}
```

### 2.1 Campos del envelope

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `specVersion` | string | sí | Versión del formato de envelope. Fija en `"1.0"` para el Kernel v1. |
| `eventId` | string | sí | Identificador único del evento. Usarlo como clave de deduplicación (§7). |
| `eventType` | string | sí | Nombre del evento, formato `kernel.<agregado>.<hecho>.v<N>` (§3). |
| `eventVersion` | integer | sí | Versión del **schema del payload** (`data`), no del envelope. Coincide con el sufijo `.vN` de `eventType`. |
| `source` | string | sí | Fijo en `"institutional-kernel"`. |
| `aggregateType` | string | sí | Tipo del agregado que originó el evento, p. ej. `membership`, `appointment`, `organization`. |
| `aggregateId` | string | sí | ID del agregado. |
| `aggregateVersion` | integer | sí | Versión del agregado tras aplicar el cambio (`AggregateVersion`, §5). Monótonamente creciente por `(aggregateType, aggregateId)`; permite ordenar y detectar eventos fuera de orden. |
| `tenantId` | string \| null | no | Organización propietaria del dato cuando aplica (normalmente el distrito raíz o la organización directamente afectada). `null` para eventos sin alcance organizacional (p. ej. cuenta antes de tener membresías). |
| `occurredAt` | string (date-time ISO 8601 UTC) | sí | Momento en que el comando se confirmó en el kernel. |
| `actor.type` | `USER` \| `SERVICE` \| `SYSTEM` | sí | Quién causó el cambio (`ActorType`, §5). |
| `actor.id` | string \| null | no | `personId` si `USER`, identificador de servicio si `SERVICE`, `null` si `SYSTEM` (job programado). |
| `correlationId` | string \| null | no | Agrupa todos los eventos y comandos de un mismo flujo de negocio de punta a punta. |
| `causationId` | string \| null | no | ID del comando (`CommandMetadata.commandId`, §8) que causó directamente este evento. |
| `traceId` | string \| null | no | Identificador de trazado distribuido (W3C Trace Context), correlaciona con `traceparent` HTTP (§9.1). |
| `data` | object | sí | Payload específico del evento. Ver §4. |

---

## 3. Convención de nombres

```text
kernel.<agregado>.<hecho>.v<N>
```

- `<agregado>` en minúsculas y singular (`account`, `person`, `organization`,
  `membership`, `period`, `appointment`, `role`, `role-assignment`,
  `membership-application`, `membership-transfer`, `module`,
  `module-installation`, `module-configuration`).
- `<hecho>` en participio o sustantivo de evento (`created`, `activated`,
  `status-changed`).
- `v<N>` es el `eventVersion`. Empieza en `v1` para todos los eventos del
  Kernel v1 (§11.2 no define ningún evento en v2 todavía).

---

## 4. Catálogo de eventos

Para cada evento: agregado disparador, condición de disparo (derivada de
las máquinas de estado §7 e invariantes §6 de `kernel-spec.md`), y schema
de `data`. Los campos de `data` nunca incluyen lo prohibido por §11.3:
password hashes, tokens, notas internas (`internalNotes`), IP, ni PII
innecesaria.

### 4.1 Identity

#### `kernel.account.registered.v1`

Disparado por: `RegisterAccount` (§8.1), tras crear `Person` + `UserAccount`
atómicamente (CA-ID-01).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `accountId` | string | sí |
| `personId` | string | sí |
| `email` | string | sí |
| `status` | `AccountStatus` | sí |
| `platformRole` | `PlatformRole` | sí |

#### `kernel.account.activated.v1`

Disparado por: `VerifyEmail` cuando la cuenta pasa `PENDING_VERIFICATION → ACTIVE` (§7.1).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `accountId` | string | sí |
| `personId` | string | sí |

#### `kernel.account.email-changed.v1`

Disparado por: `UpdateOwnAccountEmail` (§8.1).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `accountId` | string | sí |
| `personId` | string | sí |
| `newEmail` | string | sí |

> El email anterior no se incluye — no aporta valor a un consumidor y
> aumenta la superficie de PII (§14.5).

#### `kernel.account.suspended.v1`

Disparado por: `SuspendAccount`, `ACTIVE → SUSPENDED` (§7.1).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `accountId` | string | sí |
| `personId` | string | sí |
| `reasonCode` | string \| null | no |

#### `kernel.account.reactivated.v1`

Disparado por: `ReactivateAccount`, `SUSPENDED → ACTIVE` (§7.1).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `accountId` | string | sí |
| `personId` | string | sí |

#### `kernel.account.disabled.v1`

Disparado por: `DisableAccount`. Revoca todas las sesiones en la misma
transacción (invariante 6.1.7, CA-ID-06).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `accountId` | string | sí |
| `personId` | string | sí |
| `reasonCode` | string \| null | no |

#### `kernel.account.sessions-revoked.v1`

Disparado por: `RevokeSession` o `RevokeAllSessions` (§8.1).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `accountId` | string | sí |
| `sessionIds` | string[] | sí |
| `reason` | string \| null | no |

#### `kernel.account.invitation-accepted.v1`

Disparado por: `AcceptAccountInvitation`. La aceptación crea la cuenta y la
vincula a la persona invitada en la misma transacción. No expone token ni email.

| Campo | Tipo | Obligatorio |
|---|---|---|
| `invitationId` | string | sí |
| `accountId` | string | sí |
| `personId` | string | sí |
| `membershipId` | string | sí |

#### `kernel.person.created.v1`

Disparado por: `CreatePerson` (§8.2).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `personId` | string | sí |
| `firstName` | string | sí |
| `lastName` | string | sí |

#### `kernel.person.updated.v1`

Disparado por: `UpdatePerson` (§8.2).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `personId` | string | sí |
| `changedFields` | string[] | sí |

> Se publican los nombres de los campos modificados, no sus valores, salvo
> los que el consumidor necesite replicar en un snapshot propio (evaluar
> caso a caso al definir el manifiesto del módulo).

#### `kernel.person.archived.v1`

Disparado por: `ArchivePerson` (§8.2). A partir de este evento la persona no
puede recibir membresías, cargos ni roles nuevos (invariante 6.2.3).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `personId` | string | sí |

#### `kernel.person.account-linked.v1`

Disparado por: `LinkAccountToPerson` / `AcceptAccountInvitation` (§8.2).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `personId` | string | sí |
| `accountId` | string | sí |
| `membershipId` | string \| null | no |

---

### 4.2 Organization

#### `kernel.organization.created.v1`

Disparado por: `CreateOrganization` (§8.3).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `organizationId` | string | sí |
| `parentId` | string \| null | no |
| `type` | `OrganizationType` | sí |
| `code` | string | sí |
| `slug` | string | sí |
| `name` | string | sí |
| `status` | `OrganizationStatus` | sí |

#### `kernel.organization.updated.v1`

Disparado por: `UpdateOrganization` (§8.3).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `organizationId` | string | sí |
| `changedFields` | string[] | sí |

#### `kernel.organization.activated.v1`

Disparado por: `ActivateOrganization`, `DRAFT/INACTIVE → ACTIVE` (§7.2).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `organizationId` | string | sí |

#### `kernel.organization.deactivated.v1`

Disparado por: `DeactivateOrganization`, `ACTIVE → INACTIVE` (§7.2). Deja de
aceptar nuevas membresías, períodos y módulos (invariante 6.3.4).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `organizationId` | string | sí |

#### `kernel.organization.archived.v1`

Disparado por: `ArchiveOrganization` (terminal, §7.2).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `organizationId` | string | sí |

#### `kernel.organization.moved.v1`

Disparado por: `MoveOrganization` (§8.3), tras validar ausencia de ciclos
(invariante 6.3.6, CA-ORG-03).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `organizationId` | string | sí |
| `previousParentId` | string \| null | no |
| `newParentId` | string \| null | no |

---

### 4.3 Membership

#### `kernel.membership.created.v1`

Disparado por: `CreateMembership` (§8.4), estado inicial `PENDING`.

| Campo | Tipo | Obligatorio |
|---|---|---|
| `membershipId` | string | sí |
| `organizationId` | string | sí |
| `personId` | string | sí |
| `status` | `MembershipStatus` | sí |

#### `kernel.membership.activated.v1`

Disparado por: `ActivateMembership`, `PENDING → ACTIVE` (§7.3). Requiere
`joinedAt` (invariante 6.4.2).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `membershipId` | string | sí |
| `organizationId` | string | sí |
| `personId` | string | sí |
| `joinedAt` | string (date-time) | sí |

#### `kernel.membership.status-changed.v1`

Disparado por: cualquier transición de `OrganizationMembership` que no
tenga evento dedicado (`ON_LEAVE`, `resume`, `INACTIVE`, `GRADUATED`,
reactivación — §7.3). Uno por cada `MembershipTransition` creada
(invariante 6.4.4).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `membershipId` | string | sí |
| `organizationId` | string | sí |
| `personId` | string | sí |
| `transitionType` | `MembershipTransitionType` | sí |
| `fromStatus` | `MembershipStatus` \| null | no |
| `toStatus` | `MembershipStatus` | sí |
| `effectiveAt` | string (date-time) | sí |
| `reasonCode` | string \| null | no |

#### `kernel.membership.transferred.v1`

Disparado por: `CompleteMembershipTransfer` (§8.9). Único evento emitido al
completar (invariante 6.9.5, CA-TRA-05) — no se emite además
`status-changed` para esta transición.

| Campo | Tipo | Obligatorio |
|---|---|---|
| `transferId` | string | sí |
| `sourceMembershipId` | string | sí |
| `destinationMembershipId` | string | sí |
| `personId` | string | sí |
| `fromOrganizationId` | string | sí |
| `toOrganizationId` | string | sí |
| `completedAt` | string (date-time) | sí |

---

### 4.4 Period

#### `kernel.period.created.v1`

Disparado por: `CreatePeriod` (§8.5), estado inicial `DRAFT`.

| Campo | Tipo | Obligatorio |
|---|---|---|
| `periodId` | string | sí |
| `organizationId` | string | sí |
| `code` | string | sí |
| `sequence` | integer | sí |
| `startDate` | string (date) | sí |
| `endDate` | string (date) | sí |

#### `kernel.period.scheduled.v1`

Disparado por: `SchedulePeriod`, `DRAFT → SCHEDULED` (§7.4).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `periodId` | string | sí |
| `organizationId` | string | sí |

#### `kernel.period.activated.v1`

Disparado por: `ActivatePeriod`, `SCHEDULED → ACTIVE` (§7.4, CA-PER-03).
Garantizado único período `ACTIVE` por organización (invariante 6.5.2).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `periodId` | string | sí |
| `organizationId` | string | sí |
| `startDate` | string (date) | sí |
| `endDate` | string (date) | sí |

#### `kernel.period.closed.v1`

Disparado por: `ClosePeriod`, `ACTIVE → CLOSED` (§7.4). Finaliza los cargos
activos del período en la misma transacción (invariante 6.5.7, CA-PER-04):
este evento se publica junto con un `kernel.appointment.ended.v1` por cada
cargo finalizado, todos con el mismo `correlationId`.

| Campo | Tipo | Obligatorio |
|---|---|---|
| `periodId` | string | sí |
| `organizationId` | string | sí |
| `endedAppointmentIds` | string[] | sí |

#### `kernel.period.cancelled.v1`

Disparado por: `CancelPeriod`, `DRAFT/SCHEDULED → CANCELLED` (§7.4, terminal).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `periodId` | string | sí |
| `organizationId` | string | sí |

---

### 4.5 Appointment

#### `kernel.position.created.v1`

Disparado por: `CreatePositionDefinition`.

| Campo | Tipo | Obligatorio |
|---|---|---|
| `positionDefinitionId` | string | sí |
| `code` | string | sí |
| `organizationType` | `OrganizationType` | sí |
| `ownerOrganizationId` | string \| null | no |
| `editPermissionCode` | string | sí |

#### `kernel.position.updated.v1`

Disparado por: `UpdatePositionDefinition`. Señal para invalidar catálogos;
los consumidores consultan el recurso si necesitan valores actuales.

| Campo | Tipo | Obligatorio |
|---|---|---|
| `positionDefinitionId` | string | sí |
| `ownerOrganizationId` | string \| null | no |
| `changedFields` | string[] | sí |

#### `kernel.position.permissions-changed.v1`

Disparado por: `AttachPermissionToPosition` o `DetachPermissionFromPosition`.

| Campo | Tipo | Obligatorio |
|---|---|---|
| `positionDefinitionId` | string | sí |
| `defaultRoleCode` | string | sí |
| `permissionCode` | string | sí |
| `operation` | `ATTACHED` \| `DETACHED` | sí |

#### `kernel.appointment.created.v1`

Disparado por: `CreateAppointment`, estado inicial `NOMINATED` (§7.5).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `appointmentId` | string | sí |
| `organizationId` | string | sí |
| `membershipId` | string | sí |
| `membershipOrganizationId` | string | sí |
| `personId` | string | sí |
| `periodId` | string | sí |
| `positionCode` | string | sí |

#### `kernel.appointment.elected.v1`

Disparado por: `MarkAppointmentElected`, `NOMINATED → ELECTED` (§7.5).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `appointmentId` | string | sí |
| `organizationId` | string | sí |
| `membershipId` | string | sí |
| `membershipOrganizationId` | string | sí |
| `personId` | string | sí |
| `positionCode` | string | sí |

#### `kernel.appointment.activated.v1`

Disparado por: `ActivateAppointment`, `ELECTED → ACTIVE`
(§7.5). `Appointment` es la única fuente de verdad para presidencias y
autoridades (§4.5, CA-APP-03/04) — este es el evento que un módulo debe
consumir en vez de leer cualquier flag `isPresident`. Ejemplo exacto en
`kernel-spec.md` §11.3.

| Campo | Tipo | Obligatorio |
|---|---|---|
| `appointmentId` | string | sí |
| `organizationId` | string | sí |
| `membershipId` | string | sí |
| `membershipOrganizationId` | string | sí |
| `personId` | string | sí |
| `periodId` | string | sí |
| `positionCode` | string | sí |
| `startsAt` | string (date-time) \| null | no |
| `endsAt` | string (date-time) \| null | no |

```json
{
  "appointmentId": "app_123",
  "organizationId": "org_123",
  "membershipId": "mem_123",
  "membershipOrganizationId": "org_club_123",
  "personId": "per_123",
  "periodId": "prd_123",
  "positionCode": "CLUB_PRESIDENT",
  "startsAt": "2026-07-01T00:00:00.000Z",
  "endsAt": "2027-06-30T23:59:59.000Z"
}
```

Si el cargo tiene `defaultRoleCode` (§10.3), se publica además, dentro de la
misma transacción y con igual `correlationId`, un
`kernel.role-assignment.granted.v1` para la asignación técnica derivada.

#### `kernel.appointment.ended.v1`

Disparado por: `EndAppointment`, `ACTIVE → ENDED` (§7.5), o
automáticamente al cerrar el período (§4.4).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `appointmentId` | string | sí |
| `organizationId` | string | sí |
| `membershipId` | string | sí |
| `membershipOrganizationId` | string | sí |
| `personId` | string | sí |
| `positionCode` | string | sí |
| `endedAt` | string (date-time) | sí |

#### `kernel.appointment.revoked.v1`

Disparado por: `RevokeAppointment` (§8.6). Revoca la `RoleAssignment`
derivada si existía (invariante 6.6.8, CA-APP-05): se publica junto con un
`kernel.role-assignment.revoked.v1` cuando corresponde.

| Campo | Tipo | Obligatorio |
|---|---|---|
| `appointmentId` | string | sí |
| `organizationId` | string | sí |
| `membershipId` | string | sí |
| `membershipOrganizationId` | string | sí |
| `personId` | string | sí |
| `positionCode` | string | sí |
| `revokeReason` | string | sí |

---

### 4.6 Authorization

#### `kernel.role.created.v1`

Disparado por: `CreateRole` (§8.7).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `roleDefinitionId` | string | sí |
| `code` | string | sí |
| `moduleId` | string \| null | no |

#### `kernel.role.updated.v1`

Disparado por: `AttachPermissionToRole` / `DetachPermissionFromRole` (§8.7).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `roleDefinitionId` | string | sí |
| `code` | string | sí |

#### `kernel.role-assignment.granted.v1`

Disparado por: `GrantRole` (§8.7), directo o derivado de un `Appointment`
(§10.3).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `assignmentId` | string | sí |
| `personId` | string | sí |
| `roleDefinitionId` | string | sí |
| `roleCode` | string | sí |
| `effect` | `AssignmentEffect` | sí |
| `scopeType` | `ScopeType` | sí |
| `organizationId` | string \| null | no |
| `periodId` | string \| null | no |
| `sourceAppointmentId` | string \| null | no |

#### `kernel.role-assignment.revoked.v1`

Disparado por: `RevokeRole` (§8.7), directo o derivado de `RevokeAppointment`.

| Campo | Tipo | Obligatorio |
|---|---|---|
| `assignmentId` | string | sí |
| `personId` | string | sí |
| `roleDefinitionId` | string | sí |

#### `kernel.permissions.changed.v1`

Disparado por: `RegisterPermission` cuando cambia el catálogo disponible
para un namespace/módulo (§8.7). Señal de invalidación para consumidores
que cachean el catálogo completo de permisos, no un cambio por persona.

| Campo | Tipo | Obligatorio |
|---|---|---|
| `permissionCode` | string | sí |
| `namespace` | string | sí |
| `moduleId` | string \| null | no |

---

### 4.7 Applications and transfers

#### `kernel.membership-application.submitted.v1`

Disparado por: `SubmitMembershipApplication`, `DRAFT → SUBMITTED` (§7.6).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `applicationId` | string | sí |
| `organizationId` | string | sí |
| `requesterPersonId` | string | sí |

#### `kernel.membership-application.approved.v1`

Disparado por: `ApproveMembershipApplication` (§7.6). Crea o reactiva la
membresía en la misma transacción (invariante 6.8.3-4, CA-SOL-02).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `applicationId` | string | sí |
| `organizationId` | string | sí |
| `requesterPersonId` | string | sí |
| `membershipId` | string | sí |
| `reviewedById` | string | sí |

#### `kernel.membership-application.rejected.v1`

Disparado por: `RejectMembershipApplication` (§7.6). Exige motivo
(invariante 6.8.5, CA-SOL-03).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `applicationId` | string | sí |
| `organizationId` | string | sí |
| `requesterPersonId` | string | sí |
| `reviewedById` | string | sí |
| `rejectionReason` | string | sí |

#### `kernel.membership-application.cancelled.v1`

Disparado por: `CancelMembershipApplication`, sólo desde `DRAFT`/`SUBMITTED`
(invariante 6.8.6).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `applicationId` | string | sí |
| `organizationId` | string | sí |
| `requesterPersonId` | string | sí |

#### `kernel.membership-transfer.requested.v1`

Disparado por: `RequestMembershipTransfer`, estado inicial `REQUESTED`
(§7.7, CA-TRA-01/06).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `transferId` | string | sí |
| `membershipId` | string | sí |
| `personId` | string | sí |
| `fromOrganizationId` | string | sí |
| `toOrganizationId` | string | sí |

#### `kernel.membership-transfer.accepted.v1`

Disparado por: `AcceptTransferByDestination`, `REQUESTED → ACCEPTED_BY_DESTINATION` (§7.7, CA-TRA-02).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `transferId` | string | sí |
| `membershipId` | string | sí |
| `acceptedById` | string | sí |

#### `kernel.membership-transfer.confirmed.v1`

Disparado por: `ConfirmTransferByOrigin`, `ACCEPTED_BY_DESTINATION → CONFIRMED_BY_ORIGIN` (§7.7, CA-TRA-03).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `transferId` | string | sí |
| `membershipId` | string | sí |
| `confirmedById` | string | sí |

#### `kernel.membership-transfer.rejected.v1`

Disparado por: `RejectMembershipTransfer` (§7.7). Exige motivo (invariante 6.9.7).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `transferId` | string | sí |
| `membershipId` | string | sí |
| `rejectedById` | string | sí |
| `rejectionReason` | string | sí |

#### `kernel.membership-transfer.cancelled.v1`

Disparado por: `CancelMembershipTransfer` (§7.7).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `transferId` | string | sí |
| `membershipId` | string | sí |
| `cancelledById` | string | sí |

---

### 4.8 Modules

#### `kernel.module.registered.v1`

Disparado por: `RegisterModule`, sin migrar tablas del kernel (CA-MOD-01).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `moduleId` | string | sí |
| `name` | string | sí |
| `version` | string | sí |
| `contractVersion` | integer | sí |

#### `kernel.module.updated.v1`

Disparado por: `UpdateModuleManifest` (§8.10).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `moduleId` | string | sí |
| `version` | string | sí |
| `contractVersion` | integer | sí |

#### `kernel.module.deprecated.v1`

Disparado por: `DeprecateModule`. No admite instalaciones nuevas desde este
momento (invariante 6.10.3).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `moduleId` | string | sí |

#### `kernel.module-installed.v1`

Disparado por: `InstallModule`, estado inicial `PENDING` (§7.8, invariante 6.10.2).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `installationId` | string | sí |
| `moduleId` | string | sí |
| `organizationId` | string | sí |

#### `kernel.module-activated.v1`

Disparado por: `ActivateModuleInstallation`, tras validar
`configurationSchema` (invariante 6.10.4, CA-MOD-02/03).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `installationId` | string | sí |
| `moduleId` | string | sí |
| `organizationId` | string | sí |

#### `kernel.module-configuration-updated.v1`

Disparado por: `UpdateModuleConfiguration` (§8.10). No incluye el valor de
la configuración — sólo la señal de cambio; el consumidor la consulta vía
`GET /service/modules/:moduleId/installations/:organizationId` (§9.12) si
la necesita, para no duplicar en el evento datos potencialmente sensibles
definidos por el propio módulo.

| Campo | Tipo | Obligatorio |
|---|---|---|
| `installationId` | string | sí |
| `moduleId` | string | sí |
| `organizationId` | string | sí |

#### `kernel.module-suspended.v1`

Disparado por: `SuspendModuleInstallation`, `ACTIVE → SUSPENDED` (§7.8).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `installationId` | string | sí |
| `moduleId` | string | sí |
| `organizationId` | string | sí |

#### `kernel.module-disabled.v1`

Disparado por: `DisableModuleInstallation`. No elimina datos del servicio
consumidor (invariante 6.10.5, CA-MOD-04).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `installationId` | string | sí |
| `moduleId` | string | sí |
| `organizationId` | string | sí |

---

## 5. Garantías de entrega

Derivadas de §11.4 y de los criterios de aceptación de integración (§17.10):

1. **At-least-once, nunca at-most-once.** El worker de Outbox reintenta
   hasta confirmar publicación (CA-INT-06); un consumidor puede recibir el
   mismo `eventId` más de una vez.
2. **Orden garantizado sólo por agregado.** `aggregateVersion` crece
   monótonamente para un mismo `(aggregateType, aggregateId)`; no hay
   garantía de orden total entre agregados distintos, ni entre eventos de
   agregados distintos que participan del mismo flujo de negocio (usar
   `correlationId` para reconstituir la relación causal, no el orden de
   llegada).
3. **Publicación en la misma transacción que el cambio.** El comando
   modifica el agregado, incrementa `AggregateVersion` e inserta el
   `OutboxMessage` en una única transacción local (§11.4 pasos 1-3,
   CA-INT-01). Si el broker está caído, la transacción local igual se
   confirma (CA-INT-05); el mensaje queda `PENDING` y se publica cuando el
   broker se recupera (CA-INT-06).
4. **Reintento con backoff y alerta.** Tras N reintentos fallidos el
   mensaje pasa a `FAILED` y genera alerta operativa (§11.4 paso 7); no se
   descarta silenciosamente.
5. **El kernel funciona sin consumidores.** Ningún evento requiere
   confirmación (ack) de un consumidor específico para que el kernel
   avance su propio estado (CA-INT-04).
6. **SLA de publicación:** 99% de los eventos publicados en menos de 30
   segundos desde `occurredAt` (§18).

---

## 6. Versionado y compatibilidad

1. `eventType` incluye la versión del payload (`.v1`, `.v2`, ...). Un
   cambio incompatible de schema (renombrar/eliminar un campo obligatorio,
   cambiar su tipo) exige publicar `eventType` con el sufijo incrementado,
   nunca mutar el schema de una versión ya publicada (principio 8,
   "contratos versionados").
2. Agregar un campo opcional nuevo a `data` **no** incrementa la versión.
   Los consumidores deben ignorar campos desconocidos (§12.5) — es la
   forma en que el kernel evoluciona sin coordinar despliegues.
3. Ambas versiones de un evento (`vN` y `vN+1`) pueden coexistir
   publicándose en paralelo durante una ventana de transición documentada
   en el manifiesto del cambio, para dar tiempo a los consumidores a
   migrar.
4. El envelope (`specVersion`) versiona independientemente del payload; un
   cambio de envelope es un evento excepcional que afecta a todos los
   eventos a la vez y requiere coordinación explícita con todos los
   servicios consumidores.
5. Los eventos `*.updated.v1` que hoy exponen sólo `changedFields` (§4.1,
   §4.2) son deliberadamente minimalistas: si un consumidor necesita los
   valores nuevos, se define como una razón para especializar un evento
   nuevo y versionado, no para expandir el genérico.

---

## 7. Idempotencia para consumidores

1. Persistir `eventId` procesados (o `(aggregateType, aggregateId,
   aggregateVersion)`) y descartar duplicados antes de aplicar efectos —
   requisito de §12.5 ("procesar eventos idempotentemente").
2. No asumir que `occurredAt` es estrictamente creciente entre entregas
   consecutivas de un mismo tópico; usar `aggregateVersion` para resolver
   qué versión del agregado es más reciente cuando el consumidor mantiene
   una réplica local (p. ej. `MembershipSnapshot`, §12.3).
3. Si el consumidor deriva estado propio de un evento (por ejemplo,
   Meetings decide quórum a partir de `kernel.membership.activated.v1`),
   la operación de aplicar el evento debe ser un upsert por clave de
   negocio, no un insert ciego.
4. Ante un evento fuera de orden (`aggregateVersion` menor al último
   aplicado para ese agregado), descartarlo: ya fue superado por un evento
   posterior.
5. Los eventos derivados que se publican juntos (p. ej.
   `appointment.activated` + `role-assignment.granted`, o
   `period.closed` + `appointment.ended` por cada cargo) comparten
   `correlationId`; un consumidor que necesita atomicidad de negocio entre
   ambos debe agruparlos por `correlationId`, no asumir que llegan
   consecutivos ni en la misma entrega de lote.
6. Para operaciones sensibles (autorización de una acción irreversible), no
   basarse únicamente en el último evento recibido: usar autorización
   síncrona (`POST /service/authorization/check`, §9.12) o un snapshot
   sellado (§12.5), ya que el evento puede llegar tarde respecto al estado
   real del kernel.
