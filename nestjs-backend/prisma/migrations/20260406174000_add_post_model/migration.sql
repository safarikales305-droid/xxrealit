CREATE TABLE IF NOT EXISTS "public"."Post" (
  "id" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Post_userId_fkey'
  ) THEN
    ALTER TABLE "public"."Post"
      ADD CONSTRAINT "Post_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "public"."User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Post_userId_idx" ON "public"."Post"("userId");
CREATE INDEX IF NOT EXISTS "Post_createdAt_idx" ON "public"."Post"("createdAt");
