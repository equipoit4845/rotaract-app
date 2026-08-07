# Especificación técnica — Institutional Kernel v1

## Plataforma modular para Mi Rotaract

**Versión:** 1.1.0  
**Estado:** Especificación para implementación  
**Fecha:** 29 de julio de 2026  
**Stack objetivo:** NestJS, Prisma, PostgreSQL, Redis y broker de eventos durable

**Gobierno institucional:** `institutional-governance-spec.md` complementa
esta especificación para políticas, delegaciones, incompatibilidades,
elecciones, privacidad y correcciones históricas. Es normativa en esas áreas.

---

## 1. Propósito

Institutional Kernel es el núcleo independiente de la plataforma. Su responsabilidad es responder, con una única fuente de verdad:

- quién puede autenticarse;
- quién es la persona vinculada a una cuenta;
- qué organizaciones existen y cómo se relacionan;
- quién pertenece o perteneció a cada organización;
- qué períodos institucionales existen;
- qué cargos y autoridades están vigentes;
- qué permisos efectivos tiene una cuenta dentro de un alcance;
- qué módulos están habilitados para cada organización;
- cómo se solicitan, aprueban y transfieren membresías.

El kernel debe funcionar y poder desplegarse sin Meetings, Events, Projects ni ningún otro servicio consumidor.

### 1.1 Responsabilidades incluidas

- Cuentas, credenciales, sesiones y recuperación de acceso.
- Personas y datos personales institucionales básicos.
- Organizaciones jerárquicas.
- Membresías e historial institucional.
- Períodos.
- Cargos y autoridades.
- Roles, permisos y asignaciones contextuales.
- Solicitudes de ingreso.
- Transferencias entre organizaciones.
- Invitaciones para vincular cuentas.
- Catálogo e instalación de módulos.
- Decisiones de autorización.
- Eventos de integración mediante Outbox.
- Idempotencia de comandos externos.
- Auditoría propia del kernel.
- Políticas institucionales versionadas, delegaciones, incompatibilidades,
  capacidades de cargo y correcciones históricas, según
  `institutional-governance-spec.md`.

### 1.2 Responsabilidades excluidas

- Reuniones, agenda, asistencia y quórum.
- Mociones, votaciones, cartas poder y actas.
- Eventos, inscripciones, pagos y check-in.
- Proyectos e informes.
- Comités.
- Oportunidades y perfiles profesionales.
- Notificaciones in-app.
- Envío de email o WhatsApp.
- Archivos y almacenamiento.
- Dashboards y analítica.

El kernel puede emitir hechos para que otros servicios ejecuten esas capacidades, pero no las implementa.

---

## 2. Principios

1. **Fuente única:** un dato institucional tiene un solo propietario.
2. **Sin dependencias inversas:** el kernel no importa contratos de servicios consumidores.
3. **IDs opacos:** ningún consumidor depende de claves naturales.
4. **Autorización contextual:** permiso + alcance + vigencia, no un rol global ambiguo.
5. **Historial antes que borrado:** membresías, autoridades y períodos no se eliminan físicamente si fueron utilizados.
6. **Consistencia fuerte local:** cambios relacionados dentro del kernel se confirman en una única transacción.
7. **Eventos confiables:** cada cambio relevante se publica mediante Outbox.
8. **Contratos versionados:** APIs y eventos evolucionan sin romper consumidores.
9. **Denegación por defecto:** la ausencia de una concesión válida implica acceso denegado.
10. **Extensibilidad declarativa:** módulos nuevos registran permisos, eventos y configuración sin alterar enums o tablas centrales.

---

## 3. Lenguaje del dominio

| Término | Definición |
|---|---|
| Cuenta | Credencial con la que una persona accede a la plataforma |
| Persona | Individuo real, exista o no una cuenta |
| Organización | Distrito, club u otra unidad institucional |
| Membresía | Relación histórica entre una persona y una organización |
| Período | Intervalo formal de gestión de una organización |
| Cargo | Función institucional ocupada por un miembro |
| Rol | Agrupación técnica de permisos |
| Permiso | Capacidad atómica, por ejemplo `meetings.vote.cast` |
| Alcance | Recurso organizacional sobre el que se aplica una autorización |
| Autoridad | Miembro con un cargo institucional vigente |
| Módulo | Capacidad externa instalable, por ejemplo Meetings |
| Instalación | Habilitación y configuración de un módulo en un alcance |

---

## 4. Agregados

### 4.1 Account

Raíz: `UserAccount`.

Incluye:

- credencial;
- verificación de email;
- sesiones;
- tokens de recuperación;
- rol global mínimo;
- vinculación con una persona.

### 4.2 Organization

Raíz: `Organization`.

Incluye:

- identidad organizacional;
- jerarquía;
- estado;
- políticas institucionales básicas.

### 4.3 Membership

Raíz: `OrganizationMembership`.

Incluye:

- persona;
- organización;
- estado;
- vigencia;
- historial de transiciones.

### 4.4 Period

Raíz: `InstitutionalPeriod`.

Incluye:

- organización propietaria;
- fechas;
- estado;
- secuencia.

### 4.5 Appointment

Raíz: `Appointment`.

Incluye:

- cargo;
- persona y membresía habilitante;
- organización;
- período;
- estado y vigencia.

`Appointment` es la única fuente de verdad para presidencias y autoridades.

### 4.6 Authorization

Raíces:

- `RoleDefinition`;
- `RoleAssignment`;
- `PermissionDefinition`.

### 4.7 MembershipApplication

Raíz: `MembershipApplication`.

### 4.8 MembershipTransfer

Raíz: `MembershipTransfer`.

### 4.9 Module

Raíces:

- `ModuleDefinition`;
- `ModuleInstallation`.

---

## 5. Esquema Prisma completo

El siguiente esquema es la base normativa del Kernel v1.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("KERNEL_DATABASE_URL")
  directUrl = env("KERNEL_DIRECT_URL")
}

enum AccountStatus {
  PENDING_VERIFICATION
  ACTIVE
  SUSPENDED
  DISABLED
}

enum PlatformRole {
  USER
  SUPERADMIN
}

enum OrganizationType {
  DISTRICT
  CLUB
  OTHER
}

enum OrganizationStatus {
  DRAFT
  ACTIVE
  INACTIVE
  ARCHIVED
}

enum MembershipStatus {
  PENDING
  ACTIVE
  ON_LEAVE
  INACTIVE
  GRADUATED
  TRANSFERRED
}

enum MembershipTransitionType {
  CREATED
  ACTIVATED
  LEAVE_STARTED
  LEAVE_ENDED
  DEACTIVATED
  GRADUATED
  TRANSFERRED_OUT
  TRANSFERRED_IN
  REACTIVATED
}

enum PeriodStatus {
  DRAFT
  SCHEDULED
  ACTIVE
  CLOSED
  CANCELLED
}

enum AppointmentStatus {
  NOMINATED
  ELECTED
  ACTIVE
  ENDED
  REVOKED
}

enum ScopeType {
  PLATFORM
  ORGANIZATION
  ORGANIZATION_TREE
}

enum AssignmentEffect {
  ALLOW
  DENY
}

enum ApplicationStatus {
  DRAFT
  SUBMITTED
  APPROVED
  REJECTED
  CANCELLED
  EXPIRED
}

enum TransferStatus {
  REQUESTED
  ACCEPTED_BY_DESTINATION
  CONFIRMED_BY_ORIGIN
  COMPLETED
  REJECTED
  CANCELLED
  EXPIRED
}

enum InvitationStatus {
  PENDING
  ACCEPTED
  EXPIRED
  REVOKED
}

enum ModuleStatus {
  DRAFT
  ACTIVE
  DEPRECATED
  DISABLED
}

enum InstallationStatus {
  PENDING
  ACTIVE
  SUSPENDED
  DISABLED
}

enum OutboxStatus {
  PENDING
  PUBLISHED
  FAILED
}

enum ActorType {
  USER
  SERVICE
  SYSTEM
}

model Person {
  id                 String   @id @default(cuid())
  firstName          String
  lastName           String
  displayName        String?
  primaryEmail       String?
  phone              String?
  birthDate          DateTime? @db.Date
  avatarUrl          String?
  externalReference String?
  metadata           Json?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  archivedAt         DateTime?

  account            UserAccount?
  memberships        OrganizationMembership[]
  roleAssignments    RoleAssignment[]
  invitations        AccountInvitation[]
  requestedApplications MembershipApplication[] @relation("ApplicationRequester")
  reviewedApplications  MembershipApplication[] @relation("ApplicationReviewer")
  requestedTransfers MembershipTransfer[] @relation("TransferRequester")
  acceptedTransfers  MembershipTransfer[] @relation("TransferAcceptor")
  confirmedTransfers MembershipTransfer[] @relation("TransferConfirmer")
  rejectedTransfers  MembershipTransfer[] @relation("TransferRejecter")
  cancelledTransfers MembershipTransfer[] @relation("TransferCanceller")
  createdAppointments Appointment[] @relation("AppointmentCreator")
  revokedAppointments Appointment[] @relation("AppointmentRevoker")

  @@index([primaryEmail])
  @@index([lastName, firstName])
  @@index([externalReference])
}

