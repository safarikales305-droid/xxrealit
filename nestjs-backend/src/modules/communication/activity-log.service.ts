import {
  ActivityLogCategory,
  Prisma,
} from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ActivityLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: {
    category: ActivityLogCategory;
    userId?: string | null;
    targetUserId?: string | null;
    listingId?: string | null;
    message: string;
    metadata?: Record<string, unknown> | null;
  }) {
    return this.prisma.activityLog.create({
      data: {
        category: input.category,
        userId: input.userId ?? null,
        targetUserId: input.targetUserId ?? null,
        listingId: input.listingId ?? null,
        message: input.message.slice(0, 4000),
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  async listAdmin(filters: {
    category?: ActivityLogCategory;
    userId?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: Prisma.ActivityLogWhereInput = {};
    if (filters.category) where.category = filters.category;
    if (filters.userId) where.userId = filters.userId;

    const [rows, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(filters.limit ?? 50, 200),
        skip: filters.offset ?? 0,
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
          targetUser: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return {
      total,
      items: rows.map((r) => ({
        id: r.id,
        category: r.category,
        message: r.message,
        metadata: r.metadata,
        listingId: r.listingId,
        createdAt: r.createdAt.toISOString(),
        user: r.user,
        targetUser: r.targetUser,
      })),
    };
  }
}
