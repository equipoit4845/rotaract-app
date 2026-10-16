-- Membership applications: club chosen at self-registration, and the email
-- notifier's marker on the Outbox. Purely additive.

-- AlterTable
ALTER TABLE "UserAccount" ADD COLUMN "requestedOrganizationId" TEXT,
ADD COLUMN "requestedMessage" TEXT;

-- AlterTable
ALTER TABLE "OutboxMessage" ADD COLUMN "emailsNotifiedAt" TIMESTAMP(3),
ADD COLUMN "emailAttempts" INTEGER NOT NULL DEFAULT 0;

-- Messages written before this notifier existed are not notified now.
UPDATE "OutboxMessage" SET "emailsNotifiedAt" = CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "OutboxMessage_emailsNotifiedAt_eventType_idx" ON "OutboxMessage"("emailsNotifiedAt", "eventType");
