import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { SEED_DEMO_VIDEO_MP4 } from '../../database/seed.constants';
import { PrismaService } from '../../database/prisma.service';
import { ShortsViewsAutopilotService } from './shorts-views-autopilot.service';
import {
  classicPublicListingWhere,
  publicShortPropertyWhere,
} from '../properties/property-listing-scope';
import { publiclyVisiblePropertyWhere } from '../properties/property-public-visibility';
import {
  serializeProperty,
  type PropertyViewerAccess,
} from '../properties/properties.serializer';

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
  private readonly log = new Logger(FeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly _autoViewsAutopilot: ShortsViewsAutopilotService,
  ) {}

  async getPersonalizedForUser(viewerId: string) {
    const viewer = await this.prisma.user.findUnique({
      where: { id: viewerId },
      select: {
        id: true,
        city: true,
        role: true,
        isPremiumBroker: true,
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

    const access: PropertyViewerAccess = {
      role: viewer.role,
      isPremiumBroker: Boolean(viewer.isPremiumBroker),
      isAdmin: viewer.role === UserRole.ADMIN,
    };

    return scored.map((s) =>
      serializeProperty(
        {
          ...s.row,
          likes: 'likes' in s.row ? s.row.likes : [],
        },
        viewerId,
        access,
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
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: 40,
      include: {
        media: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { likes: true } },
        user: { select: { id: true, city: true } },
      },
    });

    const sorted = [...rows].sort((a, b) => {
      const pa = a.publishedAt?.getTime() ?? 0;
      const pb = b.publishedAt?.getTime() ?? 0;
      if (pb !== pa) return pb - pa;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const withVideoUrl = sorted.filter((r) => (r.videoUrl ?? '').trim().length > 0).length;
    const withVideoMedia = sorted.filter((r) =>
      r.media.some((m) => m.type === 'video'),
    ).length;
    this.log.log(
      `[feed/shorts] DB rows=${sorted.length} (videoUrl=${withVideoUrl}, mediaVideo=${withVideoMedia}) listingType=SHORTS+approved+visible`,
    );

    const serialized = sorted.map((r) =>
      serializeProperty(
        { ...r, likes: [] as { id: string }[] },
        undefined,
      ),
    );

    if (serialized.length > 0) {
      const sample = serialized.slice(0, 3).map((x) => ({
        id: x.id,
        publishedAt: x.publishedAt,
        createdAt: x.createdAt,
      }));
      this.log.log(`[feed/shorts] response sample: ${JSON.stringify(sample)}`);
    } else {
      this.log.warn('[feed/shorts] serialized list is empty (check Property.approved, listingType, videoUrl/media)');
    }

    if (
      serialized.length === 0 &&
      process.env.SHORTS_FEED_FALLBACK_DEMO === '1'
    ) {
      this.log.warn(
        '[feed/shorts] empty result — SHORTS_FEED_FALLBACK_DEMO=1, attaching 1 demo clip',
      );
      return [
        {
          id: 'demo-shorts-feed-placeholder',
          title: 'Ukázka shorts — přidejte schválené video inzeráty',
          description:
            'Toto je dočasná ukázka, dokud v databázi nejsou veřejné shorts inzeráty. Vypněte env SHORTS_FEED_FALLBACK_DEMO.',
          price: 0,
          currency: 'CZK',
          type: 'prodej',
          offerType: 'prodej',
          propertyType: 'byt',
          subType: '',
          address: '',
          city: '—',
          location: '—',
          area: null,
          landArea: null,
          floor: null,
          totalFloors: null,
          condition: null,
          construction: null,
          ownership: null,
          energyLabel: null,
          equipment: null,
          parking: false,
          cellar: false,
          images: [],
          imageUrl: null,
          videoUrl: SEED_DEMO_VIDEO_MP4,
          media: [
            {
              id: 'demo-shorts-feed-placeholder-video',
              url: SEED_DEMO_VIDEO_MP4,
              type: 'video',
              order: 0,
              sortOrder: 0,
            },
          ],
          isOwnerListing: false,
          ownerContactConsent: false,
          region: '',
          district: '',
          directContactVisible: true,
          contactName: '',
          contactPhone: '',
          contactEmail: '',
          approved: true,
          createdAt: new Date().toISOString(),
          userId: 'demo',
          ownerCity: null,
          likeCount: 0,
          liked: false,
          listingType: 'SHORTS',
          derivedFromPropertyId: null,
        },
      ];
    }

    return serialized;
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
