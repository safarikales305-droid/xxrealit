-- User.facebookId
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "facebookId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_facebookId_key" ON "User"("facebookId");

-- Post Facebook fields
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "isFacebookPagePost" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "facebookPermalink" TEXT;

-- OAuth session: nullable userId + mode
ALTER TABLE "SocialFacebookOAuthSession" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "SocialFacebookOAuthSession" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'account';
CREATE INDEX IF NOT EXISTS "SocialFacebookOAuthSession_mode_idx" ON "SocialFacebookOAuthSession"("mode");

-- FacebookConnection encrypted token
ALTER TABLE "FacebookConnection" ADD COLUMN IF NOT EXISTS "accessTokenEncrypted" TEXT;
CREATE INDEX IF NOT EXISTS "FacebookConnection_facebookUserId_idx" ON "FacebookConnection"("facebookUserId");

-- FacebookPageConnection
CREATE TABLE IF NOT EXISTS "FacebookPageConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT NOT NULL,
    "pageAccessTokenEncrypted" TEXT NOT NULL,
    "pagePictureUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FacebookPageConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FacebookPageConnection_userId_pageId_key" ON "FacebookPageConnection"("userId", "pageId");
CREATE INDEX IF NOT EXISTS "FacebookPageConnection_userId_idx" ON "FacebookPageConnection"("userId");
CREATE INDEX IF NOT EXISTS "FacebookPageConnection_pageId_idx" ON "FacebookPageConnection"("pageId");
CREATE INDEX IF NOT EXISTS "FacebookPageConnection_isActive_idx" ON "FacebookPageConnection"("isActive");
ALTER TABLE "FacebookPageConnection" DROP CONSTRAINT IF EXISTS "FacebookPageConnection_userId_fkey";
ALTER TABLE "FacebookPageConnection" ADD CONSTRAINT "FacebookPageConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FacebookSyncedPost
CREATE TABLE IF NOT EXISTS "FacebookSyncedPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pageConnectionId" TEXT NOT NULL,
    "facebookPostId" TEXT NOT NULL,
    "message" TEXT,
    "story" TEXT,
    "permalinkUrl" TEXT,
    "fullPictureUrl" TEXT,
    "createdTime" TIMESTAMP(3),
    "rawJson" JSONB,
    "importedPostId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FacebookSyncedPost_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FacebookSyncedPost_facebookPostId_key" ON "FacebookSyncedPost"("facebookPostId");
CREATE INDEX IF NOT EXISTS "FacebookSyncedPost_pageConnectionId_createdAt_idx" ON "FacebookSyncedPost"("pageConnectionId", "createdAt");
CREATE INDEX IF NOT EXISTS "FacebookSyncedPost_userId_idx" ON "FacebookSyncedPost"("userId");
ALTER TABLE "FacebookSyncedPost" DROP CONSTRAINT IF EXISTS "FacebookSyncedPost_userId_fkey";
ALTER TABLE "FacebookSyncedPost" ADD CONSTRAINT "FacebookSyncedPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FacebookSyncedPost" DROP CONSTRAINT IF EXISTS "FacebookSyncedPost_pageConnectionId_fkey";
ALTER TABLE "FacebookSyncedPost" ADD CONSTRAINT "FacebookSyncedPost_pageConnectionId_fkey" FOREIGN KEY ("pageConnectionId") REFERENCES "FacebookPageConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing SocialConnection page data
INSERT INTO "FacebookPageConnection" ("id", "userId", "pageId", "pageName", "pageAccessTokenEncrypted", "pagePictureUrl", "isActive", "lastSyncAt", "lastSyncError", "createdAt", "updatedAt")
SELECT
    sc."id",
    sc."userId",
    sc."pageId",
    COALESCE(sc."pageName", 'Facebook stránka'),
    COALESCE(sc."pageAccessToken", ''),
    sc."facebookPicture",
    COALESCE(sc."syncEnabled", true),
    sc."lastSyncAt",
    sc."lastSyncError",
    sc."createdAt",
    sc."updatedAt"
FROM "SocialConnection" sc
WHERE sc."pageId" IS NOT NULL AND sc."pageAccessToken" IS NOT NULL
ON CONFLICT ("userId", "pageId") DO NOTHING;
