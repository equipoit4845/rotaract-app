-- E9.3: request logs of developer apps (docs/16-developer-portal.md).
-- No foreign key to DeveloperApp: rows are written asynchronously in batches
-- and expire after 30 days (RequestLogRetentionService).
CREATE TABLE "DeveloperAppRequestLog" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "problemCode" TEXT,
    "problemType" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "traceId" TEXT NOT NULL,
    "clientIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeveloperAppRequestLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeveloperAppRequestLog_appId_createdAt_idx" ON "DeveloperAppRequestLog"("appId", "createdAt");
CREATE INDEX "DeveloperAppRequestLog_appId_traceId_idx" ON "DeveloperAppRequestLog"("appId", "traceId");
CREATE INDEX "DeveloperAppRequestLog_createdAt_idx" ON "DeveloperAppRequestLog"("createdAt");
