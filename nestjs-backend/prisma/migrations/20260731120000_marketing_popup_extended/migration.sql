-- Marketing popup extensions + per-user view tracking
ALTER TABLE "MarketingPopup" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "MarketingPopup" ADD COLUMN IF NOT EXISTS "linkUrl" TEXT;
ALTER TABLE "MarketingPopup" ADD COLUMN IF NOT EXISTS "excludeRoles" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MarketingPopup" ADD COLUMN IF NOT EXISTS "profileTriggers" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MarketingPopup" ADD COLUMN IF NOT EXISTS "maxViewsPerUser" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "MarketingPopup" ADD COLUMN IF NOT EXISTS "repeatAfterDays" INTEGER;
ALTER TABLE "MarketingPopup" ADD COLUMN IF NOT EXISTS "displayCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MarketingPopup" ADD COLUMN IF NOT EXISTS "isSystem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MarketingPopup" ADD COLUMN IF NOT EXISTS "variant" TEXT NOT NULL DEFAULT 'modal';
ALTER TABLE "MarketingPopup" ADD COLUMN IF NOT EXISTS "config" JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS "MarketingPopup_slug_key" ON "MarketingPopup"("slug");

CREATE TABLE IF NOT EXISTS "MarketingPopupUserView" (
  "id" TEXT NOT NULL,
  "popupId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "lastShownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dismissedAt" TIMESTAMP(3),
  CONSTRAINT "MarketingPopupUserView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarketingPopupUserView_popupId_userId_key"
  ON "MarketingPopupUserView"("popupId", "userId");
CREATE INDEX IF NOT EXISTS "MarketingPopupUserView_userId_idx"
  ON "MarketingPopupUserView"("userId");

ALTER TABLE "MarketingPopupUserView"
  ADD CONSTRAINT "MarketingPopupUserView_popupId_fkey"
  FOREIGN KEY ("popupId") REFERENCES "MarketingPopup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingPopupUserView"
  ADD CONSTRAINT "MarketingPopupUserView_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