model UserAccount {
  id                  String        @id @default(cuid())
  personId            String        @unique
  email               String
  emailNormalized     String        @unique
  passwordHash        String
  status              AccountStatus @default(PENDING_VERIFICATION)
  platformRole        PlatformRole  @default(USER)
  emailVerifiedAt     DateTime?
  mustChangePassword  Boolean       @default(false)
  failedLoginAttempts Int           @default(0)
  lockedUntil         DateTime?
  lastLoginAt         DateTime?
  createdAt           DateTime      @default(now())
  updatedAt           DateTime      @updatedAt
  disabledAt          DateTime?

  person              Person                @relation(fields: [personId], references: [id], onDelete: Restrict)
  sessions            AccountSession[]
  passwordResetTokens PasswordResetToken[]
  emailVerificationTokens EmailVerificationToken[]

  @@index([status])
}

model AccountSession {
  id               String   @id @default(cuid())
  accountId        String
  refreshTokenHash String   @unique
  userAgent        String?
  ipAddress        String?
  createdAt        DateTime @default(now())
  lastUsedAt       DateTime @default(now())
  expiresAt        DateTime
  revokedAt        DateTime?
  revokeReason     String?

  account          UserAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@index([accountId, revokedAt])
  @@index([expiresAt])
}

model PasswordResetToken {
  id        String   @id @default(cuid())
  accountId String
  tokenHash String   @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())

  account   UserAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@index([accountId])
  @@index([expiresAt])
}

model EmailVerificationToken {
  id        String   @id @default(cuid())
  accountId String
  tokenHash String   @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())

  account   UserAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@index([accountId])
  @@index([expiresAt])
}

model Organization {
  id          String             @id @default(cuid())
  parentId    String?
  type        OrganizationType
  code        String             @unique
  name        String
  slug        String             @unique
  status      OrganizationStatus @default(DRAFT)
  countryCode String?
  region      String?
  city        String?
  timezone    String             @default("America/Argentina/Cordoba")
  contactEmail String?
  contactPhone String?
  logoUrl     String?
  foundedAt   DateTime?          @db.Date
  description String?            @db.Text
  attributes  Json?
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt
  archivedAt  DateTime?

  parent      Organization?      @relation("OrganizationHierarchy", fields: [parentId], references: [id], onDelete: Restrict)
  children    Organization[]     @relation("OrganizationHierarchy")
  memberships OrganizationMembership[]
  periods     InstitutionalPeriod[]
  appointments Appointment[]
  applications MembershipApplication[]
  transfersFrom MembershipTransfer[] @relation("TransferFromOrganization")
  transfersTo   MembershipTransfer[] @relation("TransferToOrganization")
  roleAssignments RoleAssignment[]
  moduleInstallations ModuleInstallation[]
  positionDefinitions PositionDefinition[] @relation("PositionCatalogOwner")

  @@index([parentId])
  @@index([type, status])
  @@index([name])
}

model OrganizationMembership {
  id             String           @id @default(cuid())
  organizationId String
  personId       String
  memberNumber   String?
  status         MembershipStatus @default(PENDING)
  joinedAt       DateTime?
  statusChangedAt DateTime         @default(now())
  endedAt        DateTime?
  internalNotes  String?          @db.Text
  metadata       Json?
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  person         Person       @relation(fields: [personId], references: [id], onDelete: Restrict)
  appointments   Appointment[]
  transitions    MembershipTransition[]
  invitations    AccountInvitation[]
  applications   MembershipApplication[]
  transfers      MembershipTransfer[]

  @@unique([organizationId, personId])
  @@unique([organizationId, memberNumber])
  @@index([organizationId, status])
  @@index([personId, status])
}

model MembershipTransition {
  id              String                   @id @default(cuid())
  membershipId    String
  type            MembershipTransitionType
  fromStatus      MembershipStatus?
  toStatus        MembershipStatus
  reasonCode      String?
  reasonText      String?
  effectiveAt     DateTime
  performedById   String?
  commandId       String?
  createdAt       DateTime                 @default(now())

  membership      OrganizationMembership @relation(fields: [membershipId], references: [id], onDelete: Cascade)

  @@index([membershipId, effectiveAt])
  @@index([commandId])
}

model InstitutionalPeriod {
  id             String       @id @default(cuid())
  organizationId String
  code           String
  name           String
  sequence       Int
  startDate      DateTime     @db.Date
  endDate        DateTime     @db.Date
  status         PeriodStatus @default(DRAFT)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  closedAt       DateTime?

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  appointments   Appointment[]
  roleAssignments RoleAssignment[]

  @@unique([organizationId, code])
  @@unique([organizationId, sequence])
  @@index([organizationId, status])
  @@index([startDate, endDate])
}

model PositionDefinition {
  id                   String   @id @default(cuid())
  code                 String   @unique
  name                 String
  description          String?
  organizationType     OrganizationType
  // Distrito propietario del catálogo para cargos DISTRICT configurables.
  // Null sólo para cargos globales de sistema sembrados por la plataforma.
  ownerOrganizationId  String?
  // Permiso que autoriza a editar esta definición y los permisos de su rol.
  editPermissionCode   String   @default("kernel.position.manage")
  defaultRoleCode      String?
  isSingletonPerPeriod Boolean  @default(false)
  isSystem             Boolean  @default(false)
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  appointments         Appointment[]
  ownerOrganization    Organization? @relation("PositionCatalogOwner", fields: [ownerOrganizationId], references: [id], onDelete: Restrict)
  editPermission       PermissionDefinition @relation("PositionEditPermission", fields: [editPermissionCode], references: [code], onDelete: Restrict)

  @@index([organizationType])
  @@index([ownerOrganizationId, organizationType])
  @@index([editPermissionCode])
}

model Appointment {
  id                   String            @id @default(cuid())
  organizationId       String
  // Membresía activa que habilita a la persona a ocupar el cargo. Para un
  // cargo DISTRICT puede pertenecer a cualquier CLUB descendiente.
  membershipId         String
  periodId             String
  positionDefinitionId String
  status               AppointmentStatus @default(NOMINATED)
  startsAt             DateTime?
  endsAt               DateTime?
  createdById          String?
  createdAt            DateTime          @default(now())
  activatedAt          DateTime?
  endedAt              DateTime?
  revokedAt            DateTime?
  revokedById          String?
  revokeReason         String?
  derivedRoleAssignments RoleAssignment[] @relation("AppointmentDerivedRole")
  updatedAt            DateTime          @updatedAt

  organization         Organization           @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  membership           OrganizationMembership @relation(fields: [membershipId], references: [id], onDelete: Restrict)
  period               InstitutionalPeriod    @relation(fields: [periodId], references: [id], onDelete: Restrict)
  positionDefinition   PositionDefinition     @relation(fields: [positionDefinitionId], references: [id], onDelete: Restrict)
  createdBy            Person?                @relation("AppointmentCreator", fields: [createdById], references: [id], onDelete: SetNull)
  revokedBy            Person?                @relation("AppointmentRevoker", fields: [revokedById], references: [id], onDelete: SetNull)

  // No hay unicidad histórica: un cargo revocado debe poder recrearse para
  // la misma persona en el mismo período. La unicidad ACTIVE de cargos
  // singleton se protege transaccionalmente (ver §5.1 y §6.6).
  @@index([organizationId, periodId, positionDefinitionId, membershipId])
  @@index([organizationId, periodId, status])
  @@index([membershipId, status])
  @@index([positionDefinitionId, status])
}

model PermissionDefinition {
  id          String   @id @default(cuid())
  code        String   @unique
  namespace   String
  name        String
  description String?
  resourceType String?
  moduleId    String?
  isSystem    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  rolePermissions RolePermission[]
  editablePositions PositionDefinition[] @relation("PositionEditPermission")

  @@index([namespace])
  @@index([moduleId])
}

model RoleDefinition {
  id          String   @id @default(cuid())
  code        String   @unique
  name        String
  description String?
  moduleId    String?
  isSystem    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  permissions RolePermission[]
  assignments RoleAssignment[]

  @@index([moduleId])
}

model RolePermission {
  roleDefinitionId       String
  permissionDefinitionId String
  createdAt              DateTime @default(now())

  roleDefinition         RoleDefinition       @relation(fields: [roleDefinitionId], references: [id], onDelete: Cascade)
  permissionDefinition   PermissionDefinition @relation(fields: [permissionDefinitionId], references: [id], onDelete: Cascade)

  @@id([roleDefinitionId, permissionDefinitionId])
}

