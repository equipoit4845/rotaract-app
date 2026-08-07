# Dominio y modelo de datos

El schema operativo está en [`prisma/schema.prisma`](../prisma/schema.prisma).
Las tablas principales se agrupan por agregado.

## Identidad y persona

- `Person`: identidad institucional; puede existir sin cuenta.
- `UserAccount`: email normalizado único, estado, rol de plataforma y hash de
  contraseña.
- `AccountSession`, `PasswordResetToken`, `EmailVerificationToken` y
  `AccountInvitation`: sesiones y credenciales de corta o larga duración.

Las contraseñas nuevas usan Argon2id. Durante la migración legacy se aceptan
temporalmente hashes bcrypt; tras un login correcto se reemplazan por Argon2id.

Estados de cuenta: `PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED`, `DISABLED`.

## Organizaciones y membresías

- `Organization`: `DISTRICT`, `CLUB` u `OTHER`, con relación padre/hijos.
- `OrganizationMembership`: vincula una persona con una organización.
- `MembershipTransition`: historial inmutable de cada cambio de membresía.

Estados de membresía: `PENDING`, `ACTIVE`, `ON_LEAVE`, `INACTIVE`,
`GRADUATED`, `TRANSFERRED`.

La relación `(organizationId, personId)` es única. La jerarquía no puede tener
ciclos. Un club puede ser hijo de un distrito; el seed institucional actual usa
`Distrito 4845` como padre de los clubes importados.

## Períodos y cargos

- `InstitutionalPeriod`: período de una organización. El modelo rotario usa
  1 de julio a 30 de junio.
- `PositionDefinition`: catálogo de cargos de club o distrito, con permiso de
  edición, rol por defecto y marca de singleton por período.
- `Appointment`: nombramiento de una membresía a un cargo dentro de período y
  organización.

Estados de período: `DRAFT`, `SCHEDULED`, `ACTIVE`, `CLOSED`, `CANCELLED`.

Estados de nombramiento: `NOMINATED`, `ELECTED`, `ACTIVE`, `ENDED`, `REVOKED`.

Un cargo de club exige membresía activa en ese club. Un cargo distrital exige
membresía activa en un club descendiente del distrito. Una persona puede tener
un cargo de club y otro distrital simultáneamente. Los cargos singleton se
protegen por organización, período y definición de cargo.

## Autorización

- `PermissionDefinition`, `RoleDefinition` y `RolePermission` forman el
  catálogo.
- `RoleAssignment` asigna roles con efecto `ALLOW` o `DENY`, vigencia y alcance
  `PLATFORM`, `ORGANIZATION` u `ORGANIZATION_TREE`.
- Los roles derivados de un cargo tienen `sourceAppointmentId`; se revocan al
  finalizar o revocar el nombramiento, sin afectar roles manuales.

La decisión tiene en cuenta vigencia, período, jerarquía, especificidad y
prioridad de `DENY`. `SUPERADMIN` es un bypass de plataforma auditado.

## Flujos institucionales adicionales

- `MembershipApplication`: solicitud de ingreso y su revisión.
- `MembershipTransfer`: transferencia entre organizaciones.
- `ModuleDefinition` y `ModuleInstallation`: catálogo, manifest,
  configuración e instalación de módulos.
- `AggregateVersion`, `KernelAuditLog`, `IdempotencyKey` y `OutboxMessage`:
  consistencia y trazabilidad transversal.

## Datos importados actualmente

El seed explícito de datos legacy cargó una organización distrital `4845`, 28
clubes hijos, 106 cuentas legacy y 88 relaciones de membresía. Se creó una
membresía adicional para la presidenta actual de Minga Guazú, alcanzando 89
membresías. Los 28 presidentes actuales quedaron como nombramientos
`CLUB_PRESIDENT` activos para 2026–2027.

Los cargos legacy guardados en la tabla `Membership` no se convirtieron
automáticamente durante esa importación: se conservan como metadata. Sólo los
28 presidentes listados explícitamente generaron nombramientos y roles
derivados.
