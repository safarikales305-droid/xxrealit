import { Injectable, NotFoundException } from '@nestjs/common';
import { SocialIntroPropertyType } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class SocialIntroVideoService {
  constructor(private readonly prisma: PrismaService) {}

  async listAll() {
    return this.prisma.socialIntroVideo.findMany({
      orderBy: [{ propertyType: 'asc' }, { priority: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async findActiveForPropertyType(
    propertyType: SocialIntroPropertyType,
  ): Promise<{ id: string; videoUrl: string; durationSeconds: number | null; title: string } | null> {
    const row = await this.prisma.socialIntroVideo.findFirst({
      where: { propertyType, active: true },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        title: true,
        videoUrl: true,
        durationSeconds: true,
      },
    });
    if (!row?.videoUrl?.trim()) return null;
    return row;
  }

  async create(input: {
    title: string;
    propertyType: SocialIntroPropertyType;
    videoUrl: string;
    thumbnailUrl?: string | null;
    durationSeconds?: number | null;
    active?: boolean;
    priority?: number;
  }) {
    return this.prisma.socialIntroVideo.create({
      data: {
        title: input.title.trim(),
        propertyType: input.propertyType,
        videoUrl: input.videoUrl.trim(),
        thumbnailUrl: input.thumbnailUrl?.trim() || null,
        durationSeconds: input.durationSeconds ?? null,
        active: input.active !== false,
        priority: Number.isFinite(input.priority) ? Math.trunc(input.priority!) : 0,
      },
    });
  }

  async update(
    id: string,
    input: Partial<{
      title: string;
      propertyType: SocialIntroPropertyType;
      videoUrl: string;
      thumbnailUrl: string | null;
      durationSeconds: number | null;
      active: boolean;
      priority: number;
    }>,
  ) {
    await this.assertExists(id);
    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = input.title.trim();
    if (input.propertyType !== undefined) data.propertyType = input.propertyType;
    if (input.videoUrl !== undefined) data.videoUrl = input.videoUrl.trim();
    if (input.thumbnailUrl !== undefined) data.thumbnailUrl = input.thumbnailUrl?.trim() || null;
    if (input.durationSeconds !== undefined) data.durationSeconds = input.durationSeconds;
    if (input.active !== undefined) data.active = input.active;
    if (input.priority !== undefined) data.priority = Math.trunc(input.priority);
    return this.prisma.socialIntroVideo.update({ where: { id }, data });
  }

  async delete(id: string) {
    await this.assertExists(id);
    await this.prisma.socialIntroVideo.delete({ where: { id } });
    return { ok: true };
  }

  private async assertExists(id: string) {
    const row = await this.prisma.socialIntroVideo.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('Úvodní video nenalezeno.');
  }
}
