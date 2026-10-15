-- AlterTable
ALTER TABLE "Thread" ADD COLUMN     "lastDirection" "Direction",
ADD COLUMN     "trashedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "threadId" TEXT,
    "replyAll" BOOLEAN NOT NULL DEFAULT false,
    "toEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ccEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bccEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Draft_mailboxId_personId_updatedAt_idx" ON "Draft"("mailboxId", "personId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Draft_threadId_personId_idx" ON "Draft"("threadId", "personId");

-- CreateIndex
CREATE INDEX "Thread_trashedAt_idx" ON "Thread"("trashedAt");

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "Mailbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: who wrote each thread's newest message, and when trashed threads
-- went to the Papelera (unknown before this column: counted from now).
UPDATE "Thread" t SET "lastDirection" = m."direction"
FROM (
  SELECT DISTINCT ON ("threadId") "threadId", "direction"
  FROM "Message" ORDER BY "threadId", "at" DESC
) m
WHERE m."threadId" = t."id";

UPDATE "Thread" SET "trashedAt" = CURRENT_TIMESTAMP WHERE "folder" = 'TRASH';
