ALTER TABLE "SocialPublishSchedule" ADD COLUMN IF NOT EXISTS "lastPublishedAt" TIMESTAMPTZ;

ALTER TABLE "SocialPublishLog" ADD COLUMN IF NOT EXISTS "scheduleId" TEXT;

CREATE INDEX IF NOT EXISTS "SocialPublishLog_scheduleId_idx" ON "SocialPublishLog"("scheduleId");

DO $$ BEGIN
  ALTER TABLE "SocialPublishLog"
    ADD CONSTRAINT "SocialPublishLog_scheduleId_fkey"
    FOREIGN KEY ("scheduleId") REFERENCES "SocialPublishSchedule"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SocialPublishSchedulerLog" (
  "id" TEXT NOT NULL,
  "checkedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" TEXT NOT NULL DEFAULT 'cron',
  "dueCount" INTEGER NOT NULL DEFAULT 0,
  "publishedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "details" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialPublishSchedulerLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SocialPublishSchedulerLog_checkedAt_idx" ON "SocialPublishSchedulerLog"("checkedAt");
