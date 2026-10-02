-- E7: events and signed webhooks (docs/13-events-and-webhooks.md)
-- CreateEnum
CREATE TYPE "WebhookEndpointStatus" AS ENUM ('ENABLED', 'DISABLED');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "OutboxMessage" ADD COLUMN     "webhooksFannedOutAt" TIMESTAMP(3);

-- Events recorded before webhooks existed had no subscriber: mark them as
-- already fanned out so the dispatcher starts from this deploy onwards
-- instead of scanning (and possibly delivering) the whole history.
UPDATE "OutboxMessage" SET "webhooksFannedOutAt" = CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "eventTypes" TEXT[],
    "status" "WebhookEndpointStatus" NOT NULL DEFAULT 'ENABLED',
    "disabledReason" TEXT,
    "disabledAt" TIMESTAMP(3),
    "secretEnc" TEXT NOT NULL,
    "secretHint" TEXT NOT NULL,
    "previousSecretEnc" TEXT,
    "previousSecretExpiresAt" TIMESTAMP(3),
    "secretRotatedAt" TIMESTAMP(3),
    "failingSince" TIMESTAMP(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "outboxMessageId" TEXT,
    "organizationId" TEXT,
    "payload" TEXT NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "retryUntil" TIMESTAMP(3) NOT NULL,
    "lockedUntil" TIMESTAMP(3),
    "firstAttemptAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "lastResponseStatus" INTEGER,
    "lastResponseBody" TEXT,
    "lastLatencyMs" INTEGER,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookEndpoint_appId_idx" ON "WebhookEndpoint"("appId");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_status_idx" ON "WebhookEndpoint"("status");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx" ON "WebhookDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_endpointId_createdAt_idx" ON "WebhookDelivery"("endpointId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDelivery_endpointId_eventId_key" ON "WebhookDelivery"("endpointId", "eventId");

-- CreateIndex
CREATE INDEX "OutboxMessage_webhooksFannedOutAt_occurredAt_idx" ON "OutboxMessage"("webhooksFannedOutAt", "occurredAt");

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_appId_fkey" FOREIGN KEY ("appId") REFERENCES "DeveloperApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

