-- CreateEnum
CREATE TYPE "CompanyReviewAuthorNotificationStatus" AS ENUM ('NOT_SENT', 'QUEUED', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "CompanyReview" ADD COLUMN "companyNotificationSentAt" TIMESTAMP(3);
ALTER TABLE "CompanyReview" ADD COLUMN "companyNotificationError" TEXT;
ALTER TABLE "CompanyReview" ADD COLUMN "companyNotificationMessageId" TEXT;
ALTER TABLE "CompanyReview" ADD COLUMN "companyNotificationEmailUsed" TEXT;
ALTER TABLE "CompanyReview" ADD COLUMN "authorNotificationStatus" "CompanyReviewAuthorNotificationStatus" NOT NULL DEFAULT 'NOT_SENT';
ALTER TABLE "CompanyReview" ADD COLUMN "authorNotificationSentAt" TIMESTAMP(3);
ALTER TABLE "CompanyReview" ADD COLUMN "authorNotificationError" TEXT;
ALTER TABLE "CompanyReview" ADD COLUMN "facebookIntroPublished" BOOLEAN NOT NULL DEFAULT false;
