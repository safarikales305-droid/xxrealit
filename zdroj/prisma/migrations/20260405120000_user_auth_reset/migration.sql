-- User model: role default, reset fields, drop legacy name
ALTER TABLE "User" DROP COLUMN IF EXISTS "name";

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resetToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resetExpires" TIMESTAMP(3);

DROP INDEX IF EXISTS "User_resetToken_key";
CREATE UNIQUE INDEX "User_resetToken_key" ON "User"("resetToken");

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'PRIVATE_SELLER';
