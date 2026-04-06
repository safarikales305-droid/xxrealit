CREATE TABLE IF NOT EXISTS "public"."Video" (
  "id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "description" TEXT,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Video_userId_fkey'
  ) THEN
    ALTER TABLE "public"."Video"
      ADD CONSTRAINT "Video_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "public"."User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Video_userId_idx" ON "public"."Video"("userId");
CREATE INDEX IF NOT EXISTS "Video_createdAt_idx" ON "public"."Video"("createdAt");
