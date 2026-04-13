import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { User } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { upgradeHttpToHttpsForApi } from '../../lib/secure-url';
import { ensureUserRole } from '../auth/user-role.util';
import { classicPublicListingWhere } from '../properties/property-listing-scope';
import {
  serializeProperty,
  type PropertyViewerAccess,
} from '../properties/properties.serializer';
import { UpdateBrokerPublicProfileDto } from './dto/update-broker-public-profile.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(data: {
    email: string;
    password: string;
    name?: string | null;
    role: UserRole;
  }): Promise<User> {
    return this.prisma.user.create({ data });
  }

  setPasswordResetToken(
    userId: string,
    token: string,
    resetExpires: Date,
  ): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { resetToken: token, resetExpires },
    });
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        coverImage: true,
        bio: true,
        role: true,
        createdAt: true,
      },
    });
    this.logger.log(
      `[profile-media] updateAvatar userId=${userId} avatarLen=${(updated.avatar ?? '').length} coverSet=${Boolean(updated.coverImage)}`,
    );
    return { ...updated, role: ensureUserRole(updated.role) };
  }

  async updateCoverImage(userId: string, coverImageUrl: string) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { coverImage: coverImageUrl },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        coverImage: true,
        bio: true,
        role: true,
        createdAt: true,
      },
    });
    this.logger.log(
      `[profile-media] updateCover userId=${userId} coverLen=${(updated.coverImage ?? '').length} avatarKept=${Boolean(updated.avatar)}`,
    );
    return { ...updated, role: ensureUserRole(updated.role) };
  }

  async clearCoverImage(userId: string) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { coverImage: null },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        coverImage: true,
        bio: true,
        role: true,
        createdAt: true,
      },
    });
    return { ...updated, role: ensureUserRole(updated.role) };
  }

  async updateProfileBio(userId: string, bio: string | null | undefined) {
    if (bio === undefined) {
      const u = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          coverImage: true,
          bio: true,
          role: true,
          createdAt: true,
        },
      });
      if (!u) {
        throw new NotFoundException('User not found');
      }
      return { ...u, role: ensureUserRole(u.role) };
    }
    const normalized =
      bio === null || (typeof bio === 'string' && bio.trim().length === 0)
        ? null
        : String(bio).trim().slice(0, 500);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { bio: normalized },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        coverImage: true,
        bio: true,
        role: true,
        createdAt: true,
      },
    });
    return { ...updated, role: ensureUserRole(updated.role) };
  }

  async getMeProfile(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        coverImage: true,
        bio: true,
        role: true,
        createdAt: true,
        isPremiumBroker: true,
        brokerLeadNotificationEnabled: true,
        brokerPreferredRegions: true,
        brokerPreferredPropertyTypes: true,
        brokerPoints: true,
        brokerFreeLeads: true,
        isPublicBrokerProfile: true,
        allowBrokerReviews: true,
        brokerProfileSlug: true,
        brokerOfficeName: true,
        brokerSpecialization: true,
        brokerRegionLabel: true,
        brokerWeb: true,
        brokerPhonePublic: true,
        brokerEmailPublic: true,
        brokerReviewAverage: true,
        brokerReviewCount: true,
        agentProfile: {
          select: {
            id: true,
            fullName: true,
            companyName: true,
            phone: true,
            phoneVerified: true,
            website: true,
            ico: true,
            city: true,
            bio: true,
            avatarUrl: true,
            verificationStatus: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        companyProfile: {
          select: {
            id: true,
            companyName: true,
            contactFullName: true,
            phone: true,
            email: true,
            website: true,
            ico: true,
            city: true,
            description: true,
            services: true,
            logoUrl: true,
            verificationStatus: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        agencyProfile: {
          select: {
            id: true,
            agencyName: true,
            contactFullName: true,
            phone: true,
            email: true,
            website: true,
            ico: true,
            city: true,
            description: true,
            logoUrl: true,
            agentCount: true,
            branchCities: true,
            verificationStatus: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!u) return null;
    const ap = u.agentProfile;
    const agentProfile = ap
      ? {
          id: ap.id,
          fullName: ap.fullName,
          companyName: ap.companyName,
          phone: ap.phone,
          phoneVerified: ap.phoneVerified,
          website: ap.website,
          ico: ap.ico,
          city: ap.city,
          bio: ap.bio,
          avatarUrl: upgradeHttpToHttpsForApi(ap.avatarUrl) ?? ap.avatarUrl,
          verificationStatus: ap.verificationStatus,
          createdAt: ap.createdAt.toISOString(),
          updatedAt: ap.updatedAt.toISOString(),
        }
      : null;
    const profile = {
      id: u.id,
      email: u.email,
      name: u.name,
      role: ensureUserRole(u.role),
      createdAt: u.createdAt,
      avatarUrl: upgradeHttpToHttpsForApi(u.avatar ?? null) ?? u.avatar ?? null,
      coverImageUrl: upgradeHttpToHttpsForApi(u.coverImage ?? null) ?? u.coverImage ?? null,
      bio: u.bio ?? null,
      isPremiumBroker: u.isPremiumBroker,
      brokerLeadNotificationEnabled: u.brokerLeadNotificationEnabled,
      brokerPreferredRegions: u.brokerPreferredRegions,
      brokerPreferredPropertyTypes: u.brokerPreferredPropertyTypes,
      brokerPoints: u.brokerPoints,
      brokerFreeLeads: u.brokerFreeLeads,
      isPublicBrokerProfile: u.isPublicBrokerProfile,
      allowBrokerReviews: u.allowBrokerReviews,
      brokerProfileSlug: u.brokerProfileSlug,
      brokerOfficeName: u.brokerOfficeName,
      brokerSpecialization: u.brokerSpecialization,
      brokerRegionLabel: u.brokerRegionLabel,
      brokerWeb: u.brokerWeb,
      brokerPhonePublic: u.brokerPhonePublic,
      brokerEmailPublic: u.brokerEmailPublic,
      brokerReviewAverage: u.brokerReviewAverage,
      brokerReviewCount: u.brokerReviewCount,
      agentProfile,
      companyProfile: u.companyProfile
        ? {
            ...u.companyProfile,
            logoUrl: upgradeHttpToHttpsForApi(u.companyProfile.logoUrl) ?? u.companyProfile.logoUrl,
            createdAt: u.companyProfile.createdAt.toISOString(),
            updatedAt: u.companyProfile.updatedAt.toISOString(),
          }
        : null,
      agencyProfile: u.agencyProfile
        ? {
            ...u.agencyProfile,
            logoUrl: upgradeHttpToHttpsForApi(u.agencyProfile.logoUrl) ?? u.agencyProfile.logoUrl,
            createdAt: u.agencyProfile.createdAt.toISOString(),
            updatedAt: u.agencyProfile.updatedAt.toISOString(),
          }
        : null,
    };
    this.logger.log(
      `[profile-media] getMeProfile userId=${u.id} hasAvatar=${Boolean(profile.avatarUrl)} hasCover=${Boolean(profile.coverImageUrl)}`,
    );
    return profile;
  }

  async getPublicProfile(userId: string, viewerId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        avatar: true,
        coverImage: true,
        bio: true,
        city: true,
        rating: true,
        createdAt: true,
        _count: { select: { followers: true, following: true } },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    let isFollowedByViewer: boolean | null = null;
    if (viewerId && viewerId !== userId) {
      const row = await this.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: viewerId,
            followingId: userId,
          },
        },
      });
      isFollowedByViewer = !!row;
    }

    let viewerIsAdmin = false;
    let propertyViewerAccess: PropertyViewerAccess | undefined;
    if (viewerId) {
      const vu = await this.prisma.user.findUnique({
        where: { id: viewerId },
        select: { role: true, isPremiumBroker: true },
      });
      viewerIsAdmin = vu?.role === UserRole.ADMIN;
      if (vu) {
        propertyViewerAccess = {
          role: vu.role,
          isPremiumBroker: Boolean(vu.isPremiumBroker),
          isAdmin: vu.role === UserRole.ADMIN,
        };
      }
    }

    const [videos, posts, properties] = await Promise.all([
      this.prisma.video.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.post.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.property.findMany({
        where:
          viewerId === userId || viewerIsAdmin
            ? { userId, deletedAt: null }
            : { userId, ...classicPublicListingWhere },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { likes: true } },
          user: { select: { id: true, city: true } },
        },
      }),
    ]);

    return {
      user: {
      id: user.id,
      name: user.name,
      role: ensureUserRole(user.role),
      avatar: upgradeHttpToHttpsForApi(user.avatar) ?? user.avatar,
      coverImage: upgradeHttpToHttpsForApi(user.coverImage) ?? user.coverImage,
      bio: user.bio,
      city: user.city,
      rating: user.rating,
      createdAt: user.createdAt,
      followersCount: user._count.followers,
      followingCount: user._count.following,
      isFollowedByViewer,
      },
      videos: videos.map((v) => ({
        ...v,
        url: upgradeHttpToHttpsForApi(v.url) ?? v.url,
      })),
      posts,
      properties: properties.map((p) =>
        serializeProperty({ ...p, likes: [] }, viewerId, propertyViewerAccess),
      ),
    };
  }

  async followUser(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new BadRequestException('Cannot follow yourself');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: followingId },
    });
    if (!target) {
      throw new NotFoundException('User not found');
    }
    try {
      await this.prisma.follow.create({
        data: { followerId, followingId },
      });
      const followersCount = await this.prisma.follow.count({
        where: { followingId },
      });
      return { ok: true, followersCount };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Already following');
      }
      throw e;
    }
  }

  async unfollowUser(followerId: string, followingId: string) {
    await this.prisma.follow.deleteMany({
      where: { followerId, followingId },
    });
    const followersCount = await this.prisma.follow.count({
      where: { followingId },
    });
    return { ok: true, followersCount };
  }

  async updateBrokerLeadPrefs(
    userId: string,
    body: {
      brokerLeadNotificationEnabled?: boolean;
      brokerPreferredRegions?: string[];
      brokerPreferredPropertyTypes?: string[];
    },
  ) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!u || u.role !== UserRole.AGENT) {
      throw new ForbiddenException('Nastavení leadů je jen pro účty makléře (AGENT).');
    }
    const regions = Array.isArray(body.brokerPreferredRegions)
      ? body.brokerPreferredRegions
          .map((s) => (typeof s === 'string' ? s.trim().slice(0, 64) : ''))
          .filter(Boolean)
          .slice(0, 32)
      : undefined;
    const types = Array.isArray(body.brokerPreferredPropertyTypes)
      ? body.brokerPreferredPropertyTypes
          .map((s) => (typeof s === 'string' ? s.trim().toLowerCase().slice(0, 32) : ''))
          .filter(Boolean)
          .slice(0, 32)
      : undefined;
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(body.brokerLeadNotificationEnabled !== undefined
          ? { brokerLeadNotificationEnabled: body.brokerLeadNotificationEnabled }
          : {}),
        ...(regions !== undefined ? { brokerPreferredRegions: regions } : {}),
        ...(types !== undefined ? { brokerPreferredPropertyTypes: types } : {}),
      },
      select: {
        id: true,
        brokerLeadNotificationEnabled: true,
        brokerPreferredRegions: true,
        brokerPreferredPropertyTypes: true,
      },
    });
  }

  private slugifyBase(input: string): string {
    const s = input
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
    return s || 'makler';
  }

  private async nextUniqueBrokerSlug(base: string, userId: string): Promise<string> {
    let candidate = base;
    for (let i = 0; i < 30; i += 1) {
      const other = await this.prisma.user.findFirst({
        where: {
          brokerProfileSlug: candidate,
          NOT: { id: userId },
        },
        select: { id: true },
      });
      if (!other) return candidate;
      candidate = `${base}-${Math.random().toString(36).slice(2, 8)}`;
    }
    return `${base}-${userId.slice(0, 8)}`;
  }

  async updateBrokerPublicProfile(userId: string, dto: UpdateBrokerPublicProfileDto) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        name: true,
        email: true,
        brokerProfileSlug: true,
        isPublicBrokerProfile: true,
      },
    });
    if (!u || u.role !== UserRole.AGENT) {
      throw new ForbiddenException(
        'Veřejný profil makléře lze nastavit jen pro účty makléře (AGENT).',
      );
    }

    const willBePublic =
      dto.isPublicBrokerProfile !== undefined
        ? dto.isPublicBrokerProfile
        : u.isPublicBrokerProfile;

    let nextSlug = u.brokerProfileSlug;
    if (willBePublic && (!nextSlug || !nextSlug.trim())) {
      const baseSource =
        (u.name && u.name.trim()) || u.email.split('@')[0] || 'makler';
      const base = this.slugifyBase(baseSource);
      nextSlug = await this.nextUniqueBrokerSlug(base, userId);
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.isPublicBrokerProfile !== undefined) {
      data.isPublicBrokerProfile = dto.isPublicBrokerProfile;
    }
    if (dto.allowBrokerReviews !== undefined) {
      data.allowBrokerReviews = dto.allowBrokerReviews;
    }
    if (dto.brokerOfficeName !== undefined) {
      data.brokerOfficeName = dto.brokerOfficeName.trim().slice(0, 200);
    }
    if (dto.brokerSpecialization !== undefined) {
      data.brokerSpecialization = dto.brokerSpecialization.trim().slice(0, 200);
    }
    if (dto.brokerRegionLabel !== undefined) {
      data.brokerRegionLabel = dto.brokerRegionLabel.trim().slice(0, 120);
    }
    if (dto.brokerWeb !== undefined) {
      data.brokerWeb = dto.brokerWeb.trim().slice(0, 500);
    }
    if (dto.brokerPhonePublic !== undefined) {
      data.brokerPhonePublic = dto.brokerPhonePublic.trim().slice(0, 40);
    }
    if (dto.brokerEmailPublic !== undefined) {
      data.brokerEmailPublic = dto.brokerEmailPublic.trim().toLowerCase().slice(0, 200);
    }
    if (nextSlug && nextSlug !== u.brokerProfileSlug) {
      data.brokerProfileSlug = nextSlug;
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        isPublicBrokerProfile: true,
        allowBrokerReviews: true,
        brokerProfileSlug: true,
        brokerOfficeName: true,
        brokerSpecialization: true,
        brokerRegionLabel: true,
        brokerWeb: true,
        brokerPhonePublic: true,
        brokerEmailPublic: true,
        brokerReviewAverage: true,
        brokerReviewCount: true,
      },
    });
  }
}