model RoleAssignment {
  id               String           @id @default(cuid())
  personId         String
  roleDefinitionId String
  effect           AssignmentEffect @default(ALLOW)
  scopeType        ScopeType
  organizationId   String?
  periodId         String?
  validFrom        DateTime          @default(now())
  validUntil       DateTime?
  grantedById      String?
  reason           String?
  createdAt        DateTime          @default(now())
  revokedAt        DateTime?
  revokedById      String?
  sourceAppointmentId String?

  person           Person             @relation(fields: [personId], references: [id], onDelete: Restrict)
  roleDefinition   RoleDefinition     @relation(fields: [roleDefinitionId], references: [id], onDelete: Restrict)
  organization     Organization?      @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  period           InstitutionalPeriod? @relation(fields: [periodId], references: [id], onDelete: Restrict)
  sourceAppointment Appointment? @relation("AppointmentDerivedRole", fields: [sourceAppointmentId], references: [id], onDelete: Restrict)

  @@index([personId, revokedAt])
  @@index([organizationId, periodId])
  @@index([roleDefinitionId])
  @@index([sourceAppointmentId])
}

model MembershipApplication {
  id               String            @id @default(cuid())
  organizationId   String
  requesterPersonId String
  membershipId     String?
  status           ApplicationStatus @default(DRAFT)
  message          String?           @db.Text
  submittedAt      DateTime?
  reviewedById     String?
  reviewedAt       DateTime?
  rejectionReason  String?
  expiresAt        DateTime?
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt

  organization     Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  requester        Person       @relation("ApplicationRequester", fields: [requesterPersonId], references: [id], onDelete: Restrict)
  reviewer         Person?      @relation("ApplicationReviewer", fields: [reviewedById], references: [id], onDelete: SetNull)
  membership       OrganizationMembership? @relation(fields: [membershipId], references: [id], onDelete: SetNull)

  @@index([organizationId, status])
  @@index([requesterPersonId, status])
}

model MembershipTransfer {
  id                String         @id @default(cuid())
  membershipId      String
  fromOrganizationId String
  toOrganizationId  String
  requestedById     String
  status            TransferStatus @default(REQUESTED)
  reason             String?        @db.Text
  requestedAt       DateTime        @default(now())
  acceptedById      String?
  acceptedAt        DateTime?
  confirmedById     String?
  confirmedAt       DateTime?
  completedAt       DateTime?
  rejectedById      String?
  rejectedAt        DateTime?
  rejectionReason   String?
  cancelledById     String?
  cancelledAt       DateTime?
  expiresAt         DateTime?
  destinationMembershipId String?
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  membership        OrganizationMembership @relation(fields: [membershipId], references: [id], onDelete: Restrict)
  fromOrganization  Organization @relation("TransferFromOrganization", fields: [fromOrganizationId], references: [id], onDelete: Restrict)
  toOrganization    Organization @relation("TransferToOrganization", fields: [toOrganizationId], references: [id], onDelete: Restrict)
  requestedBy       Person @relation("TransferRequester", fields: [requestedById], references: [id], onDelete: Restrict)
  acceptedBy        Person? @relation("TransferAcceptor", fields: [acceptedById], references: [id], onDelete: SetNull)
  confirmedBy       Person? @relation("TransferConfirmer", fields: [confirmedById], references: [id], onDelete: SetNull)
  rejectedBy        Person? @relation("TransferRejecter", fields: [rejectedById], references: [id], onDelete: SetNull)
  cancelledBy       Person? @relation("TransferCanceller", fields: [cancelledById], references: [id], onDelete: SetNull)

  @@index([membershipId, status])
  @@index([fromOrganizationId, status])
  @@index([toOrganizationId, status])
}

model AccountInvitation {
  id           String           @id @default(cuid())
  membershipId String
  personId     String
  email        String
  tokenHash    String           @unique
  status       InvitationStatus @default(PENDING)
  invitedById  String?
  expiresAt    DateTime
  acceptedAt   DateTime?
  revokedAt    DateTime?
  createdAt    DateTime         @default(now())

  membership   OrganizationMembership @relation(fields: [membershipId], references: [id], onDelete: Cascade)
  person       Person @relation(fields: [personId], references: [id], onDelete: Cascade)

  @@index([email, status])
  @@index([expiresAt])
}

model ModuleDefinition {
  id                  String       @id
  name                String
  description         String?
  version             String
  contractVersion     Int          @default(1)
  status              ModuleStatus @default(DRAFT)
  manifest            Json
  configurationSchema Json?
  registeredAt        DateTime     @default(now())
  updatedAt           DateTime     @updatedAt

  installations       ModuleInstallation[]

  @@index([status])
}

model ModuleInstallation {
  id             String             @id @default(cuid())
  moduleId       String
  organizationId String
  status         InstallationStatus @default(PENDING)
  configuration  Json?
  installedById  String?
  installedAt    DateTime           @default(now())
  activatedAt    DateTime?
  disabledAt     DateTime?
  updatedAt      DateTime           @updatedAt

  module         ModuleDefinition @relation(fields: [moduleId], references: [id], onDelete: Restrict)
  organization   Organization     @relation(fields: [organizationId], references: [id], onDelete: Restrict)

  @@unique([moduleId, organizationId])
  @@index([organizationId, status])
}

model IdempotencyKey {
  id             String   @id @default(cuid())
  key            String
  operation      String
  actorScope     String
  requestHash    String
  responseStatus Int?
  responseBody   Json?
  lockedUntil    DateTime?
  completedAt    DateTime?
  expiresAt      DateTime
  createdAt      DateTime @default(now())

  @@unique([key, operation, actorScope])
  @@index([expiresAt])
}

model OutboxMessage {
  id               String       @id @default(cuid())
  eventType        String
  eventVersion     Int          @default(1)
  aggregateType    String
  aggregateId      String
  aggregateVersion Int
  tenantId         String?
  actorType        ActorType
  actorId          String?
  correlationId    String?
  causationId      String?
  traceId          String?
  payload          Json
  occurredAt       DateTime     @default(now())
  status           OutboxStatus @default(PENDING)
  attempts         Int          @default(0)
  nextAttemptAt    DateTime?
  publishedAt      DateTime?
  lastError        String?

  @@index([status, nextAttemptAt])
  @@index([aggregateType, aggregateId, aggregateVersion])
  @@index([occurredAt])
}

model AggregateVersion {
  aggregateType String
  aggregateId   String
  version       Int      @default(0)
  updatedAt     DateTime @updatedAt

  @@id([aggregateType, aggregateId])
}

model KernelAuditLog {
  id             String    @id @default(cuid())
  actorType      ActorType
  actorId        String?
  action         String
  resourceType   String
  resourceId     String?
  organizationId String?
  result         String
  reason         String?
  metadata       Json?
  ipAddress      String?
  userAgent      String?
  traceId        String?
  occurredAt     DateTime  @default(now())

  @@index([actorId, occurredAt])
  @@index([resourceType, resourceId, occurredAt])
  @@index([organizationId, occurredAt])
  @@index([action, occurredAt])
}
```

### 5.1 Restricciones que requieren migración SQL

Prisma no expresa todas las invariantes. La primera migración debe agregar:

```sql
-- Fechas válidas
ALTER TABLE "InstitutionalPeriod"
ADD CONSTRAINT "period_dates_valid"
CHECK (
  "startDate" < "endDate"
  AND EXTRACT(MONTH FROM "startDate") = 7
  AND EXTRACT(DAY FROM "startDate") = 1
  AND "endDate" = ("startDate" + INTERVAL '1 year' - INTERVAL '1 day')::date
);

ALTER TABLE "RoleAssignment"
ADD CONSTRAINT "role_assignment_dates_valid"
CHECK ("validUntil" IS NULL OR "validFrom" < "validUntil");

ALTER TABLE "Appointment"
ADD CONSTRAINT "appointment_dates_valid"
CHECK ("endsAt" IS NULL OR "startsAt" IS NULL OR "startsAt" < "endsAt");

-- Alcance coherente
ALTER TABLE "RoleAssignment"
ADD CONSTRAINT "role_assignment_scope_valid"
CHECK (
  ("scopeType" = 'PLATFORM' AND "organizationId" IS NULL)
  OR
  ("scopeType" IN ('ORGANIZATION', 'ORGANIZATION_TREE') AND "organizationId" IS NOT NULL)
);

-- Una persona no puede transferirse a la misma organización
ALTER TABLE "MembershipTransfer"
ADD CONSTRAINT "transfer_organizations_different"
CHECK ("fromOrganizationId" <> "toOrganizationId");

-- Una única solicitud abierta por persona y organización
CREATE UNIQUE INDEX "application_one_open"
ON "MembershipApplication" ("organizationId", "requesterPersonId")
WHERE "status" IN ('DRAFT', 'SUBMITTED');

