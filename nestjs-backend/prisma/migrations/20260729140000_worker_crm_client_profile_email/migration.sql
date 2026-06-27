-- Client preregistration profile fields for worker CRM
ALTER TABLE "ClientPreregistration" ADD COLUMN IF NOT EXISTS "address" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ClientPreregistration" ADD COLUMN IF NOT EXISTS "website" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ClientPreregistration" ADD COLUMN IF NOT EXISTS "activityDescription" TEXT;
ALTER TABLE "ClientPreregistration" ADD COLUMN IF NOT EXISTS "bio" TEXT;
ALTER TABLE "ClientPreregistration" ADD COLUMN IF NOT EXISTS "workerInternalNote" TEXT;

-- Public profile fields on User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "website" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activityDescription" TEXT;

-- Email template category for admin UI
ALTER TABLE "EmailTemplate" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'system';
