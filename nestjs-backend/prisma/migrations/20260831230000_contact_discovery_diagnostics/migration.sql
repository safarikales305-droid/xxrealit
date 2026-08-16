-- Contact discovery diagnostics on job items

ALTER TABLE "CompanyContactDiscoveryJob"
  ADD COLUMN IF NOT EXISTS "notFoundReason" TEXT,
  ADD COLUMN IF NOT EXISTS "diagnosticsJson" JSONB;
