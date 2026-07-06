import { PrismaClient } from '@prisma/client';
import { ensureMetaCenterCampaignTables } from '../src/database/ensure-meta-center-schema';

async function main() {
  const prisma = new PrismaClient();
  try {
    const ready = await ensureMetaCenterCampaignTables(prisma);
    console.log(ready ? 'MetaMarketingCampaignDraft: OK' : 'MetaMarketingCampaignDraft: FAILED');
    process.exit(ready ? 0 : 1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