-- Una única transferencia abierta por membresía
CREATE UNIQUE INDEX "transfer_one_open"
ON "MembershipTransfer" ("membershipId")
WHERE "status" IN ('REQUESTED', 'ACCEPTED_BY_DESTINATION', 'CONFIRMED_BY_ORIGIN');
```

La unicidad de cargos singleton activos se valida transaccionalmente porque depende de `PositionDefinition.isSingletonPerPeriod`.

La primera migración también debe crear un índice parcial para el período
activo y la implementación debe serializar las operaciones que compiten por
una misma organización/período o cargo singleton:

```sql
CREATE UNIQUE INDEX "period_one_active_per_organization"
ON "InstitutionalPeriod" ("organizationId")
WHERE "status" = 'ACTIVE';
```

`ActivatePeriod`, `ActivateAppointment`, `MoveOrganization`,
`CompleteMembershipTransfer` y las transiciones automáticas equivalentes
deben tomar un lock transaccional estable sobre sus IDs afectados (o usar
aislamiento `SERIALIZABLE` con reintento acotado). Validar primero y escribir
después sin este mecanismo no satisface las invariantes bajo concurrencia.

---

## 6. Invariantes

### 6.1 Cuentas

1. Un email normalizado corresponde a una sola cuenta.
2. Toda cuenta pertenece exactamente a una persona.
3. Una persona tiene como máximo una cuenta.
4. Sólo una cuenta `ACTIVE` y no bloqueada puede iniciar sesión.
5. Un refresh token se almacena únicamente como hash.
6. Rotar un refresh token revoca el anterior.
7. Deshabilitar una cuenta revoca todas sus sesiones.
8. `SUPERADMIN` es el único rol global persistido.
9. La verificación de email es obligatoria salvo alta administrativa explícita.

Normalización:

```text
trim → lowercase → validación RFC razonable
```

El valor normalizado se persiste en `UserAccount.emailNormalized`, que es la
clave única usada para registro, login y cambio de email. `email` conserva el
valor de presentación normalizado; nunca se confía en una colación
case-insensitive implícita de PostgreSQL.

### 6.2 Personas

1. Una persona puede existir sin cuenta.
2. Archivar una persona no elimina su historial.
3. Una persona archivada no puede recibir membresías, cargos ni roles nuevos.
4. `primaryEmail` no es credencial; puede coincidir con `UserAccount.email`, pero tienen propósitos distintos.

### 6.3 Organizaciones

1. `code` y `slug` son globalmente únicos.
2. Una organización no puede ser ancestro de sí misma.
3. Un `CLUB` debe tener como ancestro organizacional un `DISTRICT`.
4. Sólo organizaciones `ACTIVE` aceptan nuevas membresías, períodos y módulos.
5. Una organización con membresías o períodos no se elimina; se archiva.
6. Cambiar el padre requiere validar que no genere ciclos.

### 6.4 Membresías

1. Una persona tiene como máximo una membresía por organización.
2. `ACTIVE` requiere `joinedAt`.
3. `TRANSFERRED`, `GRADUATED` e `INACTIVE` requieren `endedAt`.
4. Toda transición genera `MembershipTransition`.
5. Una membresía no se elimina físicamente.
6. Un miembro `PENDING`, `INACTIVE`, `GRADUATED` o `TRANSFERRED` no puede ocupar un cargo activo.
7. Reactivar preserva el mismo ID y agrega historial.

### 6.5 Períodos

1. Cada período rotario comienza el **1 de julio** y termina el **30 de
   junio** del año calendario siguiente; su duración es de un año completo.
2. `startDate < endDate`.
3. No puede haber dos períodos `ACTIVE` para la misma organización.
4. Los períodos `ACTIVE` no pueden solaparse.
5. Sólo se activa desde `SCHEDULED`.
6. Sólo se cierra desde `ACTIVE`.
7. Un período con cargos no se elimina.
8. Cerrar un período finaliza sus cargos activos en la misma transacción.

### 6.6 Cargos

1. La membresía habilitante debe estar `ACTIVE` al crear y activar el cargo.
2. Para un cargo cuya organización es `CLUB`, la membresía habilitante debe
   pertenecer exactamente a ese club.
3. Para un cargo cuya organización es `DISTRICT`, la membresía habilitante
   puede pertenecer a cualquier `CLUB` descendiente de ese distrito. No se
   crea ni se exige una membresía artificial en el distrito.
4. Para `OTHER`, la membresía habilitante debe pertenecer exactamente a la
   organización hasta que se defina una política específica.
5. El período debe corresponder a la organización o a un ancestro aplicable.
6. Un cargo singleton admite una sola asignación `ACTIVE` por organización, período y posición.
7. `CLUB_PRESIDENT` se define como `PositionDefinition.isSingletonPerPeriod=true`.
8. No existen flags `isPresident`.
9. Un cargo revocado no puede reactivarse; se crea uno nuevo.
10. Activar un cargo puede materializar asignaciones técnicas de rol, pero el cargo sigue siendo la fuente institucional.
11. Una persona puede tener un cargo `ACTIVE` del período actual y uno
    `NOMINATED` o `ELECTED` para un período posterior, incluso para la misma
    posición. Son designaciones históricas distintas y nunca se sobrescriben.
12. Un cargo sólo pasa a `ACTIVE` si su período está `ACTIVE`, su `startsAt`
    llegó y la fecha queda dentro de los límites del período. Si `startsAt` o
    `endsAt` se omiten, se materializan con los límites del período en la zona
    horaria de la organización.

Una persona puede ocupar simultáneamente un cargo de club y uno distrital.
Las incompatibilidades entre posiciones se modelarán explícitamente en una
política futura; no se infieren de la jerarquía ni de los roles técnicos.

### 6.6.1 Catálogo distrital de cargos

1. Un cargo `DISTRICT` configurable tiene como `ownerOrganizationId` un
   distrito `ACTIVE`; sólo es utilizable en ese distrito.
2. Los cargos de sistema pueden no tener propietario y no se renombran ni se
   eliminan desde un distrito.
3. `editPermissionCode` referencia un permiso registrado y determina quién
   puede editar nombre, descripción, singleton, rol técnico y permisos
   efectivos del cargo, evaluado en el alcance del distrito propietario.
4. El `DISTRICT_RDR` recibe por seed `kernel.position.manage` con alcance
   `ORGANIZATION_TREE`, por lo que puede administrar el catálogo de su
   distrito. El `SUPERADMIN` conserva su bypass auditado.
5. Cambiar los permisos de un cargo modifica los `RolePermission` del
   `defaultRoleCode` asociado, en una sola transacción; si el cargo no tiene
   rol técnico, la operación devuelve `409`.

### 6.7 Roles y permisos

1. Los permisos usan formato `<namespace>.<resource>.<action>`.
2. No se agregan permisos mediante enums compilados.
3. Una asignación vencida o revocada no concede acceso.
4. `DENY` gana sobre `ALLOW` con igual o mayor especificidad.
5. `ORGANIZATION` aplica sólo a la organización indicada.
6. `ORGANIZATION_TREE` aplica a la organización y descendientes.
7. `PLATFORM` sólo puede asignarse a roles expresamente autorizados.
8. `SUPERADMIN` concede todos los permisos, pero cada decisión queda auditada.
9. Un módulo sólo puede registrar permisos dentro de su namespace.

### 6.8 Solicitudes

1. Sólo una solicitud abierta por persona y organización.
2. Una persona ya activa no puede solicitar ingreso a la misma organización.
3. Aprobar crea o reactiva una membresía.
4. Aprobar y crear/reactivar membresía es una transacción.
5. Rechazar exige motivo.
6. Sólo se cancela desde `DRAFT` o `SUBMITTED`.

### 6.9 Transferencias

1. Sólo se transfiere una membresía `ACTIVE`.
2. Origen y destino son diferentes.
3. Sólo una transferencia abierta por membresía.
4. El destino acepta antes de que el origen confirme.
5. Completar:
   - marca la membresía origen como `TRANSFERRED`;
   - finaliza cargos activos incompatibles;
   - crea o reactiva la membresía destino;
   - guarda `destinationMembershipId`;
   - emite un único evento de transferencia.
6. Todo el completado ocurre en una transacción.
7. Rechazar exige motivo.
8. Una transferencia completada es inmutable.

### 6.10 Módulos

1. `ModuleDefinition.id` es un identificador estable, por ejemplo `meetings`.
2. Una organización tiene como máximo una instalación por módulo.
3. Un módulo `DEPRECATED` no admite instalaciones nuevas.
4. Activar valida el `configurationSchema`.
5. Deshabilitar no elimina datos del servicio consumidor.
6. El kernel no llama código del módulo durante la instalación.

---

## 7. Máquinas de estado

### 7.1 Cuenta

```text
PENDING_VERIFICATION -> ACTIVE
PENDING_VERIFICATION -> DISABLED
ACTIVE -> SUSPENDED
ACTIVE -> DISABLED
SUSPENDED -> ACTIVE
SUSPENDED -> DISABLED
```

### 7.2 Organización

```text
DRAFT -> ACTIVE
ACTIVE -> INACTIVE
INACTIVE -> ACTIVE
DRAFT -> ARCHIVED
INACTIVE -> ARCHIVED
```

`ARCHIVED` es terminal.

### 7.3 Membresía

```text
PENDING -> ACTIVE
PENDING -> INACTIVE
ACTIVE -> ON_LEAVE
ON_LEAVE -> ACTIVE
ACTIVE -> INACTIVE
ACTIVE -> GRADUATED
ACTIVE -> TRANSFERRED
INACTIVE -> ACTIVE
```

### 7.4 Período

```text
DRAFT -> SCHEDULED
DRAFT -> CANCELLED
SCHEDULED -> ACTIVE
SCHEDULED -> CANCELLED
ACTIVE -> CLOSED
```

`CLOSED` y `CANCELLED` son terminales.

### 7.5 Cargo

```text
NOMINATED -> ELECTED
NOMINATED -> REVOKED
ELECTED -> ACTIVE
ELECTED -> REVOKED
ACTIVE -> ENDED
ACTIVE -> REVOKED
```

`NOMINATED` y `ELECTED` representan designaciones futuras. Por ejemplo, el
presidente 2026–2027 puede seguir `ACTIVE` mientras su sucesor para 2027–2028
queda `ELECTED`. Al llegar el 1 de julio y activarse el período sucesor, el
job activa el cargo electo y el cierre del período anterior finaliza el cargo
vigente. Cada registro conserva su propio período, fechas y trazabilidad.

### 7.6 Solicitud

```text
DRAFT -> SUBMITTED
DRAFT -> CANCELLED
SUBMITTED -> APPROVED
SUBMITTED -> REJECTED
SUBMITTED -> CANCELLED
SUBMITTED -> EXPIRED
```

### 7.7 Transferencia

```text
REQUESTED -> ACCEPTED_BY_DESTINATION
REQUESTED -> REJECTED
REQUESTED -> CANCELLED
REQUESTED -> EXPIRED

