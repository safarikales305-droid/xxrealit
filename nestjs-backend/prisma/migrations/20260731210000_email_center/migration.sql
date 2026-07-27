-- Email center: central settings, signatures, senders, inbound replies

-- AlterTable EmailLog
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "replyToEmail" TEXT;
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "errorCode" TEXT;
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "bouncedAt" TIMESTAMP(3);
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "repliedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "EmailLog_replyToEmail_createdAt_idx" ON "EmailLog"("replyToEmail", "createdAt");

-- AlterTable EmailTemplate
ALTER TABLE "EmailTemplate" ADD COLUMN IF NOT EXISTS "preheader" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmailTemplate" ADD COLUMN IF NOT EXISTS "variablesJson" JSONB;
ALTER TABLE "EmailTemplate" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable AiSalesSettings
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "replyToEmail" TEXT;
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "defaultSignatureId" TEXT;
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "defaultCtaUrl" TEXT;
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "realSendingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiSalesSettings" ADD COLUMN IF NOT EXISTS "maxRecipientsPerOffer" INTEGER NOT NULL DEFAULT 5;

-- AlterTable AiSalesMessage
ALTER TABLE "AiSalesMessage" ADD COLUMN IF NOT EXISTS "replyToEmail" TEXT;
ALTER TABLE "AiSalesMessage" ADD COLUMN IF NOT EXISTS "signatureId" TEXT;

-- CreateEnum
CREATE TYPE "EmailSignatureType" AS ENUM ('DEFAULT', 'SALES_TEAM', 'SUPPORT', 'ADMINISTRATION', 'AUTOMATIC_SYSTEM', 'INDIVIDUAL');
CREATE TYPE "EmailSenderPurpose" AS ENUM ('DEFAULT', 'SALES', 'SUPPORT', 'BILLING', 'SYSTEM', 'REGISTRATION', 'LEADS', 'CONTACT_FORM');
CREATE TYPE "EmailInboundStatus" AS ENUM ('NEW', 'READ', 'INTERESTED', 'REQUEST_MORE_INFO', 'NOT_INTERESTED', 'UNSUBSCRIBE', 'WRONG_CONTACT', 'AUTO_REPLY', 'SPAM', 'CLOSED');

-- CreateTable EmailSettings
CREATE TABLE "EmailSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "defaultSenderName" TEXT NOT NULL DEFAULT 'XXREALIT',
    "defaultSenderEmail" TEXT NOT NULL DEFAULT 'info@xxrealit.cz',
    "defaultReplyToEmail" TEXT NOT NULL DEFAULT 'xxrealit@email.cz',
    "salesSenderName" TEXT NOT NULL DEFAULT 'XXREALIT obchodní tým',
    "salesSenderEmail" TEXT NOT NULL DEFAULT 'obchod@xxrealit.cz',
    "salesReplyToEmail" TEXT NOT NULL DEFAULT 'xxrealit@email.cz',
    "supportEmail" TEXT NOT NULL DEFAULT 'podpora@xxrealit.cz',
    "footerContactEmail" TEXT NOT NULL DEFAULT 'podpora@xxrealit.cz',
    "billingEmail" TEXT NOT NULL DEFAULT '',
    "leadEmail" TEXT NOT NULL DEFAULT '',
    "registrationEmail" TEXT NOT NULL DEFAULT '',
    "systemNotificationEmail" TEXT NOT NULL DEFAULT '',
    "contactFormEmail" TEXT NOT NULL DEFAULT '',
    "provider" TEXT NOT NULL DEFAULT 'resend',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable EmailSenderIdentity
CREATE TABLE "EmailSenderIdentity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'resend',
    "domain" TEXT NOT NULL DEFAULT '',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "purpose" "EmailSenderPurpose" NOT NULL DEFAULT 'DEFAULT',
    "lastTestAt" TIMESTAMP(3),
    "lastTestSuccess" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSenderIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailSenderIdentity_email_key" ON "EmailSenderIdentity"("email");
CREATE INDEX "EmailSenderIdentity_active_purpose_idx" ON "EmailSenderIdentity"("active", "purpose");

