-- Company review company notification status

CREATE TYPE "CompanyReviewCompanyNotificationStatus" AS ENUM (
  'NOT_SENT',
  'QUEUED',
  'SENT',
  'FAILED',
  'NO_COMPANY_EMAIL'
);

ALTER TABLE "CompanyReview"
  ADD COLUMN IF NOT EXISTS "companyNotificationStatus" "CompanyReviewCompanyNotificationStatus" NOT NULL DEFAULT 'NOT_SENT';
