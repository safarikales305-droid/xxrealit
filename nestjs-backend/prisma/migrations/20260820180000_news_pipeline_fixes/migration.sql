-- News editorial pipeline: source diagnostics, image diagnostics, worker pause, ERROR health

ALTER TYPE "NewsSourceHealth" ADD VALUE IF NOT EXISTS 'ERROR';

ALTER TYPE "NewsWorkerJobStatus" ADD VALUE IF NOT EXISTS 'PAUSED';

ALTER TABLE "NewsSource"
  ADD COLUMN IF NOT EXISTS "lastHttpStatus" INTEGER,
  ADD COLUMN IF NOT EXISTS "lastItemCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "lastContentType" TEXT;

ALTER TABLE "NewsArticle"
  ADD COLUMN IF NOT EXISTS "imageDiagnosticsJson" JSONB;

-- Fix legacy broken CNB RSS URL in existing databases
UPDATE "NewsSource"
SET
  url = 'https://www.cnb.cz/cs/.content/rss-feed/rss-feed_tz.rss',
  name = 'ČNB – Tiskové zprávy',
  note = 'Úrokové sazby, měnová politika — oficiální RSS ČNB',
  health = 'ACTIVE',
  "failureCount" = 0,
  "lastError" = NULL
WHERE url = 'https://www.cnb.cz/cs/novinky-a-media/rss/';

UPDATE "NewsSource"
SET
  url = 'https://www.hypoindex.cz/feed',
  enabled = true,
  note = 'Hypoteční sazby a trh — ověřený RSS feed'
WHERE url = 'https://www.czso.cz/csu/czso/rss';

UPDATE "NewsSource"
SET
  url = 'https://www.e15.cz/rss/bydleni',
  name = 'E15 – Bydlení',
  enabled = true,
  note = 'Bydlení, reality a stavebnictví'
WHERE url = 'https://mmr.gov.cz/rss';
