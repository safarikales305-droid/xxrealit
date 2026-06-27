-- Portal worker CRM extension

ALTER TYPE "ClientPreregistrationStatus" ADD VALUE IF NOT EXISTS 'NEEDS_CONTACT';

CREATE TYPE "WorkerClientNoteType" AS ENUM (
  'PHONE_CALL',
  'WHATSAPP',
  'EMAIL',
  'AGREED',
  'UNREACHABLE',
  'INTEREST',
  'REJECTED',
  'OTHER'
);

CREATE TYPE "WorkerClientAuditAction" AS ENUM (
  'CLIENT_CREATED',
  'WHATSAPP_SENT',
  'EMAIL_SENT',
  'REGISTRATION_COMPLETED',
  'BONUS_GRANTED',
  'CREDIT_TOPUP',
  'COMMISSION_CREATED',
  'STATUS_CHANGED',
  'NOTE_ADDED',
  'REMINDER_SENT'
);

ALTER TABLE "ClientPreregistration" ADD COLUMN IF NOT EXISTS "firstName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ClientPreregistration" ADD COLUMN IF NOT EXISTS "lastName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ClientPreregistration" ADD COLUMN IF NOT EXISTS "company" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ClientPreregistration" ADD COLUMN IF NOT EXISTS "whatsappPhone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ClientPreregistration" ADD COLUMN IF NOT EXISTS "ico" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ClientPreregistration" ADD COLUMN IF NOT EXISTS "reminder24hSentAt" TIMESTAMP(3);
ALTER TABLE "ClientPreregistration" ADD COLUMN IF NOT EXISTS "reminder72hSentAt" TIMESTAMP(3);
ALTER TABLE "ClientPreregistration" ADD COLUMN IF NOT EXISTS "lastWhatsappAt" TIMESTAMP(3);
ALTER TABLE "ClientPreregistration" ADD COLUMN IF NOT EXISTS "lastEmailAt" TIMESTAMP(3);
ALTER TABLE "ClientPreregistration" ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ClientPreregistration_phone_idx" ON "ClientPreregistration"("phone");
CREATE INDEX IF NOT EXISTS "ClientPreregistration_whatsappPhone_idx" ON "ClientPreregistration"("whatsappPhone");

CREATE TABLE IF NOT EXISTS "WorkerProfile" (
    "userId" TEXT NOT NULL,
    "commissionPercent" INTEGER,
    "maxBonusPerClient" INTEGER NOT NULL DEFAULT 3000,
    "adminNotes" TEXT,
    "permissions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerProfile_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE IF NOT EXISTS "WorkerClientNote" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "preregistrationId" TEXT,
    "clientUserId" TEXT,
    "noteType" "WorkerClientNoteType" NOT NULL DEFAULT 'OTHER',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerClientNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkerClientAuditLog" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "preregistrationId" TEXT,
    "clientUserId" TEXT,
    "action" "WorkerClientAuditAction" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerClientAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WorkerClientNote_workerId_createdAt_idx" ON "WorkerClientNote"("workerId", "createdAt");
CREATE INDEX IF NOT EXISTS "WorkerClientNote_preregistrationId_idx" ON "WorkerClientNote"("preregistrationId");
CREATE INDEX IF NOT EXISTS "WorkerClientNote_clientUserId_idx" ON "WorkerClientNote"("clientUserId");

CREATE INDEX IF NOT EXISTS "WorkerClientAuditLog_workerId_createdAt_idx" ON "WorkerClientAuditLog"("workerId", "createdAt");
CREATE INDEX IF NOT EXISTS "WorkerClientAuditLog_preregistrationId_idx" ON "WorkerClientAuditLog"("preregistrationId");
CREATE INDEX IF NOT EXISTS "WorkerClientAuditLog_clientUserId_idx" ON "WorkerClientAuditLog"("clientUserId");
CREATE INDEX IF NOT EXISTS "WorkerClientAuditLog_action_idx" ON "WorkerClientAuditLog"("action");

ALTER TABLE "WorkerProfile" ADD CONSTRAINT "WorkerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkerClientNote" ADD CONSTRAINT "WorkerClientNote_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerClientNote" ADD CONSTRAINT "WorkerClientNote_preregistrationId_fkey" FOREIGN KEY ("preregistrationId") REFERENCES "ClientPreregistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkerClientAuditLog" ADD CONSTRAINT "WorkerClientAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkerClientAuditLog" ADD CONSTRAINT "WorkerClientAuditLog_preregistrationId_fkey" FOREIGN KEY ("preregistrationId") REFERENCES "ClientPreregistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
