-- E8: modules from a manifest (docs/15-modules.md)

-- AlterTable: the developer app that owns a module and the organization it
-- is governed from. Plain columns (no foreign keys), like the Prisma model.
ALTER TABLE "ModuleDefinition" ADD COLUMN     "developerAppId" TEXT,
ADD COLUMN     "ownerOrganizationId" TEXT;

-- CreateIndex
CREATE INDEX "ModuleDefinition_developerAppId_idx" ON "ModuleDefinition"("developerAppId");

-- CreateIndex
CREATE INDEX "ModuleDefinition_ownerOrganizationId_idx" ON "ModuleDefinition"("ownerOrganizationId");

-- The RDR registers modules for the district (the seed grants the same).
-- kernel.module.register stays district-only: a club position can never
-- receive it (DISTRICT_ONLY_PERMISSIONS).
INSERT INTO "RolePermission" ("roleDefinitionId", "permissionDefinitionId", "createdAt")
SELECT r."id", p."id", CURRENT_TIMESTAMP
FROM "RoleDefinition" r, "PermissionDefinition" p
WHERE r."code" = 'DISTRICT_RDR' AND p."code" = 'kernel.module.register'
ON CONFLICT DO NOTHING;

-- The placeholder "meetings" module created by earlier seeds has no v1
-- manifest and was never installed: take it out of the catalog. The real
-- module ("reuniones") is registered from its manifest.
UPDATE "ModuleDefinition" m
SET "status" = 'DISABLED', "updatedAt" = CURRENT_TIMESTAMP
WHERE m."id" = 'meetings'
  AND (m."manifest" ->> 'contractVersion') IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ModuleInstallation" i WHERE i."moduleId" = m."id"
  );
