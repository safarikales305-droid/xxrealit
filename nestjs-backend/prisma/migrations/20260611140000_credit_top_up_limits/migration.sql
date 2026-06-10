-- Daily and pending top-up security limits

ALTER TABLE "CreditTopUpSetting" ADD COLUMN "dailyTopUpLimit" INTEGER NOT NULL DEFAULT 2000;
ALTER TABLE "CreditTopUpSetting" ADD COLUMN "pendingTopUpLimit" INTEGER NOT NULL DEFAULT 2000;
