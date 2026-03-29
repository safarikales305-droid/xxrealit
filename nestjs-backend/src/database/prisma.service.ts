import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ensureDevSeedIfEmpty } from './dev-seed';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
    await ensureDevSeedIfEmpty(this);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
