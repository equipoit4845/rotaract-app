-- Cargos declarados por módulos (manifiesto `positions[]`): origen del
-- cargo, archivo al desinstalar y los permisos que una instalación sumó a
-- cargos existentes (`grants[]`). Purely additive.

-- AlterTable
ALTER TABLE "PositionDefinition" ADD COLUMN "moduleId" TEXT,
ADD COLUMN "moduleTemplateKey" TEXT,
ADD COLUMN "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ModuleInstallation" ADD COLUMN "grantedPermissions" JSONB;

-- CreateIndex
CREATE INDEX "PositionDefinition_moduleId_idx" ON "PositionDefinition"("moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "PositionDefinition_ownerOrganizationId_moduleId_moduleTempl_key" ON "PositionDefinition"("ownerOrganizationId", "moduleId", "moduleTemplateKey");
