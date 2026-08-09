-- Facebook media refresh — stabilní ID + cache metadata

ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "facebookVideoId" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "facebookPageId" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "lastMediaRefreshAt" TIMESTAMP(3);

ALTER TABLE "FacebookSyncedPost" ADD COLUMN IF NOT EXISTS "facebookVideoId" TEXT;
ALTER TABLE "FacebookSyncedPost" ADD COLUMN IF NOT EXISTS "lastMediaRefreshAt" TIMESTAMP(3);
ALTER TABLE "FacebookSyncedPost" ADD COLUMN IF NOT EXISTS "lastSyncedAt" TIMESTAMP(3);

ALTER TABLE "FacebookPageConnection" ADD COLUMN IF NOT EXISTS "connectionStatus" TEXT NOT NULL DEFAULT 'CONNECTED';
ALTER TABLE "FacebookPageConnection" ADD COLUMN IF NOT EXISTS "tokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "FacebookPageConnection" ADD COLUMN IF NOT EXISTS "tokenLastCheckedAt" TIMESTAMP(3);
ALTER TABLE "FacebookPageConnection" ADD COLUMN IF NOT EXISTS "lastSuccessfulSyncAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Post_facebookVideoId_idx" ON "Post"("facebookVideoId");
CREATE INDEX IF NOT EXISTS "Post_source_lastMediaRefreshAt_idx" ON "Post"("source", "lastMediaRefreshAt");
CREATE INDEX IF NOT EXISTS "FacebookSyncedPost_pageConnectionId_lastMediaRefreshAt_idx" ON "FacebookSyncedPost"("pageConnectionId", "lastMediaRefreshAt");
