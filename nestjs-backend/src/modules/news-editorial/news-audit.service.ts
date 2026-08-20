import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class NewsAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    event: string,
    message: string,
    meta?: { articleId?: string; metadata?: Prisma.InputJsonValue },
  ) {
    return this.prisma.newsAuditLog.create({
      data: {
        event,
        message,
        articleId: meta?.articleId,
        metadata: meta?.metadata,
      },
    });
  }

  async list(limit = 100, articleId?: string) {
    return this.prisma.newsAuditLog.findMany({
      where: articleId ? { articleId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(200, Math.max(1, limit)),
    });
  }
}
