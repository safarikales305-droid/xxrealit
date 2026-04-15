import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { anyPublicListingWhere } from '../properties/property-listing-scope';
import {
  serializeProperty,
  type PropertyViewerAccess,
} from '../properties/properties.serializer';
import { UpsertBrokerReviewDto } from './dto/upsert-broker-review.dto';

function listingInclude(viewerId?: string) {
  return viewerId
    ? {
        media: { orderBy: { sortOrder: 'asc' as const } },
        _count: { select: { likes: true } },
        user: { select: { id: true, city: true } },
        likes: {
          where: { userId: viewerId },
          select: { id: true },
          take: 1,
        },
      }
    : {
        media: { orderBy: { sortOrder: 'asc' as const } },
        _count: { select: { likes: true } },
        user: { select: { id: true, city: true } },
      };
}

@Injectable()
export class BrokersService {
  constructor(private readonly prisma: PrismaService) {}

  private async viewerAccess(
    viewerId?: string,
  ): Promise<PropertyViewerAccess | undefined> {
    if (!viewerId) return undefined;
    const u = await this.prisma.user.findUnique({
      where: { id: viewerId },
      select: { role: true, isPremiumBroker: true },
    });
    if (!u) return undefined;
    return {
      role: u.role,
      isPremiumBroker: Boolean(u.isPremiumBroker),
      isAdmin: u.role === UserRole.ADMIN,
    };
  }

