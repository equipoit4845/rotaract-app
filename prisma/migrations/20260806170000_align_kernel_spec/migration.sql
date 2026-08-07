-- AlterTable
ALTER TABLE "AccountInvitation" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "invitedById" TEXT,
ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "revokedById" TEXT;

-- AlterTable
ALTER TABLE "KernelAuditLog" ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "MembershipApplication" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "membershipId" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- AlterTable
ALTER TABLE "MembershipTransfer" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "acceptedById" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedById" TEXT,
ADD COLUMN     "destinationMembershipId" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedById" TEXT,
ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "MembershipTransition" ADD COLUMN     "commandId" TEXT,
ADD COLUMN     "reasonCode" TEXT;

-- AlterTable
ALTER TABLE "ModuleInstallation" ADD COLUMN     "installedById" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "city" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "countryCode" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "foundedAt" DATE,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "region" TEXT;

-- AlterTable
ALTER TABLE "OrganizationMembership" ADD COLUMN     "internalNotes" TEXT;

-- AlterTable
ALTER TABLE "OutboxMessage" ADD COLUMN     "traceId" TEXT;

-- AlterTable
ALTER TABLE "RoleAssignment" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "grantedById" TEXT,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "revokedById" TEXT;

-- AlterTable
ALTER TABLE "UserAccount" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "AccountInvitation_email_status_idx" ON "AccountInvitation"("email", "status");

-- CreateIndex
CREATE INDEX "AccountInvitation_expiresAt_idx" ON "AccountInvitation"("expiresAt");

-- CreateIndex
CREATE INDEX "Appointment_organizationId_periodId_positionDefinitionId_me_idx" ON "Appointment"("organizationId", "periodId", "positionDefinitionId", "membershipId");

-- CreateIndex
CREATE INDEX "Appointment_membershipId_status_idx" ON "Appointment"("membershipId", "status");

-- CreateIndex
CREATE INDEX "Appointment_positionDefinitionId_status_idx" ON "Appointment"("positionDefinitionId", "status");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_accountId_idx" ON "EmailVerificationToken"("accountId");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE INDEX "InstitutionalPeriod_startDate_endDate_idx" ON "InstitutionalPeriod"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "KernelAuditLog_actorId_occurredAt_idx" ON "KernelAuditLog"("actorId", "occurredAt");

-- CreateIndex
CREATE INDEX "KernelAuditLog_resourceType_resourceId_occurredAt_idx" ON "KernelAuditLog"("resourceType", "resourceId", "occurredAt");

-- CreateIndex
CREATE INDEX "KernelAuditLog_organizationId_occurredAt_idx" ON "KernelAuditLog"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "KernelAuditLog_action_occurredAt_idx" ON "KernelAuditLog"("action", "occurredAt");

-- CreateIndex
CREATE INDEX "MembershipApplication_organizationId_status_idx" ON "MembershipApplication"("organizationId", "status");

-- CreateIndex
CREATE INDEX "MembershipApplication_requesterPersonId_status_idx" ON "MembershipApplication"("requesterPersonId", "status");

-- CreateIndex
CREATE INDEX "MembershipTransfer_fromOrganizationId_status_idx" ON "MembershipTransfer"("fromOrganizationId", "status");

-- CreateIndex
CREATE INDEX "MembershipTransfer_toOrganizationId_status_idx" ON "MembershipTransfer"("toOrganizationId", "status");

-- CreateIndex
CREATE INDEX "MembershipTransition_commandId_idx" ON "MembershipTransition"("commandId");

-- CreateIndex
CREATE INDEX "ModuleDefinition_status_idx" ON "ModuleDefinition"("status");

-- CreateIndex
CREATE INDEX "ModuleInstallation_organizationId_status_idx" ON "ModuleInstallation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Organization_name_idx" ON "Organization"("name");

-- CreateIndex
CREATE INDEX "OrganizationMembership_personId_status_idx" ON "OrganizationMembership"("personId", "status");

-- CreateIndex
CREATE INDEX "OutboxMessage_aggregateType_aggregateId_aggregateVersion_idx" ON "OutboxMessage"("aggregateType", "aggregateId", "aggregateVersion");

-- CreateIndex
CREATE INDEX "OutboxMessage_occurredAt_idx" ON "OutboxMessage"("occurredAt");

-- CreateIndex
CREATE INDEX "PasswordResetToken_accountId_idx" ON "PasswordResetToken"("accountId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE INDEX "PermissionDefinition_moduleId_idx" ON "PermissionDefinition"("moduleId");

-- CreateIndex
CREATE INDEX "Person_externalReference_idx" ON "Person"("externalReference");

-- CreateIndex
CREATE INDEX "PositionDefinition_organizationType_idx" ON "PositionDefinition"("organizationType");

-- CreateIndex
CREATE INDEX "PositionDefinition_editPermissionCode_idx" ON "PositionDefinition"("editPermissionCode");

-- CreateIndex
CREATE INDEX "RoleAssignment_organizationId_periodId_idx" ON "RoleAssignment"("organizationId", "periodId");

-- CreateIndex
CREATE INDEX "RoleAssignment_roleDefinitionId_idx" ON "RoleAssignment"("roleDefinitionId");

-- CreateIndex
CREATE INDEX "RoleAssignment_sourceAppointmentId_idx" ON "RoleAssignment"("sourceAppointmentId");

-- CreateIndex
CREATE INDEX "RoleDefinition_moduleId_idx" ON "RoleDefinition"("moduleId");

-- AddForeignKey
ALTER TABLE "PositionDefinition" ADD CONSTRAINT "PositionDefinition_editPermissionCode_fkey" FOREIGN KEY ("editPermissionCode") REFERENCES "PermissionDefinition"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_sourceAppointmentId_fkey" FOREIGN KEY ("sourceAppointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipApplication" ADD CONSTRAINT "MembershipApplication_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipApplication" ADD CONSTRAINT "MembershipApplication_requesterPersonId_fkey" FOREIGN KEY ("requesterPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipApplication" ADD CONSTRAINT "MembershipApplication_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipApplication" ADD CONSTRAINT "MembershipApplication_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrganizationMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipTransfer" ADD CONSTRAINT "MembershipTransfer_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrganizationMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipTransfer" ADD CONSTRAINT "MembershipTransfer_fromOrganizationId_fkey" FOREIGN KEY ("fromOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipTransfer" ADD CONSTRAINT "MembershipTransfer_toOrganizationId_fkey" FOREIGN KEY ("toOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipTransfer" ADD CONSTRAINT "MembershipTransfer_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipTransfer" ADD CONSTRAINT "MembershipTransfer_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipTransfer" ADD CONSTRAINT "MembershipTransfer_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipTransfer" ADD CONSTRAINT "MembershipTransfer_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipTransfer" ADD CONSTRAINT "MembershipTransfer_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountInvitation" ADD CONSTRAINT "AccountInvitation_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrganizationMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountInvitation" ADD CONSTRAINT "AccountInvitation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

