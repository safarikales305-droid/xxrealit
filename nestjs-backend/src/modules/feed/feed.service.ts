import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  classicPublicListingWhere,
  publicShortPropertyWhere,
} from '../properties/property-listing-scope';
import { publiclyVisiblePropertyWhere } from '../properties/property-public-visibility';
import { serializeProperty } from '../properties/properties.serializer';

function normCity(c: string | null | undefined): string {
  return (c ?? '').trim().toLowerCase();
}

function isPublicMediaUrl(url: string | null | undefined): boolean {
  const v = (url ?? '').trim();
  return /^https?:\/\//i.test(v);
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
        following: { select: { followingId: true } },
      },
    });
    if (!viewer) {
      throw new NotFoundException('User not found');
    }

    const followingIds = new Set(viewer.following.map((f) => f.followingId));
    const refPrice =
      (await this.computeReferencePrice(viewerId, followingIds)) ?? 5_000_000;

    const rows = await this.prisma.property.findMany({
      where: classicPublicListingWhere,
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

  /**
   * Shorts = jen schválené inzeráty s videem (`publicShortPropertyWhere`: PropertyMedia
   * typu video nebo neprázdné `videoUrl`).
   */
  async listShorts() {
    const rows = await this.prisma.property.findMany({
      where: publicShortPropertyWhere,
      orderBy: { createdAt: 'desc' },
      include: {
        media: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { likes: true } },
        user: { select: { id: true, city: true } },
      },
    });

    const withVideoUrl = rows.filter((r) => (r.videoUrl ?? '').trim().length > 0).length;
    const withVideoMedia = rows.filter((r) =>
      r.media.some((m) => m.type === 'video'),
    ).length;
    console.log(
      `[FeedService.listShorts] total=${rows.length} nonEmptyVideoUrl=${withVideoUrl} hasVideoMedia=${withVideoMedia}`,
    );

    return rows.map((r) =>
      serializeProperty(
        { ...r, likes: [] as { id: string }[] },
        undefined,
      ),
    );
  }

  /** Social feed posts (Facebook-style), not listing shorts. */
  async listPosts() {
    const rows = await this.prisma.post.findMany({
      where: {
        OR: [
          { media: { some: { type: 'image' } } },
          { media: { none: { type: 'video' } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        media: {
          orderBy: { order: 'asc' },
        },
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
    return rows
      .map((p) => ({
        ...p,
        media: p.media.filter((m) => isPublicMediaUrl(m.url)),
      }))
      .filter((p) => p.media.length > 0)
      .map((p) => {
        console.log('[feed/posts]', p.id, p.media);
        return p;
      });
  }

  async listProperties() {
    const rows = await this.prisma.property.findMany({
      where: classicPublicListingWhere,
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
      where: {
        userId: viewerId,
        approved: true,
        ...publiclyVisiblePropertyWhere(),
      },
      select: { price: true },
      take: 20,
    });
    if (mine.length > 0) {
      return mine.reduce((a, b) => a + b.price, 0) / mine.length;
    }

    const ids = [...followingIds];
    if (ids.length === 0) return null;

    const followed = await this.prisma.property.findMany({
      where: {
        userId: { in: ids },
        approved: true,
        ...publiclyVisiblePropertyWhere(),
      },
      select: { price: true },
      take: 40,
    });
    if (followed.length === 0) return null;
    return followed.reduce((a, b) => a + b.price, 0) / followed.length;
  }
}
