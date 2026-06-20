-- User WhatsApp notification preferences for posts
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappNotifyMyUploads" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappNotifyNewPosts" BOOLEAN NOT NULL DEFAULT false;

-- WhatsApp message log extensions for post notifications
ALTER TABLE "WhatsAppMessage" ADD COLUMN IF NOT EXISTS "postId" TEXT;
ALTER TABLE "WhatsAppMessage" ADD COLUMN IF NOT EXISTS "notificationType" TEXT;
ALTER TABLE "WhatsAppMessage" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;

CREATE INDEX IF NOT EXISTS "WhatsAppMessage_postId_idx" ON "WhatsAppMessage"("postId");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_notificationType_idx" ON "WhatsAppMessage"("notificationType");

ALTER TABLE "WhatsAppMessage" DROP CONSTRAINT IF EXISTS "WhatsAppMessage_postId_fkey";
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
