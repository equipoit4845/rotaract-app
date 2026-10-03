-- E12.1: status page (docs/19-operations-e12.md). Probes, 90-day daily
-- summaries, incidents and maintenances. Purely additive: nothing existing
-- changes, so the running API keeps working while this is applied.

-- CreateEnum
CREATE TYPE "StatusCheckResult" AS ENUM ('UP', 'DEGRADED', 'DOWN');

-- CreateEnum
CREATE TYPE "StatusIncidentKind" AS ENUM ('INCIDENT', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "StatusIncidentImpact" AS ENUM ('MINOR', 'MAJOR', 'CRITICAL', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "StatusIncidentState" AS ENUM ('INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "StatusCheck" (
    "id" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "result" "StatusCheckResult" NOT NULL,
    "latencyMs" INTEGER,
    "detail" TEXT,
    "bucket" TIMESTAMP(3) NOT NULL,
    "inMaintenance" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusDailySummary" (
    "component" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "up" INTEGER NOT NULL DEFAULT 0,
    "degraded" INTEGER NOT NULL DEFAULT 0,
    "down" INTEGER NOT NULL DEFAULT 0,
    "maintenance" INTEGER NOT NULL DEFAULT 0,
    "latencySumMs" BIGINT NOT NULL DEFAULT 0,
    "latencyCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusDailySummary_pkey" PRIMARY KEY ("component","day")
);

-- CreateTable
CREATE TABLE "StatusIncident" (
    "id" TEXT NOT NULL,
    "kind" "StatusIncidentKind" NOT NULL,
    "title" TEXT NOT NULL,
    "impact" "StatusIncidentImpact" NOT NULL,
    "state" "StatusIncidentState" NOT NULL,
    "components" TEXT[],
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatusIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusIncidentUpdate" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "state" "StatusIncidentState" NOT NULL,
    "message" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusIncidentUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatusCheck_checkedAt_idx" ON "StatusCheck"("checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StatusCheck_component_bucket_key" ON "StatusCheck"("component", "bucket");

-- CreateIndex
CREATE INDEX "StatusDailySummary_day_idx" ON "StatusDailySummary"("day");

-- CreateIndex
CREATE INDEX "StatusIncident_state_idx" ON "StatusIncident"("state");

-- CreateIndex
CREATE INDEX "StatusIncident_createdAt_idx" ON "StatusIncident"("createdAt");

-- CreateIndex
CREATE INDEX "StatusIncident_scheduledStart_idx" ON "StatusIncident"("scheduledStart");

-- CreateIndex
CREATE INDEX "StatusIncidentUpdate_incidentId_createdAt_idx" ON "StatusIncidentUpdate"("incidentId", "createdAt");

-- AddForeignKey
ALTER TABLE "StatusIncidentUpdate" ADD CONSTRAINT "StatusIncidentUpdate_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "StatusIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Permission to announce incidents and maintenances. Granted to the district
-- RDR role here as well as in prisma/seed.ts, so it works in production
-- without re-running the seed. SUPERADMIN passes through the bypass.
INSERT INTO "PermissionDefinition" ("id", "code", "namespace", "name", "isSystem", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'kernel.status.manage', 'kernel', 'Publicar incidentes y mantenimientos', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleDefinitionId", "permissionDefinitionId")
SELECT r."id", p."id"
FROM "RoleDefinition" r, "PermissionDefinition" p
WHERE r."code" = 'DISTRICT_RDR' AND p."code" = 'kernel.status.manage'
ON CONFLICT DO NOTHING;