ACCEPTED_BY_DESTINATION -> CONFIRMED_BY_ORIGIN
ACCEPTED_BY_DESTINATION -> REJECTED
ACCEPTED_BY_DESTINATION -> CANCELLED
ACCEPTED_BY_DESTINATION -> EXPIRED

CONFIRMED_BY_ORIGIN -> COMPLETED
CONFIRMED_BY_ORIGIN -> REJECTED
CONFIRMED_BY_ORIGIN -> CANCELLED
CONFIRMED_BY_ORIGIN -> EXPIRED
```

### 7.8 Instalación de módulo

```text
PENDING -> ACTIVE
PENDING -> DISABLED
ACTIVE -> SUSPENDED
ACTIVE -> DISABLED
SUSPENDED -> ACTIVE
SUSPENDED -> DISABLED
```

### 7.9 Invitación de cuenta

```text
PENDING -> ACCEPTED
PENDING -> EXPIRED
PENDING -> REVOKED
```

Aceptar una invitación crea `UserAccount` y vincula la cuenta con la
`Person` de la invitación en una única transacción. Una invitación aceptada,
vencida o revocada es terminal.

---

## 8. Comandos de aplicación

Los comandos son operaciones transaccionales. Todos aceptan:

```ts
type CommandMetadata = {
  commandId: string;
  actor: {
    type: 'USER' | 'SERVICE' | 'SYSTEM';
    id?: string;
  };
  correlationId?: string;
  causationId?: string;
  traceId?: string;
  idempotencyKey?: string;
};
```

### 8.1 Identity

```text
RegisterAccount
VerifyEmail
AuthenticateAccount
RefreshSession
RevokeSession
RevokeAllSessions
RequestPasswordReset
ResetPassword
ChangePassword
SuspendAccount
ReactivateAccount
DisableAccount
UpdateOwnAccountEmail
```

### 8.2 Persons

```text
CreatePerson
UpdatePerson
ArchivePerson
LinkAccountToPerson
InvitePersonToCreateAccount
AcceptAccountInvitation
```

### 8.3 Organizations

```text
CreateOrganization
UpdateOrganization
ActivateOrganization
DeactivateOrganization
ArchiveOrganization
MoveOrganization
```

### 8.4 Memberships

```text
CreateMembership
ActivateMembership
PutMembershipOnLeave
ResumeMembership
DeactivateMembership
GraduateMembership
ReactivateMembership
```

### 8.5 Periods

```text
CreatePeriod
UpdateDraftPeriod
SchedulePeriod
ActivatePeriod
ClosePeriod
CancelPeriod
```

### 8.6 Appointments

```text
CreatePositionDefinition
UpdatePositionDefinition
AttachPermissionToPosition
DetachPermissionFromPosition
CreateAppointment
MarkAppointmentElected
ActivateAppointment
EndAppointment
RevokeAppointment
```

### 8.7 Authorization

```text
RegisterPermission
CreateRole
AttachPermissionToRole
DetachPermissionFromRole
GrantRole
RevokeRole
CheckAuthorization
BatchCheckAuthorization
```

### 8.8 Applications

```text
CreateMembershipApplication
SubmitMembershipApplication
ApproveMembershipApplication
RejectMembershipApplication
CancelMembershipApplication
ExpireMembershipApplication
```

### 8.9 Transfers

```text
RequestMembershipTransfer
AcceptTransferByDestination
ConfirmTransferByOrigin
CompleteMembershipTransfer
RejectMembershipTransfer
CancelMembershipTransfer
ExpireMembershipTransfer
```

### 8.10 Modules

```text
RegisterModule
UpdateModuleManifest
DeprecateModule
InstallModule
ActivateModuleInstallation
UpdateModuleConfiguration
SuspendModuleInstallation
DisableModuleInstallation
```

---

## 9. API HTTP v1

Prefijo:

```text
/api/kernel/v1
```

### 9.1 Convenciones

- JSON.
- Fechas ISO 8601 UTC.
- Paginación por cursor.
- `Idempotency-Key` obligatorio en POST de integración.
- `X-Correlation-Id` y `traceparent`.
- Errores Problem Details.

### 9.1.1 Regla contractual de idempotencia

Todo `POST` que crea o transiciona un agregado exige `Idempotency-Key`, salvo
los endpoints de autenticación expresamente señalados como exentos
(`login`, `refresh`, `logout`, `verify-email`, `forgot-password`,
`reset-password` y aceptación de invitación). La identidad de la clave es
`(key, operationId, actorScope)`, donde `actorScope` es el `personId`, el
ID de servicio o `anonymous:<IP-hash>` para flujos públicos. Repetir la clave
con el mismo hash de request devuelve la respuesta original; con otro cuerpo
devuelve `409 KERNEL_IDEMPOTENCY_KEY_REUSED` y no ejecuta el comando.

Respuesta de error:

```json
{
  "type": "https://api.mirotaract/errors/invalid-transition",
  "title": "Invalid state transition",
  "status": 409,
  "code": "KERNEL_INVALID_TRANSITION",
  "detail": "ACTIVE membership cannot transition directly to PENDING",
  "instance": "/api/kernel/v1/memberships/mem_123/status",
  "traceId": "trc_123"
}
```

### 9.2 Auth

```text
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
POST   /auth/logout-all
POST   /auth/verify-email
POST   /auth/forgot-password
POST   /auth/reset-password
POST   /auth/invitations/accept
GET    /auth/me
PATCH  /auth/me
PATCH  /auth/me/password
GET    /auth/sessions
DELETE /auth/sessions/:sessionId
POST   /auth/introspect
```

### 9.3 Personas

```text
POST   /persons
GET    /persons
GET    /persons/:personId
PATCH  /persons/:personId
POST   /persons/:personId/archive
POST   /persons/:personId/invitations
```

### 9.4 Organizaciones

```text
POST   /organizations
GET    /organizations
GET    /organizations/:organizationId
PATCH  /organizations/:organizationId
POST   /organizations/:organizationId/activate
POST   /organizations/:organizationId/deactivate
POST   /organizations/:organizationId/archive
POST   /organizations/:organizationId/move
GET    /organizations/:organizationId/children
GET    /organizations/:organizationId/ancestors
GET    /organizations/:organizationId/descendants
```

Filtros:

```text
type
status
parentId
query
```

### 9.5 Membresías

```text
POST   /organizations/:organizationId/memberships
GET    /organizations/:organizationId/memberships
GET    /memberships/:membershipId
PATCH  /memberships/:membershipId
POST   /memberships/:membershipId/activate
POST   /memberships/:membershipId/leave
POST   /memberships/:membershipId/resume
POST   /memberships/:membershipId/deactivate
POST   /memberships/:membershipId/graduate
POST   /memberships/:membershipId/reactivate
GET    /memberships/:membershipId/history
GET    /persons/:personId/memberships
```

### 9.6 Períodos

```text
POST   /organizations/:organizationId/periods
GET    /organizations/:organizationId/periods
GET    /organizations/:organizationId/periods/current
GET    /periods/:periodId
PATCH  /periods/:periodId
POST   /periods/:periodId/schedule
POST   /periods/:periodId/activate
POST   /periods/:periodId/close
POST   /periods/:periodId/cancel
```

### 9.7 Cargos

```text
POST   /position-definitions
GET    /position-definitions
PATCH  /position-definitions/:positionDefinitionId
PUT    /position-definitions/:positionDefinitionId/permissions/:permissionId
DELETE /position-definitions/:positionDefinitionId/permissions/:permissionId

