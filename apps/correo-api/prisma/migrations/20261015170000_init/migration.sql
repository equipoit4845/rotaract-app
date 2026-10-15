-- CreateEnum
CREATE TYPE "MailboxKind" AS ENUM ('PERSONAL', 'ROLE');

-- CreateEnum
CREATE TYPE "MailboxStatus" AS ENUM ('ACTIVE', 'READ_ONLY', 'CLOSED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "Folder" AS ENUM ('INBOX', 'ARCHIVE', 'TRASH', 'SPAM');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('RECEIVED', 'QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "WebhookSource" AS ENUM ('KERNEL', 'CLICKMAIL');

-- CreateTable
CREATE TABLE "Mailbox" (
    "id" TEXT NOT NULL,
    "kind" "MailboxKind" NOT NULL,
    "address" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "positionCode" TEXT NOT NULL,
    "clickmailAddressId" TEXT,
    "clickmailSenderId" TEXT,
    "status" "MailboxStatus" NOT NULL DEFAULT 'ACTIVE',
    "clickmailSyncedStatus" "MailboxStatus",
    "closesAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mailbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailboxAssignment" (
    "id" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailboxAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Thread" (
    "id" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "snippet" TEXT NOT NULL DEFAULT '',
    "folder" "Folder" NOT NULL DEFAULT 'INBOX',
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "clickmailInboundId" TEXT,
    "clickmailEmailId" TEXT,
    "messageIdHeader" TEXT,
    "inReplyTo" TEXT,
    "references" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "toEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ccEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bccEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "replyToEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL,
    "text" TEXT,
    "html" TEXT,
    "status" "MessageStatus" NOT NULL,
    "statusDetail" TEXT,
    "spfVerdict" TEXT,
    "dkimVerdict" TEXT,
    "dmarcVerdict" TEXT,
    "spamVerdict" TEXT,
    "sentByPersonId" TEXT,
    "readAt" TIMESTAMP(3),
    "at" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "clickmailAttachmentId" TEXT,
    "filename" TEXT NOT NULL,
    "contentType" TEXT,
    "contentId" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "stored" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookReceipt" (
    "id" TEXT NOT NULL,
    "source" "WebhookSource" NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorPersonId" TEXT,
    "action" TEXT NOT NULL,
    "mailboxId" TEXT,
    "messageId" TEXT,
    "meta" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Mailbox_address_key" ON "Mailbox"("address");

-- CreateIndex
CREATE UNIQUE INDEX "Mailbox_clickmailAddressId_key" ON "Mailbox"("clickmailAddressId");

-- CreateIndex
CREATE UNIQUE INDEX "Mailbox_clickmailSenderId_key" ON "Mailbox"("clickmailSenderId");

-- CreateIndex
CREATE INDEX "Mailbox_kind_positionCode_idx" ON "Mailbox"("kind", "positionCode");

-- CreateIndex
CREATE INDEX "Mailbox_status_closesAt_idx" ON "Mailbox"("status", "closesAt");

-- CreateIndex
CREATE INDEX "MailboxAssignment_personId_status_idx" ON "MailboxAssignment"("personId", "status");

-- CreateIndex
CREATE INDEX "MailboxAssignment_appointmentId_idx" ON "MailboxAssignment"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "MailboxAssignment_mailboxId_appointmentId_key" ON "MailboxAssignment"("mailboxId", "appointmentId");

-- CreateIndex
CREATE INDEX "Thread_mailboxId_folder_lastMessageAt_idx" ON "Thread"("mailboxId", "folder", "lastMessageAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Message_clickmailEmailId_key" ON "Message"("clickmailEmailId");

-- CreateIndex
CREATE INDEX "Message_threadId_at_idx" ON "Message"("threadId", "at");

-- CreateIndex
CREATE INDEX "Message_messageIdHeader_idx" ON "Message"("messageIdHeader");

-- CreateIndex
CREATE UNIQUE INDEX "Message_mailboxId_clickmailInboundId_key" ON "Message"("mailboxId", "clickmailInboundId");

-- CreateIndex
CREATE INDEX "Attachment_messageId_idx" ON "Attachment"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookReceipt_source_eventId_key" ON "WebhookReceipt"("source", "eventId");

-- CreateIndex
CREATE INDEX "AuditEvent_mailboxId_at_idx" ON "AuditEvent"("mailboxId", "at");

-- CreateIndex
CREATE INDEX "AuditEvent_actorPersonId_at_idx" ON "AuditEvent"("actorPersonId", "at");

-- AddForeignKey
ALTER TABLE "MailboxAssignment" ADD CONSTRAINT "MailboxAssignment_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "Mailbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "Mailbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "Mailbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

