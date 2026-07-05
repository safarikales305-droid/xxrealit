import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class MetaCatalogLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    eventType: string,
    message?: string,
    opts?: { propertyId?: string; details?: Record<string, unknown> },
  ) {
    await this.prisma.metaCatalogLog.create({
      data: {
        eventType,
        message: message ?? null,
        propertyId: opts?.propertyId ?? null,
        details: opts?.details
          ? (JSON.parse(JSON.stringify(opts.details)) as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }

  async listRecent(take = 100) {
    return this.prisma.metaCatalogLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(500, Math.max(1, take)),
    });
  }
}