POST   /organizations/:organizationId/appointments
GET    /organizations/:organizationId/appointments
GET    /organizations/:organizationId/authorities/current
GET    /appointments/:appointmentId
POST   /appointments/:appointmentId/elect
POST   /appointments/:appointmentId/activate
POST   /appointments/:appointmentId/end
POST   /appointments/:appointmentId/revoke
```

Filtros:

```text
periodId
positionCode
membershipId
status
```

### 9.8 Autorización

```text
GET    /permissions
POST   /permissions
GET    /roles
POST   /roles
PUT    /roles/:roleId/permissions/:permissionId
DELETE /roles/:roleId/permissions/:permissionId
POST   /role-assignments
GET    /role-assignments
POST   /role-assignments/:assignmentId/revoke
POST   /authorization/check
POST   /authorization/batch-check
GET    /persons/:personId/effective-permissions
```

Request:

```json
{
  "subjectId": "per_123",
  "permission": "meetings.meeting.create",
  "scope": {
    "type": "ORGANIZATION",
    "organizationId": "org_123"
  },
  "periodId": "prd_123",
  "resource": {
    "type": "meeting",
    "id": "mtg_123",
    "attributes": {}
  }
}
```

Response:

```json
{
  "allowed": true,
  "decisionId": "dec_123",
  "subjectId": "per_123",
  "permission": "meetings.meeting.create",
  "matchedAssignments": ["ras_123"],
  "reasonCodes": ["ROLE_ALLOWED"],
  "evaluatedAt": "2026-07-29T15:00:00.000Z",
  "cacheUntil": "2026-07-29T15:01:00.000Z"
}
```

### 9.9 Solicitudes

```text
POST   /membership-applications
GET    /membership-applications
GET    /membership-applications/:applicationId
POST   /membership-applications/:applicationId/submit
POST   /membership-applications/:applicationId/approve
POST   /membership-applications/:applicationId/reject
POST   /membership-applications/:applicationId/cancel
```

### 9.10 Transferencias

```text
POST   /membership-transfers
GET    /membership-transfers
GET    /membership-transfers/:transferId
POST   /membership-transfers/:transferId/accept
POST   /membership-transfers/:transferId/confirm
POST   /membership-transfers/:transferId/complete
POST   /membership-transfers/:transferId/reject
POST   /membership-transfers/:transferId/cancel
```

`complete` puede ser interno/administrativo o ejecutarse automáticamente después de `confirm`, según configuración.

### 9.11 Módulos

```text
POST   /modules
GET    /modules
GET    /modules/:moduleId
PUT    /modules/:moduleId/manifest
POST   /modules/:moduleId/deprecate

POST   /organizations/:organizationId/modules/:moduleId/install
POST   /organizations/:organizationId/modules/:moduleId/activate
PATCH  /organizations/:organizationId/modules/:moduleId/configuration
POST   /organizations/:organizationId/modules/:moduleId/suspend
POST   /organizations/:organizationId/modules/:moduleId/disable
GET    /organizations/:organizationId/modules
GET    /organizations/:organizationId/capabilities
```

### 9.12 APIs para servicios

```text
GET  /service/users/:accountId/context
GET  /service/persons/:personId
GET  /service/organizations/:organizationId
GET  /service/organizations/:organizationId/membership-snapshot
GET  /service/organizations/:organizationId/authority-snapshot
GET  /service/organizations/:organizationId/period-snapshot
POST /service/authorization/check
POST /service/authorization/batch-check
GET  /service/modules/:moduleId/installations/:organizationId
```

Estas rutas requieren identidad de servicio y audiencia `institutional-kernel`.

---

## 10. Permisos

### 10.1 Permisos propios del kernel

```text
kernel.account.read.self
kernel.account.update.self
kernel.account.manage

kernel.person.read.self
kernel.person.update.self
kernel.person.read
kernel.person.manage

kernel.organization.read
kernel.organization.create
kernel.organization.update
kernel.organization.activate
kernel.organization.archive
kernel.organization.move

kernel.membership.read
kernel.membership.create
kernel.membership.update
kernel.membership.activate
kernel.membership.deactivate
kernel.membership.transfer

kernel.period.read
kernel.period.create
kernel.period.update
kernel.period.activate
kernel.period.close

kernel.appointment.read
kernel.appointment.create
kernel.appointment.activate
kernel.appointment.end
kernel.appointment.revoke

kernel.position.read
kernel.position.create
kernel.position.manage

kernel.application.create.self
kernel.application.read.self
kernel.application.cancel.self
kernel.application.review

kernel.transfer.create.self
kernel.transfer.read.self
kernel.transfer.accept
kernel.transfer.confirm
kernel.transfer.reject

kernel.role.read
kernel.role.manage
kernel.role.assign
kernel.role.revoke

kernel.module.read
kernel.module.register
kernel.module.install
kernel.module.configure
kernel.module.disable

kernel.audit.read
```

### 10.2 Roles iniciales

| Rol | Alcance | Permisos principales |
|---|---|---|
| `PLATFORM_USER` | PLATFORM | Operaciones propias |
| `DISTRICT_RDR` | ORGANIZATION_TREE | Gestión distrital, catálogo de cargos (`kernel.position.manage`) y lectura del árbol |
| `DISTRICT_SECRETARY` | ORGANIZATION_TREE | Organizaciones, miembros, períodos y cargos |
| `CLUB_PRESIDENT` | ORGANIZATION | Gestión del propio club |
| `CLUB_SECRETARY` | ORGANIZATION | Gestión de miembros y solicitudes |
| `CLUB_TREASURER` | ORGANIZATION | Permisos base; módulos agregan finanzas |
| `MEMBER` | ORGANIZATION | Lectura institucional y operaciones propias |

`SUPERADMIN` no es `RoleDefinition`: es `PlatformRole`.

### 10.3 Cargos y roles técnicos

`PositionDefinition.defaultRoleCode` permite que un cargo active un rol técnico.

Ejemplo:

```text
Position: CLUB_PRESIDENT
Default role: CLUB_PRESIDENT
```

Al activar:

1. se activa `Appointment`;
2. se crea una `RoleAssignment` vinculada lógicamente al cargo;
3. se emiten ambos eventos;
4. al finalizar/revocar, se revoca la asignación.

Toda asignación derivada debe persistir `sourceAppointmentId` como FK a
`Appointment`; no es opcional. Al finalizar o revocar el cargo se revoca
exactamente esa asignación. Los roles asignados manualmente nunca llevan ese
campo.

---

## 11. Eventos de integración

### 11.1 Envelope

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

### 11.2 Catálogo

Identity:

```text
kernel.account.registered.v1
kernel.account.activated.v1
kernel.account.email-changed.v1
kernel.account.suspended.v1
kernel.account.reactivated.v1
kernel.account.disabled.v1
kernel.account.sessions-revoked.v1
kernel.account.invitation-accepted.v1
kernel.person.created.v1
kernel.person.updated.v1
kernel.person.archived.v1
kernel.person.account-linked.v1
```

Organization:

```text
kernel.organization.created.v1
kernel.organization.updated.v1
kernel.organization.activated.v1
kernel.organization.deactivated.v1
kernel.organization.archived.v1
kernel.organization.moved.v1
```

Membership:

```text
kernel.membership.created.v1
kernel.membership.activated.v1
kernel.membership.status-changed.v1
kernel.membership.transferred.v1
```

Period:

```text
kernel.period.created.v1
kernel.period.scheduled.v1
kernel.period.activated.v1
kernel.period.closed.v1
kernel.period.cancelled.v1
```

Appointment:

```text
kernel.position.created.v1
kernel.position.updated.v1
kernel.position.permissions-changed.v1
kernel.appointment.created.v1
kernel.appointment.elected.v1
kernel.appointment.activated.v1
kernel.appointment.ended.v1
kernel.appointment.revoked.v1
```

Authorization:

```text
kernel.role.created.v1
kernel.role.updated.v1
kernel.role-assignment.granted.v1
kernel.role-assignment.revoked.v1
kernel.permissions.changed.v1
```

Applications and transfers:

```text
kernel.membership-application.submitted.v1
kernel.membership-application.approved.v1
kernel.membership-application.rejected.v1
kernel.membership-application.cancelled.v1

kernel.membership-transfer.requested.v1
kernel.membership-transfer.accepted.v1
kernel.membership-transfer.confirmed.v1
kernel.membership-transfer.rejected.v1
kernel.membership-transfer.cancelled.v1
```

Modules:

```text
kernel.module.registered.v1
kernel.module.updated.v1
kernel.module.deprecated.v1
kernel.module-installed.v1
kernel.module-activated.v1
kernel.module-configuration-updated.v1
kernel.module-suspended.v1
kernel.module-disabled.v1
```

### 11.3 Contenido mínimo

Los eventos no exponen:

- password hashes;
- tokens;
- notas internas;
- IP;
- información sensible innecesaria.

Ejemplo `appointment.activated`:

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

### 11.4 Publicación

1. El comando modifica el agregado.
2. Incrementa `AggregateVersion`.
3. Inserta `OutboxMessage` en la misma transacción.
4. El worker publica.
5. El broker confirma.
6. El worker marca `PUBLISHED`.
7. Después de N reintentos pasa a `FAILED` y genera alerta.

---

## 12. Contratos para consumidores

### 12.1 Kernel SDK

Paquete:

```text
@mirotaract/kernel-sdk
```

API:

```ts
export interface KernelClient {
  introspect(token: string): Promise<IntrospectionResult>;

