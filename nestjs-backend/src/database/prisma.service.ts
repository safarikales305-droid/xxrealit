import 'dotenv/config';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { ensureDevSeedIfEmpty } from './dev-seed';

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
    await ensureDevSeedIfEmpty(this);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
