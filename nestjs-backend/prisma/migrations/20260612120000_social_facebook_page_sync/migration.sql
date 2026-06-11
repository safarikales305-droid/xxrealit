-- CreateEnum
CREATE TYPE "SocialProvider" AS ENUM ('FACEBOOK');

-- CreateTable
CREATE TABLE "SocialConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "SocialProvider" NOT NULL DEFAULT 'FACEBOOK',
    "facebookUserId" TEXT,
    "pageId" TEXT,
    "pageName" TEXT,
    "pageAccessToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialFacebookOAuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userAccessToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialFacebookOAuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialImportedPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "provider" "SocialProvider" NOT NULL DEFAULT 'FACEBOOK',
    "providerPostId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "message" TEXT,
    "imageUrl" TEXT,
    "videoUrl" TEXT,
    "importedPostId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialImportedPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialConnection_userId_provider_key" ON "SocialConnection"("userId", "provider");

-- CreateIndex
CREATE INDEX "SocialConnection_provider_syncEnabled_idx" ON "SocialConnection"("provider", "syncEnabled");

-- CreateIndex
CREATE INDEX "SocialConnection_pageId_idx" ON "SocialConnection"("pageId");

-- CreateIndex
CREATE INDEX "SocialFacebookOAuthSession_userId_idx" ON "SocialFacebookOAuthSession"("userId");

-- CreateIndex
CREATE INDEX "SocialFacebookOAuthSession_expiresAt_idx" ON "SocialFacebookOAuthSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialImportedPost_provider_providerPostId_key" ON "SocialImportedPost"("provider", "providerPostId");

-- CreateIndex
CREATE INDEX "SocialImportedPost_connectionId_createdAt_idx" ON "SocialImportedPost"("connectionId", "createdAt");

-- CreateIndex
CREATE INDEX "SocialImportedPost_userId_idx" ON "SocialImportedPost"("userId");

-- AddForeignKey
ALTER TABLE "SocialConnection" ADD CONSTRAINT "SocialConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialFacebookOAuthSession" ADD CONSTRAINT "SocialFacebookOAuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialImportedPost" ADD CONSTRAINT "SocialImportedPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialImportedPost" ADD CONSTRAINT "SocialImportedPost_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "SocialConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