  getUserContext(accountId: string): Promise<UserContext>;
  getPerson(personId: string): Promise<PersonSummary>;
  getOrganization(organizationId: string): Promise<OrganizationSummary>;

  getMembershipSnapshot(
    organizationId: string,
    options?: { status?: string[]; at?: string },
  ): Promise<MembershipSnapshot>;

  getAuthoritySnapshot(
    organizationId: string,
    options?: { periodId?: string; at?: string },
  ): Promise<AuthoritySnapshot>;

  getPeriodSnapshot(
    organizationId: string,
    options?: { at?: string },
  ): Promise<PeriodSnapshot>;

  checkAuthorization(
    request: AuthorizationCheckRequest,
  ): Promise<AuthorizationDecision>;

  batchCheckAuthorization(
    request: BatchAuthorizationCheckRequest,
  ): Promise<AuthorizationDecision[]>;

  getModuleInstallation(
    organizationId: string,
    moduleId: string,
  ): Promise<ModuleInstallationSummary>;
}
```

### 12.2 UserContext

```ts
type UserContext = {
  accountId: string;
  personId: string;
  accountStatus: 'ACTIVE';
  platformRole: 'USER' | 'SUPERADMIN';
  displayName: string;
  memberships: Array<{
    membershipId: string;
    organizationId: string;
    organizationType: 'DISTRICT' | 'CLUB' | 'OTHER';
    status: string;
  }>;
  contextVersion: number;
};
```

### 12.3 MembershipSnapshot

```ts
type MembershipSnapshot = {
  snapshotId: string;
  organizationId: string;
  capturedAt: string;
  sourceVersion: number;
  members: Array<{
    membershipId: string;
    personId: string;
    accountId?: string;
    status: string;
  }>;
};
```

Meetings puede guardar el snapshot para quórum sin volver a consultar el kernel.

### 12.4 AuthoritySnapshot

```ts
type AuthoritySnapshot = {
  snapshotId: string;
  organizationId: string;
  periodId: string;
  capturedAt: string;
  appointments: Array<{
    appointmentId: string;
    positionCode: string;
    membershipId: string;
    membershipOrganizationId: string;
    personId: string;
    status: 'ACTIVE';
    startsAt?: string;
    endsAt?: string;
  }>;
};
```

### 12.4.1 PeriodSnapshot

```ts
type PeriodSnapshot = {
  snapshotId: string;
  organizationId: string;
  capturedAt: string;
  currentPeriod: {
    periodId: string;
    code: string;
    name: string;
    sequence: number;
    startDate: string;
    endDate: string;
    status: 'ACTIVE';
  } | null;
};
```

Una organización existente sin período activo responde `200` con
`currentPeriod: null`; `404` se reserva para una organización inexistente.

### 12.5 Reglas para consumidores

- No almacenar email si sólo necesitan identidad.
- No asumir que un ID tiene prefijo determinado.
- No usar email como FK.
- No replicar credenciales.
- No editar snapshots.
- Ignorar campos de evento desconocidos.
- Procesar eventos idempotentemente.
- Aplicar timeout, retry limitado y circuit breaker.
- Para operaciones sensibles usar autorización síncrona o snapshot sellado.

---

## 13. Estructura NestJS

```text
apps/institutional-kernel/
  src/
    main.ts
    app.module.ts

    identity/
      domain/
        account.aggregate.ts
        account.errors.ts
        account.events.ts
        account.repository.ts
      application/
        commands/
        queries/
        services/
      infrastructure/
        prisma-account.repository.ts
        password-hasher.adapter.ts
        token.adapter.ts
      interfaces/
        http/
          auth.controller.ts
          accounts.controller.ts
          dto/
      identity.module.ts

    persons/
    organizations/
    memberships/
    periods/
    appointments/
    authorization/
    applications/
    transfers/
    modules-registry/

    integration/
      outbox/
      events/
      service-auth/
      idempotency/

    audit/
    health/
    common/
      errors/
      context/
      validation/
      observability/

  prisma/
    schema.prisma
    migrations/
    seed.ts

  test/
    unit/
    integration/
    contract/
    e2e/

  contracts/
    openapi.yaml
    asyncapi.yaml
    schemas/

packages/
  kernel-sdk/
  kernel-contracts/
  auth-middleware/
