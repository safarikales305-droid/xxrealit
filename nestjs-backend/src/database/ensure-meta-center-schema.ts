import { Prisma } from '@prisma/client';
import type { PrismaService } from './prisma.service';

export const META_CAMPAIGN_DB_NOT_SYNCED_MESSAGE =
  'Databáze není synchronizována. Je potřeba provést Prisma migrate.';

/** Idempotentní DDL — odpovídá prisma/migrations/20260706220000_ensure_meta_campaign_tables */
const ENSURE_META_CAMPAIGN_TABLES_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS "MetaMarketingCampaignDraft" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "creativeType" TEXT NOT NULL DEFAULT 'catalog_products',
    "targetingMode" TEXT NOT NULL DEFAULT 'map',
    "audienceId" TEXT,
    "creativePayload" JSONB,
    "adAccountId" TEXT,
    "catalogId" TEXT,
    "datasetId" TEXT,
    "propertyType" TEXT,
    "cityName" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "radiusKm" INTEGER,
    "dailyBudgetCzk" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "selectedProductIds" JSONB NOT NULL DEFAULT '[]',
    "metaCampaignId" TEXT,
    "metaAdSetId" TEXT,
    "metaAdId" TEXT,
    "metaProductSetId" TEXT,
    "metaCreativeId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MetaMarketingCampaignDraft_pkey" PRIMARY KEY ("id")
  )`,
  `ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "creativeType" TEXT NOT NULL DEFAULT 'catalog_products'`,
  `ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "targetingMode" TEXT NOT NULL DEFAULT 'map'`,
  `ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "audienceId" TEXT`,
  `ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "creativePayload" JSONB`,
  `ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaProductSetId" TEXT`,
  `ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaCreativeId" TEXT`,
  `CREATE INDEX IF NOT EXISTS "MetaMarketingCampaignDraft_status_idx" ON "MetaMarketingCampaignDraft"("status")`,
  `CREATE INDEX IF NOT EXISTS "MetaMarketingCampaignDraft_createdAt_idx" ON "MetaMarketingCampaignDraft"("createdAt" DESC)`,
  `CREATE TABLE IF NOT EXISTS "MetaRemarketingAudience" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "audienceType" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "estimatedCount" INTEGER,
    "metaEstimate" INTEGER,
    "metaAudienceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "lastSyncedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MetaRemarketingAudience_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "MetaRemarketingAudience_audienceType_idx" ON "MetaRemarketingAudience"("audienceType")`,
  `CREATE INDEX IF NOT EXISTS "MetaRemarketingAudience_status_idx" ON "MetaRemarketingAudience"("status")`,
  `CREATE INDEX IF NOT EXISTS "MetaRemarketingAudience_updatedAt_idx" ON "MetaRemarketingAudience"("updatedAt" DESC)`,
  `ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "campaignsLiveEnabled" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaStatus" TEXT`,
  `ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaEffectiveStatus" TEXT`,
  `ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaInsights" JSONB`,
  `ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaLaunchedAt" TIMESTAMP(3)`,
  `ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaStatusSyncedAt" TIMESTAMP(3)`,
  `CREATE TABLE IF NOT EXISTS "MetaGeoLocation" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "metaKey" TEXT NOT NULL,
    "country" TEXT,
    "region" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MetaGeoLocation_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "MetaGeoLocation_metaKey_key" ON "MetaGeoLocation"("metaKey")`,
  `CREATE INDEX IF NOT EXISTS "MetaGeoLocation_city_idx" ON "MetaGeoLocation"("city")`,
  `ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaGeoKey" TEXT`,
  `ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaGeoCountry" TEXT`,
  `ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaGeoRegion" TEXT`,
  `ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "creativePreviewUrl" TEXT`,
  `ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "previewHtml" TEXT`,
  `ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaLaunchSteps" JSONB`,
  `ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "locationTargetingMode" TEXT NOT NULL DEFAULT 'city'`,
  `ALTER TABLE "MetaMarketingCampaignDraft" ADD COLUMN IF NOT EXISTS "metaLaunchPayloads" JSONB`,
];

function isMissingTableError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
    return true;
  }
  const msg = error instanceof Error ? error.message : String(error);
  return /does not exist/i.test(msg) || /relation.*MetaMarketingCampaignDraft/i.test(msg);
}

async function probeCampaignDraftTable(prisma: PrismaService): Promise<boolean> {
  try {
    await prisma.metaMarketingCampaignDraft.findFirst({ select: { id: true } });
    return true;
  } catch (error) {
    if (!isMissingTableError(error)) {
      console.warn('[DB] MetaMarketingCampaignDraft probe error:', error);
    }
    return false;
  }
}

async function applyEnsureMetaCampaignTablesSql(prisma: PrismaService): Promise<void> {
  for (const sql of ENSURE_META_CAMPAIGN_TABLES_SQL) {
    await prisma.$executeRawUnsafe(sql);
  }
}

/**
 * Ověří tabulku MetaMarketingCampaignDraft; při absenci ji vytvoří idempotentním SQL.
 */
export async function ensureMetaCenterCampaignTables(prisma: PrismaService): Promise<boolean> {
  if (await probeCampaignDraftTable(prisma)) {
    return true;
  }

  console.warn('[DB] MetaMarketingCampaignDraft missing — applying ensure DDL…');
  try {
    await applyEnsureMetaCampaignTablesSql(prisma);
  } catch (err) {
    console.error(
      '[DB] ensure MetaMarketingCampaignDraft DDL failed:',
      err instanceof Error ? err.message : err,
    );
    return false;
  }

  return probeCampaignDraftTable(prisma);
}
