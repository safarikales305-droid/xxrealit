import 'dotenv/config';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { ensureDevSeedIfEmpty } from './dev-seed';
import {
  ensureMetaCenterCampaignTables,
  ensureMetaCenterSettingColumns,
} from './ensure-meta-center-schema';

const dotenvCandidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '..', '.env'),
];

for (const p of dotenvCandidates) {
  if (existsSync(p)) {
    loadDotenv({ path: p, override: false });
  }
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  /** Tabulka MetaMarketingCampaignDraft je dostupná (po migrate / db push). */
  metaCampaignDraftTableReady = false;

  /** Sloupce MetaCenterSetting (adPlacementSettings atd.) jsou synchronizované se schématem. */
  metaCenterSettingColumnsReady = false;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.error(
        '[PrismaService] Missing DATABASE_URL. Checked .env in backend and project root.',
      );
    }

    super({
      datasources: databaseUrl
        ? {
            db: { url: databaseUrl },
          }
        : undefined,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.metaCenterSettingColumnsReady = await ensureMetaCenterSettingColumns(this);
    if (!this.metaCenterSettingColumnsReady) {
      console.warn(
        '[DB] MetaCenterSetting columns not ready — Meta Centrum zobrazí hlášku o nutnosti migrace.',
      );
    }
    this.metaCampaignDraftTableReady = await ensureMetaCenterCampaignTables(this);
    if (!this.metaCampaignDraftTableReady) {
      console.warn(
        '[DB] MetaMarketingCampaignDraft table not ready — kampaně Meta Centra budou vracet chybu synchronizace.',
      );
    }
    if (process.env.NODE_ENV !== 'production') {
      await ensureDevSeedIfEmpty(this);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
