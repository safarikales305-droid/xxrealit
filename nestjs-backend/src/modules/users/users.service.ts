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
import type { ImageCropDto } from './dto/image-crop.dto';

type LoginSafeUser = Pick<
  User,
  | 'id'
  | 'email'
  | 'name'
  | 'phone'
  | 'phonePublic'
  | 'password'
  | 'role'
  | 'avatar'
  | 'coverImage'
  | 'bio'
  | 'city'
  | 'createdAt'
>;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  private normalizeCrop(crop?: ImageCropDto | null): Prisma.InputJsonValue | undefined {
    if (!crop) return undefined;
    const x = Number(crop.x);
    const y = Number(crop.y);
    const zoom = Number(crop.zoom);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom)) return undefined;
    return {
      x: Math.max(-100, Math.min(100, x)),
      y: Math.max(-100, Math.min(100, y)),
      zoom: Math.max(0.05, Math.min(3, zoom)),
    };
  }

  private isMissingColumnError(error: unknown, column: string): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code !== 'P2022') return false;
    const msg = String(error.message ?? '');
    return msg.includes(column);
  }

  findByEmail(email: string): Promise<LoginSafeUser | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        phonePublic: true,
        password: true,
        role: true,
        avatar: true,
        coverImage: true,
        bio: true,
        city: true,
        createdAt: true,
      },
    });
  }

  findById(id: string): Promise<LoginSafeUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        phonePublic: true,
        password: true,
        role: true,
        avatar: true,
        coverImage: true,
        bio: true,
        city: true,
        createdAt: true,
      },
    });
  }

  create(data: {
    email: string;
    password: string;
    name: string;
    phone: string;
    phonePublic?: boolean;
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

  async updateAvatar(userId: string, avatarUrl: string, crop?: ImageCropDto) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        avatar: avatarUrl,
        ...(crop ? { avatarCrop: this.normalizeCrop(crop) } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        avatarCrop: true,
        coverImage: true,
        coverCrop: true,
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

  async updateCoverImage(userId: string, coverImageUrl: string, crop?: ImageCropDto) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        coverImage: coverImageUrl,
        ...(crop ? { coverCrop: this.normalizeCrop(crop) } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        avatarCrop: true,
        coverImage: true,
        coverCrop: true,
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
      data: { coverImage: null, coverCrop: Prisma.JsonNull },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        avatarCrop: true,
        coverImage: true,
        coverCrop: true,
        bio: true,
        role: true,
        createdAt: true,
      },
    });
    return { ...updated, role: ensureUserRole(updated.role) };
  }

  async updateProfile(
    userId: string,
    input: { bio?: string | null; name?: string; phone?: string; phonePublic?: boolean },
  ) {
    const { bio, name, phone, phonePublic } = input;
    if (bio === undefined && name === undefined && phone === undefined && phonePublic === undefined) {
      const u = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          phonePublic: true,
          avatar: true,
          avatarCrop: true,
          coverImage: true,
          coverCrop: true,
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
    const data: Prisma.UserUpdateInput = {
      bio: normalized,
      ...(name !== undefined ? { name: name.trim().slice(0, 120) } : {}),
      ...(phone !== undefined ? { phone: phone.trim().slice(0, 40) } : {}),
      ...(phonePublic !== undefined ? { phonePublic } : {}),
    };
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        phonePublic: true,
        avatar: true,
        avatarCrop: true,
        coverImage: true,
        coverCrop: true,
        bio: true,
        role: true,
        createdAt: true,
      },
    });
    return { ...updated, role: ensureUserRole(updated.role) };
  }

  async getMeProfile(userId: string) {
    const baseSelect = {
      id: true,
      email: true,
      name: true,
      phone: true,
      phonePublic: true,
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
          isPublic: true,
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
          isPublic: true,
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
          isPublic: true,
          agentCount: true,
          branchCities: true,
          verificationStatus: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      financialAdvisorProfile: {
        select: {
          id: true,
          fullName: true,
          brandName: true,
          phone: true,
          email: true,
          website: true,
          ico: true,
          city: true,
          bio: true,
          specializations: true,
          avatarUrl: true,
          logoUrl: true,
          isPublic: true,
          verificationStatus: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      investorProfile: {
        select: {
          id: true,
          fullName: true,
          investorName: true,
          investorType: true,
          phone: true,
          email: true,
          website: true,
          city: true,
          bio: true,
          investmentFocus: true,
          avatarUrl: true,
          logoUrl: true,
          isPublic: true,
          verificationStatus: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    } as const;
    let hasCropColumns = true;
    let u: any;
    try {
      u = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { ...baseSelect, avatarCrop: true, coverCrop: true },
      });
    } catch (error) {
      if (
        this.isMissingColumnError(error, 'User.avatarCrop') ||
        this.isMissingColumnError(error, 'User.coverCrop')
      ) {
        hasCropColumns = false;
        this.logger.warn(
          '[profile-media] avatarCrop/coverCrop columns missing in DB, using compatibility read path',
        );
        u = await this.prisma.user.findUnique({
          where: { id: userId },
          select: baseSelect,
        });
      } else {
        throw error;
      }
    }
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
          isPublic: Boolean(ap.isPublic),
          verificationStatus: ap.verificationStatus,
          createdAt: ap.createdAt.toISOString(),
          updatedAt: ap.updatedAt.toISOString(),
        }
      : null;
    const profile = {
      id: u.id,
      email: u.email,
      name: u.name,
      phone: u.phone,
      phonePublic: Boolean(u.phonePublic),
      role: ensureUserRole(u.role),
      createdAt: u.createdAt,
      avatarUrl: upgradeHttpToHttpsForApi(u.avatar ?? null) ?? u.avatar ?? null,
      avatarCrop: hasCropColumns ? (u.avatarCrop ?? null) : null,
      coverImageUrl: upgradeHttpToHttpsForApi(u.coverImage ?? null) ?? u.coverImage ?? null,
      coverCrop: hasCropColumns ? (u.coverCrop ?? null) : null,
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
            isPublic: Boolean(u.companyProfile.isPublic),
            createdAt: u.companyProfile.createdAt.toISOString(),
            updatedAt: u.companyProfile.updatedAt.toISOString(),
          }
        : null,
      agencyProfile: u.agencyProfile
        ? {
            ...u.agencyProfile,
            logoUrl: upgradeHttpToHttpsForApi(u.agencyProfile.logoUrl) ?? u.agencyProfile.logoUrl,
            isPublic: Boolean(u.agencyProfile.isPublic),
            createdAt: u.agencyProfile.createdAt.toISOString(),
            updatedAt: u.agencyProfile.updatedAt.toISOString(),
          }
        : null,
      financialAdvisorProfile: u.financialAdvisorProfile
        ? {
            ...u.financialAdvisorProfile,
            avatarUrl:
              upgradeHttpToHttpsForApi(u.financialAdvisorProfile.avatarUrl) ??
              u.financialAdvisorProfile.avatarUrl,
            logoUrl:
              upgradeHttpToHttpsForApi(u.financialAdvisorProfile.logoUrl) ??
              u.financialAdvisorProfile.logoUrl,
            isPublic: Boolean(u.financialAdvisorProfile.isPublic),
            createdAt: u.financialAdvisorProfile.createdAt.toISOString(),
            updatedAt: u.financialAdvisorProfile.updatedAt.toISOString(),
          }
        : null,
      investorProfile: u.investorProfile
        ? {
            ...u.investorProfile,
            avatarUrl:
              upgradeHttpToHttpsForApi(u.investorProfile.avatarUrl) ?? u.investorProfile.avatarUrl,
            logoUrl:
              upgradeHttpToHttpsForApi(u.investorProfile.logoUrl) ?? u.investorProfile.logoUrl,
            isPublic: Boolean(u.investorProfile.isPublic),
            createdAt: u.investorProfile.createdAt.toISOString(),
            updatedAt: u.investorProfile.updatedAt.toISOString(),
          }
        : null,
    };
    this.logger.log(
      `[profile-media] getMeProfile userId=${u.id} hasAvatar=${Boolean(profile.avatarUrl)} hasCover=${Boolean(profile.coverImageUrl)}`,
    );
    return profile;
  }

  async getPublicProfile(userId: string, viewerId?: string) {
    const professionalRoles = new Set<UserRole>([
      UserRole.AGENT,
      UserRole.COMPANY,
      UserRole.AGENCY,
      UserRole.FINANCIAL_ADVISOR,
      UserRole.INVESTOR,
    ]);
    const baseSelect = {
      id: true,
      name: true,
      phone: true,
      phonePublic: true,
      role: true,
      isPublicBrokerProfile: true,
      avatar: true,
      coverImage: true,
      bio: true,
      city: true,
      rating: true,
      createdAt: true,
      _count: { select: { followers: true, following: true } },
    } as const;
    let hasCropColumns = true;
    let user: any;
    try {
      user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { ...baseSelect, avatarCrop: true, coverCrop: true },
      });
    } catch (error) {
      if (
        this.isMissingColumnError(error, 'User.avatarCrop') ||
        this.isMissingColumnError(error, 'User.coverCrop')
      ) {
        hasCropColumns = false;
        this.logger.warn(
          '[profile-media] public profile fallback without avatarCrop/coverCrop columns',
        );
        user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: baseSelect,
        });
      } else {
        throw error;
      }
    }
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
    let viewerIsProfessional = false;
    let propertyViewerAccess: PropertyViewerAccess | undefined;
    if (viewerId) {
      const vu = await this.prisma.user.findUnique({
        where: { id: viewerId },
        select: { role: true, isPremiumBroker: true },
      });
      viewerIsAdmin = vu?.role === UserRole.ADMIN;
      viewerIsProfessional = Boolean(vu?.role && professionalRoles.has(vu.role));
      if (vu) {
        propertyViewerAccess = {
          role: vu.role,
          isPremiumBroker: Boolean(vu.isPremiumBroker),
          isAdmin: vu.role === UserRole.ADMIN,
        };
      }
    }

    const isOwnerViewer = Boolean(viewerId && viewerId === userId);
    const canSeePrivate = isOwnerViewer || viewerIsAdmin;
    if (!canSeePrivate) {
      if (user.role === UserRole.AGENT) {
        const ap = await this.prisma.agentProfile.findUnique({
          where: { userId },
          select: { isPublic: true },
        });
        const isPublic = Boolean(ap?.isPublic) && Boolean(user.isPublicBrokerProfile);
        if (!isPublic) {
          throw new NotFoundException('User not found');
        }
      } else if (user.role === UserRole.COMPANY) {
        const cp = await this.prisma.companyProfile.findUnique({
          where: { userId },
          select: { isPublic: true },
        });
        if (!cp?.isPublic) {
          throw new NotFoundException('User not found');
        }
      } else if (user.role === UserRole.AGENCY) {
        const agp = await this.prisma.agencyProfile.findUnique({
          where: { userId },
          select: { isPublic: true },
        });
        if (!agp?.isPublic) {
          throw new NotFoundException('User not found');
        }
      } else if (user.role === UserRole.FINANCIAL_ADVISOR) {
        const fp = await this.prisma.financialAdvisorProfile.findUnique({
          where: { userId },
          select: { isPublic: true },
        });
        if (!fp?.isPublic) {
          throw new NotFoundException('User not found');
        }
      } else if (user.role === UserRole.INVESTOR) {
        const ip = await this.prisma.investorProfile.findUnique({
          where: { userId },
          select: { isPublic: true },
        });
        if (!ip?.isPublic) {
          throw new NotFoundException('User not found');
        }
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
        include: {
          media: {
            orderBy: { order: 'asc' },
          },
        },
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
      phone: user.phonePublic ? user.phone : null,
      phonePublic: Boolean(user.phonePublic),
      role: ensureUserRole(user.role),
      avatar: upgradeHttpToHttpsForApi(user.avatar) ?? user.avatar,
      avatarCrop: hasCropColumns ? (user.avatarCrop ?? null) : null,
      coverImage: upgradeHttpToHttpsForApi(user.coverImage) ?? user.coverImage,
      coverCrop: hasCropColumns ? (user.coverCrop ?? null) : null,
      bio: user.bio,
      city: user.city,
      rating: user.rating,
      createdAt: user.createdAt,
      followersCount: user._count.followers,
      followingCount: user._count.following,
      isFollowedByViewer,
      canContactProfile: professionalRoles.has(user.role) && (viewerIsProfessional || viewerIsAdmin),
      },
      videos: videos.map((v) => ({
        ...v,
        url: upgradeHttpToHttpsForApi(v.url) ?? v.url,
      })),
      posts: posts.map((p) => ({
        ...p,
        media: (p.media ?? []).filter((m) => /^https?:\/\//i.test((m.url ?? '').trim())),
      })),
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

  async updateProfessionalProfileVisibility(userId: string, isPublic: boolean) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!u) throw new NotFoundException('User not found');

    if (u.role === UserRole.AGENT) {
      const [userUpdate, profileUpdate] = await Promise.all([
        this.prisma.user.update({
          where: { id: userId },
          data: { isPublicBrokerProfile: isPublic },
          select: { isPublicBrokerProfile: true },
        }),
        this.prisma.agentProfile.updateMany({
          where: { userId },
          data: { isPublic },
        }),
      ]);
      return {
        role: 'AGENT',
        isPublic: Boolean(userUpdate.isPublicBrokerProfile),
        hasProfile: profileUpdate.count > 0,
      };
    }
    if (u.role === UserRole.COMPANY) {
      const profile = await this.prisma.companyProfile.update({
        where: { userId },
        data: { isPublic },
        select: { isPublic: true },
      });
      return { role: 'COMPANY', isPublic: profile.isPublic, hasProfile: true };
    }
    if (u.role === UserRole.AGENCY) {
      const profile = await this.prisma.agencyProfile.update({
        where: { userId },
        data: { isPublic },
        select: { isPublic: true },
      });
      return { role: 'AGENCY', isPublic: profile.isPublic, hasProfile: true };
    }
    if (u.role === UserRole.FINANCIAL_ADVISOR) {
      const profile = await this.prisma.financialAdvisorProfile.update({
        where: { userId },
        data: { isPublic },
        select: { isPublic: true },
      });
      return { role: 'FINANCIAL_ADVISOR', isPublic: profile.isPublic, hasProfile: true };
    }
    if (u.role === UserRole.INVESTOR) {
      const profile = await this.prisma.investorProfile.update({
        where: { userId },
        data: { isPublic },
        select: { isPublic: true },
      });
      return { role: 'INVESTOR', isPublic: profile.isPublic, hasProfile: true };
    }
    throw new ForbiddenException(
      'Nastavení veřejnosti profilu je jen pro AGENT, COMPANY, AGENCY, FINANCIAL_ADVISOR nebo INVESTOR.',
    );
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

    const updated = await this.prisma.user.update({
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
    if (dto.isPublicBrokerProfile !== undefined) {
      await this.prisma.agentProfile.updateMany({
        where: { userId },
        data: { isPublic: dto.isPublicBrokerProfile },
      });
    }
    return updated;
  }
}
