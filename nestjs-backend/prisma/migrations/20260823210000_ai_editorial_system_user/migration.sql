-- AI redakce: systémový uživatel + vazba příspěvku na zdroj
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isSystemUser" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "systemRole" TEXT;

CREATE INDEX IF NOT EXISTS "User_isSystemUser_idx" ON "User"("isSystemUser");

ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "newsSourceId" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "editorialSourceName" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "editorialSourceUrl" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "editorialExternalId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Post_newsSourceId_fkey'
  ) THEN
    ALTER TABLE "Post"
      ADD CONSTRAINT "Post_newsSourceId_fkey"
      FOREIGN KEY ("newsSourceId") REFERENCES "NewsSource"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Post_newsSourceId_idx" ON "Post"("newsSourceId");