-- CreateTable EmailSignature
CREATE TABLE "EmailSignature" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EmailSignatureType" NOT NULL DEFAULT 'DEFAULT',
    "personName" TEXT NOT NULL DEFAULT '',
    "position" TEXT NOT NULL DEFAULT '',
    "team" TEXT NOT NULL DEFAULT '',
    "company" TEXT NOT NULL DEFAULT 'XXREALIT',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT 'https://www.xxrealit.cz',
    "logoUrl" TEXT NOT NULL DEFAULT '',
    "html" TEXT NOT NULL,
    "plainText" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSignature_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailSignature_type_active_idx" ON "EmailSignature"("type", "active");

-- CreateTable EmailInboundReply
CREATE TABLE "EmailInboundReply" (
    "id" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "replyToEmail" TEXT,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT,
    "bodyHtml" TEXT,
    "attachmentsJson" JSONB,
    "aiSalesMessageId" TEXT,
    "classification" TEXT,
    "status" "EmailInboundStatus" NOT NULL DEFAULT 'NEW',
    "assignedToId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailInboundReply_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailInboundReply_status_receivedAt_idx" ON "EmailInboundReply"("status", "receivedAt");
CREATE INDEX "EmailInboundReply_aiSalesMessageId_idx" ON "EmailInboundReply"("aiSalesMessageId");
CREATE INDEX "EmailInboundReply_replyToEmail_receivedAt_idx" ON "EmailInboundReply"("replyToEmail", "receivedAt");

-- CreateTable EmailSettingsAuditLog
CREATE TABLE "EmailSettingsAuditLog" (
    "id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "changedById" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSettingsAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailSettingsAuditLog_field_createdAt_idx" ON "EmailSettingsAuditLog"("field", "createdAt");
CREATE INDEX "EmailSettingsAuditLog_changedById_createdAt_idx" ON "EmailSettingsAuditLog"("changedById", "createdAt");

-- Seed default EmailSettings (idempotent)
INSERT INTO "EmailSettings" ("id", "updatedAt")
VALUES ('default', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Seed default senders
INSERT INTO "EmailSenderIdentity" ("id", "name", "email", "domain", "purpose", "verified", "active", "updatedAt")
VALUES
  ('seed-default-sender', 'XXREALIT', 'info@xxrealit.cz', 'xxrealit.cz', 'DEFAULT', false, true, CURRENT_TIMESTAMP),
  ('seed-sales-sender', 'XXREALIT obchodní tým', 'obchod@xxrealit.cz', 'xxrealit.cz', 'SALES', false, true, CURRENT_TIMESTAMP),
  ('seed-support-sender', 'XXREALIT podpora', 'podpora@xxrealit.cz', 'xxrealit.cz', 'SUPPORT', false, true, CURRENT_TIMESTAMP)
ON CONFLICT ("email") DO NOTHING;

-- Seed default signatures
INSERT INTO "EmailSignature" ("id", "name", "type", "personName", "team", "company", "email", "html", "plainText", "updatedAt")
VALUES
  (
    'seed-sig-sales',
    'Obchodní tým',
    'SALES_TEAM',
    'Tým XXREALIT',
    'Obchodní tým',
    'XXREALIT',
    'obchod@xxrealit.cz',
    '<p>S pozdravem<br/><strong>Tým XXREALIT</strong><br/>obchod@xxrealit.cz</p>',
    'S pozdravem\nTým XXREALIT\nobchod@xxrealit.cz',
    CURRENT_TIMESTAMP
  ),
  (
    'seed-sig-support',
    'Podpora',
    'SUPPORT',
    'Tým podpory',
    'Podpora',
    'XXREALIT',
    'podpora@xxrealit.cz',
    '<p>S pozdravem<br/><strong>Tým podpory XXREALIT</strong><br/>podpora@xxrealit.cz</p>',
    'S pozdravem\nTým podpory XXREALIT\npodpora@xxrealit.cz',
    CURRENT_TIMESTAMP
  )
ON CONFLICT DO NOTHING;
