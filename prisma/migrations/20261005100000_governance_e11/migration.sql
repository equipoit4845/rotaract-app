-- E11 — data governance (docs/18-data-governance.md).
--   E11.1 app review by the RDR (checklist), E11.2 per-person access history,
--   E11.3 per-app quotas (columns; counters live in Redis), E11.4 the
--   district's app catalog in the members' panel.
-- Backward compatible: only new columns (with defaults) and new tables. Every
-- app that exists when this runs becomes APPROVED with its current scopes, so
-- the apps already in production keep working untouched.

-- CreateEnum
CREATE TYPE "DeveloperAppReviewStatus" AS ENUM ('IN_REVIEW', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "DeveloperApp" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "privacyPolicyUrl" TEXT,
ADD COLUMN     "purpose" TEXT,
ADD COLUMN     "quotaPerDay" INTEGER,
ADD COLUMN     "quotaPerMinute" INTEGER,
ADD COLUMN     "reviewStatus" "DeveloperAppReviewStatus" NOT NULL DEFAULT 'IN_REVIEW',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "testAccountEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "DeveloperAppReview" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "checklist" JSONB,
    "reason" TEXT,
    "actorPersonId" TEXT,
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeveloperAppReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonAppAccess" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "details" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonAppAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeveloperAppListing" (
    "appId" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "displayName" TEXT NOT NULL,
    "shortDescription" TEXT,
    "icon" TEXT,
    "launchUrl" TEXT NOT NULL,
    "audiences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "positionCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "displayOrder" INTEGER NOT NULL DEFAULT 100,
    "publishedAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeveloperAppListing_pkey" PRIMARY KEY ("appId")
);

-- CreateIndex
CREATE INDEX "DeveloperAppReview_appId_createdAt_idx" ON "DeveloperAppReview"("appId", "createdAt");

-- CreateIndex
CREATE INDEX "PersonAppAccess_personId_appId_createdAt_idx" ON "PersonAppAccess"("personId", "appId", "createdAt");

-- CreateIndex
CREATE INDEX "PersonAppAccess_createdAt_idx" ON "PersonAppAccess"("createdAt");

-- CreateIndex
CREATE INDEX "DeveloperAppListing_published_displayOrder_idx" ON "DeveloperAppListing"("published", "displayOrder");

-- CreateIndex
CREATE INDEX "DeveloperApp_reviewStatus_idx" ON "DeveloperApp"("reviewStatus");

-- AddForeignKey
ALTER TABLE "DeveloperAppReview" ADD CONSTRAINT "DeveloperAppReview_appId_fkey" FOREIGN KEY ("appId") REFERENCES "DeveloperApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeveloperAppListing" ADD CONSTRAINT "DeveloperAppListing_appId_fkey" FOREIGN KEY ("appId") REFERENCES "DeveloperApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Apps that exist today were registered before the review existed: they are
-- approved as they are (rule 1 of the E11/E12 contract).
UPDATE "DeveloperApp"
SET "reviewStatus" = 'APPROVED',
    "approvedScopes" = "scopes",
    "approvedAt" = CURRENT_TIMESTAMP,
    "reviewedAt" = CURRENT_TIMESTAMP;

INSERT INTO "DeveloperAppReview" ("id", "appId", "kind", "reason", "scopes", "createdAt")
SELECT 'rev_' || replace(gen_random_uuid()::text, '-', ''), "id", 'AUTO_APPROVED',
       'Aprobada automáticamente: ya estaba registrada cuando empezó la revisión de apps (E11).',
       "scopes", CURRENT_TIMESTAMP
FROM "DeveloperApp";

-- kernel.app.review for the district RDR, so production does not depend on
-- re-running the seed (which does the same, idempotently).
INSERT INTO "PermissionDefinition" ("id", "code", "namespace", "name", "isSystem", "createdAt", "updatedAt")
VALUES ('perm_' || replace(gen_random_uuid()::text, '-', ''), 'kernel.app.review', 'kernel',
        'Revisar, aprobar y publicar apps', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleDefinitionId", "permissionDefinitionId", "createdAt")
SELECT r."id", p."id", CURRENT_TIMESTAMP
FROM "RoleDefinition" r, "PermissionDefinition" p
WHERE r."code" = 'DISTRICT_RDR' AND p."code" = 'kernel.app.review'
ON CONFLICT DO NOTHING;
