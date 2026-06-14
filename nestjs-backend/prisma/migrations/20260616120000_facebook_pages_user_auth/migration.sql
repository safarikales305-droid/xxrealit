CREATE TABLE IF NOT EXISTS "FacebookPagesUserAuth" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "facebookUserId" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacebookPagesUserAuth_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FacebookPagesUserAuth_userId_key" ON "FacebookPagesUserAuth"("userId");
CREATE INDEX IF NOT EXISTS "FacebookPagesUserAuth_facebookUserId_idx" ON "FacebookPagesUserAuth"("facebookUserId");

DO $$ BEGIN
  ALTER TABLE "FacebookPagesUserAuth" ADD CONSTRAINT "FacebookPagesUserAuth_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
