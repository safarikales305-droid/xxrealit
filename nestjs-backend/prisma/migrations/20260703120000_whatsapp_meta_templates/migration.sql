CREATE TABLE "WhatsAppMetaTemplate" (
  "id" TEXT NOT NULL,
  "metaTemplateId" TEXT NOT NULL,
  "templateName" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "bodyText" TEXT NOT NULL,
  "variablesCount" INTEGER NOT NULL DEFAULT 0,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WhatsAppMetaTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppMetaTemplate_metaTemplateId_key"
  ON "WhatsAppMetaTemplate"("metaTemplateId");

CREATE INDEX "WhatsAppMetaTemplate_status_idx"
  ON "WhatsAppMetaTemplate"("status");

CREATE INDEX "WhatsAppMetaTemplate_templateName_language_idx"
  ON "WhatsAppMetaTemplate"("templateName", "language");

ALTER TABLE "WhatsAppMarketingCampaign"
  ADD COLUMN IF NOT EXISTS "waMetaTemplateId" TEXT;
