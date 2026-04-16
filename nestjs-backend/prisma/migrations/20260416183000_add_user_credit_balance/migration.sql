-- Add paid credit balance to user profile
ALTER TABLE "User"
ADD COLUMN "creditBalance" INTEGER NOT NULL DEFAULT 0;
