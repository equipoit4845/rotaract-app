-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('DISTRICT', 'CLUB', 'OTHER');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'ON_LEAVE', 'INACTIVE', 'GRADUATED', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "MembershipTransitionType" AS ENUM ('CREATED', 'ACTIVATED', 'LEAVE_STARTED', 'LEAVE_ENDED', 'DEACTIVATED', 'GRADUATED', 'TRANSFERRED_OUT', 'TRANSFERRED_IN', 'REACTIVATED');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('NOMINATED', 'ELECTED', 'ACTIVE', 'ENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('PLATFORM', 'ORGANIZATION', 'ORGANIZATION_TREE');

-- CreateEnum
CREATE TYPE "AssignmentEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('REQUESTED', 'ACCEPTED_BY_DESTINATION', 'CONFIRMED_BY_ORIGIN', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ModuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED', 'DISABLED');

-- CreateEnum
CREATE TYPE "InstallationStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SERVICE', 'SYSTEM');

-- DropTable
DROP TABLE "KernelBootstrap";

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "displayName" TEXT,
    "primaryEmail" TEXT,
    "phone" TEXT,
    "birthDate" DATE,
    "avatarUrl" TEXT,
    "externalReference" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAccount" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER',
    "emailVerifiedAt" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "UserAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountSession" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,

    CONSTRAINT "AccountSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "type" "OrganizationType" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'DRAFT',
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Cordoba',
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "memberNumber" TEXT,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "joinedAt" TIMESTAMP(3),
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipTransition" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "type" "MembershipTransitionType" NOT NULL,
    "fromStatus" "MembershipStatus",
    "toStatus" "MembershipStatus" NOT NULL,
    "reasonText" TEXT,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstitutionalPeriod" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "InstitutionalPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionDefinition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "resourceType" TEXT,
    "moduleId" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionDefinition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "organizationType" "OrganizationType" NOT NULL,
    "ownerOrganizationId" TEXT,
    "editPermissionCode" TEXT NOT NULL DEFAULT 'kernel.position.manage',
    "defaultRoleCode" TEXT,
    "isSingletonPerPeriod" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PositionDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "positionDefinitionId" TEXT NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'NOMINATED',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleDefinition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "moduleId" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleDefinitionId" TEXT NOT NULL,
    "permissionDefinitionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleDefinitionId","permissionDefinitionId")
);

-- CreateTable
CREATE TABLE "RoleAssignment" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "roleDefinitionId" TEXT NOT NULL,
    "effect" "AssignmentEffect" NOT NULL DEFAULT 'ALLOW',
    "scopeType" "ScopeType" NOT NULL,
    "organizationId" TEXT,
    "periodId" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "sourceAppointmentId" TEXT,

    CONSTRAINT "RoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipApplication" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requesterPersonId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "message" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipTransfer" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "fromOrganizationId" TEXT NOT NULL,
    "toOrganizationId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountInvitation" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL,
    "contractVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "ModuleStatus" NOT NULL DEFAULT 'DRAFT',
    "manifest" JSONB NOT NULL,
    "configurationSchema" JSONB,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleInstallation" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "InstallationStatus" NOT NULL DEFAULT 'PENDING',
    "configuration" JSONB,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "actorScope" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "lockedUntil" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventVersion" INTEGER NOT NULL DEFAULT 1,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "aggregateVersion" INTEGER NOT NULL,
    "tenantId" TEXT,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "correlationId" TEXT,
    "causationId" TEXT,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AggregateVersion" (
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AggregateVersion_pkey" PRIMARY KEY ("aggregateType","aggregateId")
);