```

### 13.1 Capas

Domain:

- agregados;
- entidades;
- value objects;
- invariantes;
- eventos;
- interfaces de repositorio.

Application:

- comandos;
- queries;
- handlers;
- transacciones;
- autorización de casos de uso.

Infrastructure:

- Prisma;
- Redis;
- broker;
- criptografía;
- reloj;
- IDs.

Interfaces:

- controllers;
- DTOs;
- consumidores internos;
- presenters.

### 13.2 Reglas de dependencia

```text
interfaces -> application -> domain
infrastructure -> application/domain
domain -> nada externo
```

Un módulo del kernel no consulta tablas ajenas directamente. Usa el puerto de aplicación del módulo propietario cuando cruza agregados.

---

## 14. Seguridad

### 14.1 Credenciales

- Argon2id para contraseñas.
- Parámetros configurables.
- Access token de 10 minutos.
- Refresh token rotativo de 30 días.
- Hash de refresh/reset/verification tokens.
- Revocación por sesión.
- Rate limit distribuido.

### 14.2 Tokens

Access token:

```json
{
  "sub": "acc_123",
  "pid": "per_123",
  "sid": "ses_123",
  "pr": "USER",
  "iss": "institutional-kernel",
  "aud": "mirotaract-platform",
  "iat": 1785320000,
  "exp": 1785320600
}
```

No incluir todas las membresías o permisos.

### 14.3 Servicio a servicio

- JWT firmado o mTLS.
- `sub` identifica al servicio.
- `aud` debe ser `institutional-kernel`.
- scopes técnicos por endpoint.
- rotación de claves.

### 14.4 Auditoría

Auditar:

- login exitoso/fallido;
- cambio de email o contraseña;
- suspensión y reactivación;
- cambios organizacionales;
- cambios de membresía;
- cargos;
- asignaciones de roles;
- decisiones de autorización sensibles;
- instalaciones de módulos.

### 14.5 Datos personales

- Minimización.
- Separación entre credencial y perfil institucional.
- Ocultar notas internas.
- Paginación y filtros para listados.
- Logs sin PII innecesaria.
- Exportación y anonimización sujetas a política posterior.

---

## 15. Caché y consistencia

### 15.1 Redis

Cachear:

- jerarquía organizacional;
- permisos efectivos;
- autoridades actuales;
- período actual;
- instalaciones activas.

### 15.2 Claves

```text
kernel:org-tree:{organizationId}:{version}
kernel:permissions:{personId}:{organizationId}:{periodId}:{version}
kernel:authorities:{organizationId}:{periodId}:{version}
kernel:current-period:{organizationId}:{version}
kernel:module:{organizationId}:{moduleId}:{version}
```

### 15.3 Invalidación

Se invalida en la misma unidad lógica que:

- cambia una asignación;
- activa/finaliza un cargo;
- cambia una membresía;
- mueve una organización;
- cambia un período;
- habilita/deshabilita un módulo.

Si Redis falla, el kernel consulta PostgreSQL. Redis no es fuente de verdad.

---

## 16. Jobs

```text
ExpirePasswordResetTokens
ExpireEmailVerificationTokens
ExpireAccountInvitations
ExpireMembershipApplications
ExpireMembershipTransfers
ActivateScheduledPeriods
CloseExpiredPeriods
ActivateScheduledAppointments
EndExpiredAppointments
PublishOutboxMessages
RetryFailedOutboxMessages
PurgeExpiredIdempotencyKeys
PurgeExpiredRevokedSessions
```

Cada job:

- usa lock distribuido;
- es idempotente;
- procesa lotes;
- registra métricas;
- no depende de otros servicios.

---

## 17. Criterios de aceptación

### 17.1 Identidad

- **CA-ID-01:** registrar crea `Person` y `UserAccount` atómicamente.
- **CA-ID-02:** email duplicado responde 409.
- **CA-ID-03:** cuenta no verificada no inicia sesión.
- **CA-ID-04:** refresh rota token y revoca el anterior.
- **CA-ID-05:** reset token usado o vencido es rechazado.
- **CA-ID-06:** deshabilitar revoca todas las sesiones.
- **CA-ID-07:** `/auth/me` no depende de servicios externos.

### 17.2 Organizaciones

- **CA-ORG-01:** se crea distrito raíz.
- **CA-ORG-02:** se crea club dentro de distrito.
- **CA-ORG-03:** se rechaza un ciclo jerárquico.
- **CA-ORG-04:** organización inactiva no acepta miembros.
- **CA-ORG-05:** organización con historial se archiva, no se borra.

### 17.3 Membresías

- **CA-MEM-01:** persona sin cuenta puede ser miembro.
- **CA-MEM-02:** no existen membresías duplicadas.
- **CA-MEM-03:** activar registra transición.
- **CA-MEM-04:** estado terminal conserva historial.
- **CA-MEM-05:** vincular una cuenta no modifica el ID de membresía.

### 17.4 Períodos

- **CA-PER-01:** se rechazan fechas inválidas.
- **CA-PER-01a:** se rechaza un período que no inicie el 1 de julio o no
  termine el 30 de junio siguiente.
- **CA-PER-02:** no hay dos períodos activos por organización.
- **CA-PER-03:** activar emite evento.
- **CA-PER-04:** cerrar finaliza cargos activos.

### 17.5 Cargos

- **CA-APP-01:** sólo miembro activo ocupa cargo activo.
- **CA-APP-02:** dos presidentes activos del mismo club/período son rechazados.
- **CA-APP-03:** el presidente se obtiene desde `Appointment`.
- **CA-APP-04:** no existen flags de presidencia.
- **CA-APP-05:** revocar cargo revoca rol derivado.
- **CA-APP-06:** una membresía `ACTIVE` de un club descendiente habilita un
  cargo del distrito; no se crea una membresía en el distrito.
- **CA-APP-07:** una membresía de otro club no habilita un cargo de club.
- **CA-APP-08:** `AuthoritySnapshot` y los eventos de cargo incluyen la
  organización de la membresía habilitante.
- **CA-APP-09:** una persona puede conservar un cargo `ACTIVE` en el período
  actual y una designación `ELECTED` en el período siguiente.
- **CA-APP-10:** un cargo futuro no se activa antes de que su período esté
  activo y llegue su `startsAt`; cerrar el período actual finaliza el cargo
  vigente sin alterar la designación futura.
- **CA-POS-01:** el RDR de un distrito puede crear y editar cargos DISTRICT
  de su catálogo cuando posee el `editPermissionCode` configurado.
- **CA-POS-02:** editar permisos de un cargo actualiza atómicamente el rol
  técnico asociado; un cargo sin rol técnico responde 409.
- **CA-POS-03:** un RDR no puede editar cargos de otro distrito ni cargos de
  sistema.

### 17.6 Autorización

- **CA-AUTHZ-01:** ausencia de permiso deniega.
- **CA-AUTHZ-02:** rol organizacional no concede acceso a otro club.
- **CA-AUTHZ-03:** rol distrital con `ORGANIZATION_TREE` alcanza clubes hijos.
- **CA-AUTHZ-04:** asignación vencida no concede.
- **CA-AUTHZ-05:** `DENY` específico prevalece.
- **CA-AUTHZ-06:** batch-check devuelve decisión por cada ítem.
- **CA-AUTHZ-07:** cambios invalidan caché.

### 17.7 Solicitudes

- **CA-SOL-01:** no se duplican solicitudes abiertas.
- **CA-SOL-02:** aprobar crea/reactiva membresía.
- **CA-SOL-03:** rechazo exige motivo.
- **CA-SOL-04:** solicitud completada no vuelve a abrirse.

### 17.8 Transferencias

- **CA-TRA-01:** sólo miembro activo solicita transferencia.
- **CA-TRA-02:** destino debe aceptar primero.
- **CA-TRA-03:** origen debe confirmar.
- **CA-TRA-04:** completar actualiza ambas membresías atómicamente.
- **CA-TRA-05:** completar emite un solo evento.
- **CA-TRA-06:** no hay dos transferencias abiertas.

### 17.9 Módulos

- **CA-MOD-01:** un módulo se registra sin migrar tablas del kernel.
- **CA-MOD-02:** configuración inválida es rechazada.
- **CA-MOD-03:** habilitar emite evento.
- **CA-MOD-04:** deshabilitar no elimina datos externos.
- **CA-MOD-05:** capacidades reflejan instalación y permisos.

### 17.10 Integración

- **CA-INT-01:** todo cambio relevante crea Outbox en la misma transacción.
- **CA-INT-02:** reintentar un comando idempotente no duplica efectos.
- **CA-INT-03:** los eventos no exponen secretos.
- **CA-INT-04:** el kernel arranca y funciona sin consumidores.
- **CA-INT-05:** caída del broker no impide confirmar la transacción local.
- **CA-INT-06:** mensajes pendientes se publican al recuperarse el broker.

---

## 18. Contratos no funcionales

| Área | Objetivo v1 |
|---|---|
| Disponibilidad APIs de lectura | 99,9% mensual |
| Disponibilidad escrituras administrativas | 99,5% mensual |
| Latencia autorización p95 | < 100 ms con caché, < 300 ms sin caché |
| Latencia lectura p95 | < 300 ms |
| Publicación de eventos | 99% en menos de 30 segundos |
| RPO PostgreSQL | 15 minutos |
| RTO | 2 horas |
| Tamaño máximo batch authorization | 100 decisiones |
| Paginación por defecto | 25 |
| Paginación máxima | 100 |

---

## 19. Seeds del sistema

### 19.1 Posiciones

```text
DISTRICT_RDR
DISTRICT_SECRETARY
DISTRICT_TREASURER
CLUB_PRESIDENT
CLUB_PRESIDENT_ELECT
CLUB_VICE_PRESIDENT
CLUB_SECRETARY
CLUB_TREASURER
CLUB_PAST_PRESIDENT
```

### 19.2 Roles

```text
PLATFORM_USER
DISTRICT_RDR
DISTRICT_SECRETARY
CLUB_PRESIDENT
CLUB_SECRETARY
CLUB_TREASURER
MEMBER
```

### 19.3 Módulos

El kernel no preinstala módulos de negocio, pero puede registrar:

```json
{
  "id": "meetings",
  "name": "Reuniones",
  "version": "1.0.0",
  "contractVersion": 1,
  "status": "ACTIVE",
  "manifest": {
    "permissions": [],
    "events": {
      "publishes": [],
      "subscribes": []
    }
  }
}
```

El manifiesto completo lo proporciona el servicio Meetings.

---

## 20. Orden de implementación

### Sprint 1 — Fundación

- Monorepo.
- Aplicación NestJS.
- Prisma/PostgreSQL.
- contexto de comando;
- errores estándar;
- Outbox;
- observabilidad;
- health/readiness.

### Sprint 2 — Identidad

- Person.
- UserAccount.
- sesiones.
- login/refresh/logout.
- verificación y reset.

### Sprint 3 — Organizaciones y membresías

- jerarquía;
- membresías;
- transiciones;
- invitaciones.

### Sprint 4 — Períodos y cargos

- períodos;
- posiciones;
- appointments;
- jobs de transición.

### Sprint 5 — Autorización

- permisos;
- roles;
- asignaciones;
- authorization check;
- caché.

### Sprint 6 — Solicitudes y transferencias

- aplicaciones;
- workflow completo;
- transferencias atómicas.

### Sprint 7 — Registro de módulos

- manifiestos;
- instalaciones;
- configuración;
- capacidades;
- SDK.

### Sprint 8 — Contratos y endurecimiento

- OpenAPI;
- AsyncAPI;
- contract tests;
- seguridad;
- carga;
- runbooks;
- documentación de integración.

---

## 21. Definition of Done del Kernel v1

El Kernel v1 está terminado cuando:

- el esquema y las migraciones son reproducibles;
- no contiene entidades de servicios consumidores;
- funciona sin Meetings ni Events;
- cuentas, organizaciones, miembros, períodos y cargos están operativos;
- `Appointment` es la única fuente de autoridad;
- autorización contextual está implementada;
- todos los cambios relevantes generan Outbox;
- el SDK puede consultar contexto, snapshots y autorización;
- un módulo ficticio puede registrarse e instalarse sin modificar el kernel;
- APIs y eventos están documentados;
- no hay acceso directo externo a su base;
- health, métricas, trazas y auditoría están activos;
- existe estrategia de backup y restauración;
- todas las invariantes y criterios de aceptación pasan.

---

## 22. Decisiones finales

1. El kernel comienza como un único servicio modular.
2. Tiene una sola base PostgreSQL propia.
3. Redis no es fuente de verdad.
4. Se usa broker durable, no Redis Pub/Sub.
5. Los consumidores no comparten Prisma.
6. Los servicios externos guardan IDs y snapshots.
7. Los cargos institucionales y roles técnicos son conceptos distintos.
8. `Appointment` reemplaza todos los flags de presidencia.
9. La autorización se basa en persona, permiso, alcance y período.
10. El registro de módulos administra metadatos; no ejecuta código externo.
11. El kernel no se modifica para agregar Meetings, Events u otros módulos.
12. Toda extensibilidad pública empieza por contratos versionados.

Esta especificación constituye el contrato base para comenzar la implementación del nuevo sistema.