  async recomputeBrokerReviewStats(brokerId: string) {
    const agg = await this.prisma.brokerReview.aggregate({
      where: { brokerId, isVisible: true },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await this.prisma.user.update({
      where: { id: brokerId },
      data: {
        brokerReviewAverage: Number(agg._avg.rating ?? 0),
        brokerReviewCount: agg._count._all,
      },
    });
  }

  async listPublicDirectory() {
    const rows = await this.prisma.user.findMany({
      where: {
        role: {
          in: [
            UserRole.AGENT,
            UserRole.COMPANY,
            UserRole.AGENCY,
            UserRole.FINANCIAL_ADVISOR,
            UserRole.INVESTOR,
          ],
        },
        isPublicBrokerProfile: true,
        brokerProfileSlug: { not: null },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        avatar: true,
        bio: true,
        brokerProfileSlug: true,
        brokerOfficeName: true,
        brokerRegionLabel: true,
        brokerReviewAverage: true,
        brokerReviewCount: true,
        allowBrokerReviews: true,
      },
    });
    return rows.map((b) => ({
      slug: b.brokerProfileSlug as string,
      name: b.name,
      avatarUrl: b.avatar,
      officeName: b.brokerOfficeName,
      regionLabel: b.brokerRegionLabel,
      bioExcerpt: (b.bio ?? '').trim().slice(0, 160),
      ratingAverage: b.allowBrokerReviews ? b.brokerReviewAverage : null,
      ratingCount: b.allowBrokerReviews ? b.brokerReviewCount : null,
    }));
  }

  async getPublicBySlug(slug: string, viewerId?: string) {
    const broker = await this.prisma.user.findFirst({
      where: {
        brokerProfileSlug: slug,
        role: {
          in: [
            UserRole.AGENT,
            UserRole.COMPANY,
            UserRole.AGENCY,
            UserRole.FINANCIAL_ADVISOR,
            UserRole.INVESTOR,
          ],
        },
        isPublicBrokerProfile: true,
      },
      select: {
        id: true,
        name: true,
        avatar: true,
        coverImage: true,
        bio: true,
        brokerProfileSlug: true,
        brokerOfficeName: true,
        brokerRegionLabel: true,
        brokerWeb: true,
        brokerPhonePublic: true,
        brokerEmailPublic: true,
        brokerSpecialization: true,
        allowBrokerReviews: true,
        brokerReviewAverage: true,
        brokerReviewCount: true,
      },
    });
    if (!broker) {
      throw new NotFoundException('Veřejný profesionální profil nebyl nalezen.');
    }

    const access = await this.viewerAccess(viewerId);
    const listingRows = await this.prisma.property.findMany({
      where: { userId: broker.id, ...anyPublicListingWhere },
      orderBy: { createdAt: 'desc' },
      include: listingInclude(viewerId),
    });
    const listings = listingRows.map((r) =>
      serializeProperty(
        {
          ...r,
          likes: 'likes' in r && Array.isArray(r.likes) ? r.likes : [],
          _count: r._count,
          user: r.user,
        },
        viewerId,
        access,
      ),
    );

    let myReview: {
      id: string;
      rating: number;
      reviewText: string;
      createdAt: string;
      updatedAt: string;
    } | null = null;
    let reviews: Array<{
      id: string;
      rating: number;
      reviewText: string;
      createdAt: string;
      updatedAt: string;
      author: { name: string | null; avatar: string | null };
    }> = [];

    if (broker.allowBrokerReviews) {
      if (viewerId) {
        const mine = await this.prisma.brokerReview.findUnique({
          where: {
            brokerId_authorId: { brokerId: broker.id, authorId: viewerId },
          },
        });
        if (mine) {
          myReview = {
            id: mine.id,
            rating: mine.rating,
            reviewText: mine.reviewText,
            createdAt: mine.createdAt.toISOString(),
            updatedAt: mine.updatedAt.toISOString(),
          };
        }
      }
      const revRows = await this.prisma.brokerReview.findMany({
        where: { brokerId: broker.id, isVisible: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          rating: true,
          reviewText: true,
          createdAt: true,
          updatedAt: true,
          author: { select: { name: true, avatar: true } },
        },
      });
      reviews = revRows.map((x) => ({
        id: x.id,
        rating: x.rating,
        reviewText: x.reviewText,
        createdAt: x.createdAt.toISOString(),
        updatedAt: x.updatedAt.toISOString(),
        author: {
          name: x.author.name,
          avatar: x.author.avatar,
        },
      }));
    }

    return {
      broker: {
        id: broker.id,
        slug: broker.brokerProfileSlug,
        name: broker.name,
        avatarUrl: broker.avatar,
        coverImageUrl: broker.coverImage,
        bio: broker.bio,
        officeName: broker.brokerOfficeName,
        regionLabel: broker.brokerRegionLabel,
        specialization: broker.brokerSpecialization,
        web: broker.brokerWeb,
        phonePublic: broker.brokerPhonePublic,
        emailPublic: broker.brokerEmailPublic,
        allowBrokerReviews: broker.allowBrokerReviews,
        ratingAverage: broker.allowBrokerReviews ? broker.brokerReviewAverage : null,
        ratingCount: broker.allowBrokerReviews ? broker.brokerReviewCount : null,
      },
      listings,
      reviews,
      myReview,
    };
  }

  async upsertReview(brokerId: string, authorId: string, dto: UpsertBrokerReviewDto) {
    if (brokerId === authorId) {
      throw new BadRequestException('Nemůžete hodnotit sám sebe.');
    }
    const broker = await this.prisma.user.findUnique({
      where: { id: brokerId },
      select: { role: true, allowBrokerReviews: true },
    });
    const reviewableRoles: UserRole[] = [
      UserRole.AGENT,
      UserRole.COMPANY,
      UserRole.AGENCY,
      UserRole.FINANCIAL_ADVISOR,
      UserRole.INVESTOR,
    ];
    if (!broker || !reviewableRoles.includes(broker.role)) {
      throw new NotFoundException('Profesionální profil nebyl nalezen.');
    }
    if (!broker.allowBrokerReviews) {
      throw new ForbiddenException('Tento makléř nepřijímá hodnocení.');
    }
    const text = (dto.reviewText ?? '').trim();
    if (text.length > 0 && text.length < 10) {
      throw new BadRequestException('Text recenze musí mít alespoň 10 znaků.');
    }
    await this.prisma.brokerReview.upsert({
      where: {
        brokerId_authorId: { brokerId, authorId },
      },
      create: {
        brokerId,
        authorId,
        rating: dto.rating,
        reviewText: text,
      },
      update: {
        rating: dto.rating,
        reviewText: text,
      },
    });
    await this.recomputeBrokerReviewStats(brokerId);
    return { ok: true };
  }
}
