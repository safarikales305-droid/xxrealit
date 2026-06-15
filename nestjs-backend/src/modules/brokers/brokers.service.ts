import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { isValidWhatsAppPhone } from '../whatsapp/whatsapp-phone.util';
import { anyPublicListingWhere } from '../properties/property-listing-scope';
import {
  serializeProperty,
  type PropertyViewerAccess,
} from '../properties/properties.serializer';
import { UpsertBrokerReviewDto } from './dto/upsert-broker-review.dto';
import {
  isProfessionalVerified,
  professionalVerificationStatus,
} from './professional-verification.util';
import {
  parseProfessionalDirectoryRoles,
  professionalDirectoryFilterReasons,
  serializeProfessionalDirectoryCard,
  type ProfessionalDirectoryUser,
} from './professional-directory.util';

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

  private readonly professionalDirectorySelect = {
    id: true,
    role: true,
    name: true,
    avatar: true,
    bio: true,
    professionalVerified: true,
    professionalVerificationStatus: true,
    publicProfessionalProfile: true,
    brokerProfileSlug: true,
    isPublicBrokerProfile: true,
    brokerOfficeName: true,
    brokerRegionLabel: true,
    brokerReviewAverage: true,
    brokerReviewCount: true,
    allowBrokerReviews: true,
    brokerPhonePublic: true,
    brokerEmailPublic: true,
    agentProfile: {
      select: {
        isPublic: true,
        verificationStatus: true,
        city: true,
        phone: true,
      },
    },
    companyProfile: {
      select: {
        isPublic: true,
        verificationStatus: true,
        city: true,
        phone: true,
        email: true,
      },
    },
    agencyProfile: {
      select: {
        isPublic: true,
        verificationStatus: true,
        city: true,
        phone: true,
        email: true,
      },
    },
    financialAdvisorProfile: {
      select: {
        isPublic: true,
        verificationStatus: true,
        city: true,
        phone: true,
        email: true,
      },
    },
    investorProfile: {
      select: {
        isPublic: true,
        verificationStatus: true,
        city: true,
        phone: true,
        email: true,
      },
    },
  } as const;

  async listPublicProfessionals(rolesRaw?: string) {
    const roles = parseProfessionalDirectoryRoles(rolesRaw);
    const allowedRoles = new Set(roles);

    const candidates = await this.prisma.user.findMany({
      where: { role: { in: roles } },
      orderBy: [
        { professionalVerified: 'desc' },
        { publicProfessionalProfile: 'desc' },
        { isPublicBrokerProfile: 'desc' },
        { brokerReviewCount: 'desc' },
        { name: 'asc' },
        { id: 'asc' },
      ],
      select: this.professionalDirectorySelect,
      take: 500,
    });

    const included: ReturnType<typeof serializeProfessionalDirectoryCard>[] = [];
    const filteredSamples: Array<{ id: string; role: string; reasons: string[] }> = [];

    for (const row of candidates) {
      const user = row as ProfessionalDirectoryUser;
      const reasons = professionalDirectoryFilterReasons(user, allowedRoles);
      if (reasons.length > 0) {
        if (filteredSamples.length < 25) {
          filteredSamples.push({ id: user.id, role: user.role, reasons });
        }
        continue;
      }
      included.push(serializeProfessionalDirectoryCard(user));
    }

    console.log(
      `[professionals] listPublicProfessionals roles=${roles.join(',')} candidates=${candidates.length} included=${included.length} filtered=${candidates.length - included.length}`,
    );
    if (filteredSamples.length > 0) {
      console.log('[professionals] filtered_samples', JSON.stringify(filteredSamples));
    }

    return included;
  }

  async listPublicDirectory(rolesRaw?: string) {
    return this.listPublicProfessionals(rolesRaw);
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
        facebookUrl: true,
        brokerPhonePublic: true,
        brokerEmailPublic: true,
        whatsappPhone: true,
        whatsappEnabled: true,
        brokerSpecialization: true,
        allowBrokerReviews: true,
        brokerReviewAverage: true,
        brokerReviewCount: true,
        role: true,
        agentProfile: { select: { verificationStatus: true } },
        companyProfile: { select: { verificationStatus: true } },
        agencyProfile: { select: { verificationStatus: true } },
        financialAdvisorProfile: { select: { verificationStatus: true } },
        investorProfile: { select: { verificationStatus: true } },
      },
    });
    if (!broker) {
      throw new NotFoundException('Veřejný profesionální profil nebyl nalezen.');
    }
    const verificationStatus = professionalVerificationStatus(broker);
    const verified = isProfessionalVerified(broker);

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
        facebookUrl: broker.facebookUrl ?? null,
        phonePublic: broker.brokerPhonePublic,
        emailPublic: broker.brokerEmailPublic,
        whatsappEnabled:
          Boolean(broker.whatsappEnabled) &&
          isValidWhatsAppPhone(broker.whatsappPhone ?? ''),
        allowBrokerReviews: broker.allowBrokerReviews,
        ratingAverage: broker.allowBrokerReviews ? broker.brokerReviewAverage : null,
        ratingCount: broker.allowBrokerReviews ? broker.brokerReviewCount : null,
        role: broker.role,
        verificationStatus,
        isVerified: verified,
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
