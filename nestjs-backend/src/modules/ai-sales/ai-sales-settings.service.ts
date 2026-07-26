import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AiSalesSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate() {
    return this.prisma.aiSalesSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });
  }

  async update(patch: Prisma.AiSalesSettingsUpdateInput) {
    await this.getOrCreate();
    return this.prisma.aiSalesSettings.update({
      where: { id: 'default' },
      data: patch,
    });
  }
}
