import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { serializeProperty } from '../properties/properties.serializer';

function normCity(c: string | null | undefined): string {
  return (c ?? '').trim().toLowerCase();
}

function scoreProperty(
  p: {
    userId: string;
    city: string;
    price: number;
    user: { city: string | null };
  },
  viewerCity: string | null,
  followingIds: Set<string>,
  refPrice: number,
): number {
  let s = 0;
  if (followingIds.has(p.userId)) s += 100;
  if (viewerCity && normCity(p.city) === normCity(viewerCity)) s += 30;
  if (viewerCity && normCity(p.user.city) === normCity(viewerCity)) {
    s += 15;
  }
  if (refPrice > 0) {
    const ratio = p.price / refPrice;
    if (ratio >= 0.65 && ratio <= 1.35) s += 25;
  }
  s += Math.random() * 10;
  return s;
}

@Injectable()
export class FeedService {
  constructor(private readonly prisma: PrismaService) {}

  async getPersonalizedForUser(viewerId: string) {
    const viewer = await this.prisma.user.findUnique({
      where: { id: viewerId },
      select: {
        id: true,
        city: true,
        role: true,
        following: { select: { followingId: true } },
      },
    });
    if (!viewer) {
      throw new NotFoundException('User not found');
    }

    const admin = viewer.role === UserRole.ADMIN;

    const followingIds = new Set(viewer.following.map((f) => f.followingId));
    const refPrice =
      (await this.computeReferencePrice(viewerId, followingIds)) ?? 5_000_000;

    const rows = await this.prisma.property.findMany({
      where: admin ? undefined : { approved: true },
      include: {
        _count: { select: { likes: true } },
        user: { select: { id: true, city: true } },
        likes: {
          where: { userId: viewerId },
          select: { id: true },
          take: 1,
        },
      },
    });

    const scored = rows.map((p) => ({
      row: p,
      score: scoreProperty(p, viewer.city, followingIds, refPrice),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.map((s) =>
      serializeProperty(
        {
          ...s.row,
          likes: 'likes' in s.row ? s.row.likes : [],
        },
        viewerId,
      ),
    );
  }

  /** Shorts / reels: only real-estate listing videos + legacy Video rows — no user social post videos. */
  async listShorts() {
    const [properties, videos] = await Promise.all([
      this.prisma.property.findMany({
        where: {
          approved: true,
          videoUrl: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              role: true,
            },
          },
        },
      }),
      this.prisma.video.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              role: true,
            },
          },
        },
      }),
    ]);

    const fromProperties = properties
      .filter((p) => (p.videoUrl ?? '').trim().length > 0)
      .map((p) => ({
        id: `property-${p.id}`,
        url: p.videoUrl,
        videoUrl: p.videoUrl,
        description: p.title ?? null,
        content: p.title ?? null,
        createdAt: p.createdAt,
        user: p.user,
        source: 'property',
        type: 'short',
        propertyId: p.id,
      }));

    const fromVideos = videos.map((v) => ({
      id: v.id,
      url: v.url,
      videoUrl: v.url,
      description: v.description ?? null,
      content: v.description ?? null,
      createdAt: v.createdAt,
      user: v.user,
      source: 'video',
      type: 'short',
    }));

    return [...fromProperties, ...fromVideos].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  /** Social feed posts (Facebook-style), not listing shorts. */
  async listPosts() {
    return this.prisma.post.findMany({
      where: {
        type: { in: ['post', 'text', 'video', 'image'] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            favorites: true,
            comments: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
          },
        },
      },
    });
  }

  async listProperties() {
    const rows = await this.prisma.property.findMany({
      where: { approved: true },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { likes: true } },
        user: { select: { id: true, city: true } },
      },
    });
    return rows.map((r) => serializeProperty({ ...r, likes: [] }, undefined));
  }

  private async computeReferencePrice(
    viewerId: string,
    followingIds: Set<string>,
  ): Promise<number | null> {
    const mine = await this.prisma.property.findMany({
      where: { userId: viewerId },
      select: { price: true },
      take: 20,
    });
    if (mine.length > 0) {
      return mine.reduce((a, b) => a + b.price, 0) / mine.length;
    }

    const ids = [...followingIds];
    if (ids.length === 0) return null;

    const followed = await this.prisma.property.findMany({
      where: { userId: { in: ids } },
      select: { price: true },
      take: 40,
    });
    if (followed.length === 0) return null;
    return followed.reduce((a, b) => a + b.price, 0) / followed.length;
  }
}
