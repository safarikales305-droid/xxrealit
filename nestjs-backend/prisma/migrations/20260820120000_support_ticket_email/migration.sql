-- CreateEnum
CREATE TYPE "SupportTicketEmailDeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'RECEIVED');

-- CreateTable
CREATE TABLE "SupportEmailSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "adminNotifyEmail" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportEmailSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportEmailMailbox" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "replyToEmail" TEXT,
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
    "smtpUser" TEXT NOT NULL,
    "smtpPasswordEncrypted" TEXT NOT NULL,
    "imapHost" TEXT,
    "imapPort" INTEGER,
    "imapSecure" BOOLEAN NOT NULL DEFAULT true,
    "imapUser" TEXT,
    "imapPasswordEncrypted" TEXT,
    "signatureHtml" TEXT NOT NULL DEFAULT '',
    "signatureText" TEXT NOT NULL DEFAULT '',
    "autoReplyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoReplySubject" TEXT,
    "autoReplyHtml" TEXT,
    "autoReplyText" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportEmailMailbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketAttachment_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "SupportTicketMessage" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'web';
ALTER TABLE "SupportTicketMessage" ADD COLUMN "emailMessageId" TEXT;
ALTER TABLE "SupportTicketMessage" ADD COLUMN "emailInReplyTo" TEXT;
ALTER TABLE "SupportTicketMessage" ADD COLUMN "emailReferences" TEXT;
ALTER TABLE "SupportTicketMessage" ADD COLUMN "smtpMessageId" TEXT;
ALTER TABLE "SupportTicketMessage" ADD COLUMN "emailDeliveryStatus" "SupportTicketEmailDeliveryStatus";
ALTER TABLE "SupportTicketMessage" ADD COLUMN "emailSentAt" TIMESTAMP(3);
ALTER TABLE "SupportTicketMessage" ADD COLUMN "emailDeliveredAt" TIMESTAMP(3);
ALTER TABLE "SupportTicketMessage" ADD COLUMN "mailboxId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SupportEmailMailbox_email_key" ON "SupportEmailMailbox"("email");
CREATE INDEX "SupportEmailMailbox_active_sortOrder_idx" ON "SupportEmailMailbox"("active", "sortOrder");
CREATE INDEX "SupportTicketAttachment_messageId_idx" ON "SupportTicketAttachment"("messageId");
CREATE INDEX "SupportTicketMessage_emailMessageId_idx" ON "SupportTicketMessage"("emailMessageId");

-- AddForeignKey
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "SupportEmailMailbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportTicketAttachment" ADD CONSTRAINT "SupportTicketAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "SupportTicketMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