-- CreateTable
CREATE TABLE "KernelAuditLog" (
    "id" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "organizationId" TEXT,
    "result" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "traceId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KernelAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Person_primaryEmail_idx" ON "Person"("primaryEmail");

-- CreateIndex
CREATE INDEX "Person_lastName_firstName_idx" ON "Person"("lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_personId_key" ON "UserAccount"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_emailNormalized_key" ON "UserAccount"("emailNormalized");

-- CreateIndex
CREATE INDEX "UserAccount_status_idx" ON "UserAccount"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AccountSession_refreshTokenHash_key" ON "AccountSession"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "AccountSession_accountId_revokedAt_idx" ON "AccountSession"("accountId", "revokedAt");

-- CreateIndex
CREATE INDEX "AccountSession_expiresAt_idx" ON "AccountSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_code_key" ON "Organization"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_parentId_idx" ON "Organization"("parentId");

-- CreateIndex
CREATE INDEX "Organization_type_status_idx" ON "Organization"("type", "status");

-- CreateIndex
CREATE INDEX "OrganizationMembership_organizationId_status_idx" ON "OrganizationMembership"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_personId_key" ON "OrganizationMembership"("organizationId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_memberNumber_key" ON "OrganizationMembership"("organizationId", "memberNumber");

-- CreateIndex
CREATE INDEX "MembershipTransition_membershipId_effectiveAt_idx" ON "MembershipTransition"("membershipId", "effectiveAt");

-- CreateIndex
CREATE INDEX "InstitutionalPeriod_organizationId_status_idx" ON "InstitutionalPeriod"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionalPeriod_organizationId_code_key" ON "InstitutionalPeriod"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionalPeriod_organizationId_sequence_key" ON "InstitutionalPeriod"("organizationId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionDefinition_code_key" ON "PermissionDefinition"("code");

-- CreateIndex
CREATE INDEX "PermissionDefinition_namespace_idx" ON "PermissionDefinition"("namespace");

-- CreateIndex
CREATE UNIQUE INDEX "PositionDefinition_code_key" ON "PositionDefinition"("code");

-- CreateIndex
CREATE INDEX "PositionDefinition_ownerOrganizationId_organizationType_idx" ON "PositionDefinition"("ownerOrganizationId", "organizationType");

-- CreateIndex
CREATE INDEX "Appointment_organizationId_periodId_status_idx" ON "Appointment"("organizationId", "periodId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RoleDefinition_code_key" ON "RoleDefinition"("code");

-- CreateIndex
CREATE INDEX "RoleAssignment_personId_revokedAt_idx" ON "RoleAssignment"("personId", "revokedAt");

-- CreateIndex
CREATE INDEX "MembershipTransfer_membershipId_status_idx" ON "MembershipTransfer"("membershipId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AccountInvitation_tokenHash_key" ON "AccountInvitation"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleInstallation_moduleId_organizationId_key" ON "ModuleInstallation"("moduleId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_key_operation_actorScope_key" ON "IdempotencyKey"("key", "operation", "actorScope");

-- CreateIndex
CREATE INDEX "OutboxMessage_status_nextAttemptAt_idx" ON "OutboxMessage"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "UserAccount" ADD CONSTRAINT "UserAccount_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountSession" ADD CONSTRAINT "AccountSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipTransition" ADD CONSTRAINT "MembershipTransition_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrganizationMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitutionalPeriod" ADD CONSTRAINT "InstitutionalPeriod_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionDefinition" ADD CONSTRAINT "PositionDefinition_ownerOrganizationId_fkey" FOREIGN KEY ("ownerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrganizationMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "InstitutionalPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_positionDefinitionId_fkey" FOREIGN KEY ("positionDefinitionId") REFERENCES "PositionDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleDefinitionId_fkey" FOREIGN KEY ("roleDefinitionId") REFERENCES "RoleDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionDefinitionId_fkey" FOREIGN KEY ("permissionDefinitionId") REFERENCES "PermissionDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_roleDefinitionId_fkey" FOREIGN KEY ("roleDefinitionId") REFERENCES "RoleDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "InstitutionalPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleInstallation" ADD CONSTRAINT "ModuleInstallation_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "ModuleDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleInstallation" ADD CONSTRAINT "ModuleInstallation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Invariantes no expresables por Prisma.
ALTER TABLE "InstitutionalPeriod" ADD CONSTRAINT "period_dates_valid" CHECK (
  "startDate" < "endDate" AND EXTRACT(MONTH FROM "startDate") = 7
  AND EXTRACT(DAY FROM "startDate") = 1
  AND "endDate" = ("startDate" + INTERVAL '1 year' - INTERVAL '1 day')::date
);
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "role_assignment_dates_valid" CHECK ("validUntil" IS NULL OR "validFrom" < "validUntil");
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "role_assignment_scope_valid" CHECK (("scopeType" = 'PLATFORM' AND "organizationId" IS NULL) OR ("scopeType" IN ('ORGANIZATION', 'ORGANIZATION_TREE') AND "organizationId" IS NOT NULL));
ALTER TABLE "MembershipTransfer" ADD CONSTRAINT "transfer_organizations_different" CHECK ("fromOrganizationId" <> "toOrganizationId");
CREATE UNIQUE INDEX "period_one_active_per_organization" ON "InstitutionalPeriod" ("organizationId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "application_one_open" ON "MembershipApplication" ("organizationId", "requesterPersonId") WHERE "status" IN ('DRAFT', 'SUBMITTED');
CREATE UNIQUE INDEX "transfer_one_open" ON "MembershipTransfer" ("membershipId") WHERE "status" IN ('REQUESTED', 'ACCEPTED_BY_DESTINATION', 'CONFIRMED_BY_ORIGIN');
