-- CreateEnum
CREATE TYPE "PostSource" AS ENUM ('INTERNAL', 'FACEBOOK');

-- CreateEnum
CREATE TYPE "FacebookImportStatus" AS ENUM ('IDLE', 'RUNNING', 'OK', 'ERROR');

-- AlterTable User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "facebookUrl" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "facebookImportEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "facebookLastSyncAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "facebookImportStatus" "FacebookImportStatus" NOT NULL DEFAULT 'IDLE';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "facebookImportError" TEXT;

-- AlterTable Post
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "source" "PostSource" NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "facebookExternalId" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Post_facebookExternalId_key" ON "Post"("facebookExternalId");
CREATE INDEX IF NOT EXISTS "Post_source_createdAt_idx" ON "Post"("source", "createdAt");

UPDATE "Post" SET "source" = 'FACEBOOK' WHERE "isFacebookPagePost" = true AND "source" = 'INTERNAL';

-- CreateTable
CREATE TABLE IF NOT EXISTS "FacebookUrlImportLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacebookUrlImportLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FacebookUrlImportLog_userId_createdAt_idx" ON "FacebookUrlImportLog"("userId", "createdAt");

ALTER TABLE "FacebookUrlImportLog" DROP CONSTRAINT IF EXISTS "FacebookUrlImportLog_userId_fkey";
ALTER TABLE "FacebookUrlImportLog" ADD CONSTRAINT "FacebookUrlImportLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
