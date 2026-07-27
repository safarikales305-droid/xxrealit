ALTER TABLE "AiSalesProspect" ADD COLUMN IF NOT EXISTS "analysisStartedAt" TIMESTAMP(3);
ALTER TABLE "AiSalesProspect" ADD COLUMN IF NOT EXISTS "analysisFailedAt" TIMESTAMP(3);
ALTER TABLE "AiSalesProspect" ADD COLUMN IF NOT EXISTS "analysisErrorCode" TEXT;
ALTER TABLE "AiSalesProspect" ADD COLUMN IF NOT EXISTS "analysisErrorMessage" TEXT;
