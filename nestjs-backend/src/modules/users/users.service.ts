import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProfessionalVerificationStatus, UserRole } from '@prisma/client';
import type { User } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { upgradeHttpToHttpsForApi } from '../../lib/secure-url';
import { ensureUserRole } from '../auth/user-role.util';
import { classicPublicListingWhere } from '../properties/property-listing-scope';
import {
  isProfessionalVerified,
  publicProfileHref,
  verifiedBadgeLabelForRole,
} from '../brokers/professional-verification.util';
import {
  buildProfileRequirementsChecklist,
  collectProfessionalRequirementIssues,
  collectTiparRequirementIssues,
  canTopUpCredits,
  canUseTiparFeatures,
  showVerifiedProfessionalBadge,
  showVerifiedTiparBadge,
  type ProfileRequirementsInput,
} from './profile-requirements.util';
import {
  serializeProperty,
  type PropertyViewerAccess,
} from '../properties/properties.serializer';
import { NotificationsService } from '../premium-broker/notifications.service';
import { UpdateBrokerPublicProfileDto } from './dto/update-broker-public-profile.dto';
import { isValidWhatsAppPhone, normalizeToE164 } from '../whatsapp/whatsapp-phone.util';
import type { ImageCropDto } from './dto/image-crop.dto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcrypt');

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

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
    isTipar?: boolean;
    referredByUserId?: string | null;
    emailVerified?: boolean;
    phoneVerified?: boolean;
  }): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async verifyEmail(_userId: string) {
    throw new BadRequestException(
      'E-mail lze ověřit pouze kliknutím na odkaz v e-mailu. Použijte „Ověřit e-mail“ pro odeslání odkazu.',
    );
  }

  setEmailVerificationToken(
    userId: string,
    token: string,
    expires: Date,
  ): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerificationToken: token,
        emailVerificationExpires: expires,
      },
    });
  }

  findByEmailVerificationToken(token: string) {
    const trimmed = token.trim();
    if (!trimmed) return Promise.resolve(null);
    return this.prisma.user.findFirst({
      where: { emailVerificationToken: trimmed },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        emailVerificationExpires: true,
      },
    });
  }

  confirmEmailVerification(userId: string): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });
  }

  async verifyPhone(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { phoneVerified: true },
    });
    return { ok: true };
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

  async clearAvatar(userId: string) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatar: null, avatarCrop: Prisma.JsonNull },
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
    input: {
      bio?: string | null;
      name?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      phonePublic?: boolean;
      brokerOfficeName?: string;
      city?: string | null;
      address?: string | null;
      postalCode?: string | null;
      profileIco?: string | null;
      tiparPayoutBankAccount?: string | null;
    },
  ) {
    const {
      bio,
      name,
      firstName,
      lastName,
      phone,
      phonePublic,
      brokerOfficeName,
      city,
      address,
      postalCode,
      profileIco,
      tiparPayoutBankAccount,
    } = input;
    if (
      bio === undefined &&
      name === undefined &&
      firstName === undefined &&
      lastName === undefined &&
      phone === undefined &&
      phonePublic === undefined &&
      brokerOfficeName === undefined &&
      city === undefined &&
      address === undefined &&
      postalCode === undefined &&
      profileIco === undefined &&
      tiparPayoutBankAccount === undefined
    ) {
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
    const nextFirst = firstName !== undefined ? firstName.trim().slice(0, 60) : undefined;
    const nextLast = lastName !== undefined ? lastName.trim().slice(0, 60) : undefined;
    const combinedName =
      name !== undefined
        ? name.trim().slice(0, 120)
        : nextFirst !== undefined || nextLast !== undefined
          ? `${nextFirst ?? ''} ${nextLast ?? ''}`.trim().slice(0, 120)
          : undefined;
    const data: Prisma.UserUpdateInput = {
      ...(bio !== undefined ? { bio: normalized } : {}),
      ...(combinedName !== undefined ? { name: combinedName } : {}),
      ...(nextFirst !== undefined ? { firstName: nextFirst } : {}),
      ...(nextLast !== undefined ? { lastName: nextLast } : {}),
      ...(phone !== undefined ? { phone: phone.trim().slice(0, 40) } : {}),
      ...(phonePublic !== undefined ? { phonePublic } : {}),
      ...(brokerOfficeName !== undefined
        ? { brokerOfficeName: brokerOfficeName.trim().slice(0, 200) }
        : {}),
      ...(city !== undefined ? { city: city?.trim().slice(0, 120) || null } : {}),
      ...(address !== undefined ? { address: address?.trim().slice(0, 200) || '' } : {}),
      ...(postalCode !== undefined ? { postalCode: postalCode?.trim().slice(0, 16) || '' } : {}),
      ...(profileIco !== undefined ? { profileIco: profileIco?.trim().slice(0, 16) || '' } : {}),
      ...(tiparPayoutBankAccount !== undefined
        ? { tiparPayoutBankAccount: tiparPayoutBankAccount?.trim().slice(0, 64) || null }
        : {}),
    };
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        lastName: true,
        phone: true,
        phonePublic: true,
        avatar: true,
        avatarCrop: true,
        coverImage: true,
        coverCrop: true,
        bio: true,
        city: true,
        address: true,
        postalCode: true,
        profileIco: true,
        role: true,
        createdAt: true,
      },
    });
    await this.syncRoleProfileFromUserSettings(userId, updated.role, {
      name: updated.name,
      brokerOfficeName: brokerOfficeName?.trim(),
      city: city?.trim(),
      address: address?.trim(),
      profileIco: profileIco?.trim(),
    });
    return { ...updated, role: ensureUserRole(updated.role) };
  }

  private async syncRoleProfileFromUserSettings(
    userId: string,
    role: UserRole,
    patch: {
      name?: string;
      brokerOfficeName?: string;
      city?: string;
      address?: string;
      profileIco?: string;
    },
  ) {
    const city = patch.city || undefined;
    const ico = patch.profileIco || undefined;
    if (role === UserRole.AGENT) {
      const existing = await this.prisma.agentProfile.findUnique({ where: { userId } });
      if (existing) {
        await this.prisma.agentProfile.update({
          where: { userId },
          data: {
            ...(patch.name ? { fullName: patch.name } : {}),
            ...(patch.brokerOfficeName ? { companyName: patch.brokerOfficeName } : {}),
            ...(city ? { city } : {}),
            ...(ico ? { ico } : {}),
          },
        });
      }
    }
    if (role === UserRole.COMPANY) {
      const existing = await this.prisma.companyProfile.findUnique({ where: { userId } });
      if (existing) {
        await this.prisma.companyProfile.update({
          where: { userId },
          data: {
            ...(patch.brokerOfficeName ? { companyName: patch.brokerOfficeName } : {}),
            ...(patch.name ? { contactFullName: patch.name } : {}),
            ...(city ? { city } : {}),
            ...(ico ? { ico } : {}),
          },
        });
      }
    }
    if (role === UserRole.AGENCY) {
      const existing = await this.prisma.agencyProfile.findUnique({ where: { userId } });
      if (existing) {
        await this.prisma.agencyProfile.update({
          where: { userId },
          data: {
            ...(patch.brokerOfficeName ? { agencyName: patch.brokerOfficeName } : {}),
            ...(patch.name ? { contactFullName: patch.name } : {}),
            ...(city ? { city } : {}),
            ...(ico ? { ico } : {}),
          },
        });
      }
    }
    if (role === UserRole.FINANCIAL_ADVISOR) {
      const existing = await this.prisma.financialAdvisorProfile.findUnique({ where: { userId } });
      if (existing) {
        await this.prisma.financialAdvisorProfile.update({
          where: { userId },
          data: {
            ...(patch.name ? { fullName: patch.name } : {}),
            ...(city ? { city } : {}),
            ...(ico ? { ico } : {}),
          },
        });
      }
    }
    if (role === UserRole.INVESTOR) {
      const existing = await this.prisma.investorProfile.findUnique({ where: { userId } });
      if (existing) {
        await this.prisma.investorProfile.update({
          where: { userId },
          data: {
            ...(patch.name ? { fullName: patch.name } : {}),
            ...(city ? { city } : {}),
          },
        });
      }
    }
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
      city: true,
      address: true,
      postalCode: true,
      firstName: true,
      lastName: true,
      profileIco: true,
      emailVerified: true,
      tiparPayoutBankAccount: true,
      role: true,
      createdAt: true,
      creditBalance: true,
      realCreditBalance: true,
      bonusCreditBalance: true,
      pendingCreditBalance: true,
      creditDebt: true,
      accountLimited: true,
      isCreditVerified: true,
      firstTopUpUsed: true,
      firstContentCompleted: true,
      isTipar: true,
      isPremiumBroker: true,
      brokerLeadNotificationEnabled: true,
      brokerPreferredRegions: true,
      brokerPreferredPropertyTypes: true,
      brokerPoints: true,
      brokerFreeLeads: true,
      isPublicBrokerProfile: true,
      professionalVerified: true,
      professionalVerificationStatus: true,
      publicProfessionalProfile: true,
      professionalVerificationRequestedAt: true,
      professionalVerifiedAt: true,
      professionalRejectedAt: true,
      allowBrokerReviews: true,
      brokerProfileSlug: true,
      brokerOfficeName: true,
      brokerSpecialization: true,
      brokerRegionLabel: true,
      brokerWeb: true,
      brokerPhonePublic: true,
      brokerEmailPublic: true,
      whatsappPhone: true,
      whatsappVerified: true,
      whatsappVerifiedAt: true,
      whatsappEnabled: true,
      whatsappMarketingOptOut: true,
      whatsappNotifyMyUploads: true,
      whatsappNotifyNewPosts: true,
      facebookUrl: true,
      facebookImportEnabled: true,
      facebookLastSyncAt: true,
      facebookImportStatus: true,
      facebookImportError: true,
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
      emailVerified: Boolean(u.emailVerified),
      emailVerifiedAt: u.emailVerifiedAt?.toISOString() ?? null,
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
      professionalVerified: Boolean(u.professionalVerified),
      professionalVerificationStatus: u.professionalVerificationStatus,
      publicProfessionalProfile: Boolean(u.publicProfessionalProfile),
      professionalVerificationRequestedAt:
        u.professionalVerificationRequestedAt?.toISOString() ?? null,
      professionalVerifiedAt: u.professionalVerifiedAt?.toISOString() ?? null,
      professionalRejectedAt: u.professionalRejectedAt?.toISOString() ?? null,
      allowBrokerReviews: u.allowBrokerReviews,
      brokerProfileSlug: u.brokerProfileSlug,
      brokerOfficeName: u.brokerOfficeName,
      brokerSpecialization: u.brokerSpecialization,
      brokerRegionLabel: u.brokerRegionLabel,
      brokerWeb: u.brokerWeb,
      facebookUrl: u.facebookUrl ?? null,
      facebookImportEnabled: Boolean(u.facebookImportEnabled),
      facebookLastSyncAt: u.facebookLastSyncAt?.toISOString() ?? null,
      facebookImportStatus: u.facebookImportStatus ?? 'IDLE',
      facebookImportError: u.facebookImportError ?? null,
      brokerPhonePublic: u.brokerPhonePublic,
      brokerEmailPublic: u.brokerEmailPublic,
      whatsappPhone: u.whatsappPhone,
      whatsappVerified: Boolean(u.whatsappVerified),
      whatsappVerifiedAt: u.whatsappVerifiedAt?.toISOString() ?? null,
      whatsappEnabled: Boolean(u.whatsappEnabled),
      whatsappMarketingOptOut: Boolean(u.whatsappMarketingOptOut),
      whatsappNotifyMyUploads: Boolean(u.whatsappNotifyMyUploads),
      whatsappNotifyNewPosts: Boolean(u.whatsappNotifyNewPosts),
      brokerReviewAverage: u.brokerReviewAverage,
      brokerReviewCount: u.brokerReviewCount,
      creditBalance: u.creditBalance ?? 0,
      realCreditBalance: u.realCreditBalance ?? 0,
      bonusCreditBalance: u.bonusCreditBalance ?? 0,
      pendingCreditBalance: u.pendingCreditBalance ?? 0,
      creditDebt: u.creditDebt ?? 0,
      accountLimited: Boolean(u.accountLimited),
      isCreditVerified: Boolean(u.isCreditVerified),
      firstTopUpUsed: Boolean(u.firstTopUpUsed),
      firstContentCompleted: Boolean(u.firstContentCompleted),
      isTipar: Boolean(u.isTipar),
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
    const reqInput: ProfileRequirementsInput = {
      role: u.role,
      name: u.name,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      emailVerified: u.emailVerified === true,
      whatsappVerified: u.whatsappVerified === true,
      city: u.city,
      address: u.address,
      postalCode: u.postalCode,
      profileIco: u.profileIco,
      isTipar: Boolean(u.isTipar),
      tiparPayoutBankAccount: u.tiparPayoutBankAccount,
      professionalVerified: Boolean(u.professionalVerified),
      professionalVerificationStatus: u.professionalVerificationStatus,
      brokerOfficeName: u.brokerOfficeName,
      agentProfile: u.agentProfile,
      companyProfile: u.companyProfile,
      agencyProfile: u.agencyProfile,
      financialAdvisorProfile: u.financialAdvisorProfile,
      investorProfile: u.investorProfile,
    };
    const checklist = buildProfileRequirementsChecklist(reqInput);
    return {
      ...profile,
      firstName: u.firstName ?? '',
      lastName: u.lastName ?? '',
      address: u.address ?? '',
      postalCode: u.postalCode ?? '',
      profileIco: u.profileIco ?? '',
      profileRequirements: {
        checklist,
        professional: collectProfessionalRequirementIssues(reqInput),
        tipar: collectTiparRequirementIssues(reqInput),
        canTopUpCredits: canTopUpCredits(reqInput),
        canUseTipar: canUseTiparFeatures({ ...reqInput, isTipar: true }),
        showVerifiedBadge:
          showVerifiedProfessionalBadge(reqInput) || showVerifiedTiparBadge(reqInput),
      },
    };
  }

  private async resolvePublicProfileUserId(idOrSlug: string): Promise<string | null> {
    const direct = await this.prisma.user.findUnique({
      where: { id: idOrSlug },
      select: { id: true },
    });
    if (direct) return direct.id;
    const bySlug = await this.prisma.user.findFirst({
      where: { brokerProfileSlug: idOrSlug },
      select: { id: true },
    });
    return bySlug?.id ?? null;
  }

  async getPublicProfile(userId: string, viewerId?: string) {
    const resolvedId = (await this.resolvePublicProfileUserId(userId)) ?? userId;
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
      whatsappPhone: true,
      whatsappEnabled: true,
      whatsappVerified: true,
      facebookUrl: true,
      role: true,
      isPublicBrokerProfile: true,
      isPromoProfile: true,
      promoProfileActive: true,
      professionalVerified: true,
      professionalVerificationStatus: true,
      publicProfessionalProfile: true,
      email: true,
      emailVerified: true,
      isTipar: true,
      tiparPayoutBankAccount: true,
      agentProfile: {
        select: {
          verificationStatus: true,
          isPublic: true,
          city: true,
          ico: true,
          companyName: true,
          fullName: true,
        },
      },
      companyProfile: {
        select: {
          verificationStatus: true,
          isPublic: true,
          city: true,
          ico: true,
          companyName: true,
          contactFullName: true,
        },
      },
      agencyProfile: {
        select: {
          verificationStatus: true,
          isPublic: true,
          city: true,
          ico: true,
          agencyName: true,
          contactFullName: true,
        },
      },
      financialAdvisorProfile: {
        select: { verificationStatus: true, isPublic: true, city: true, ico: true, fullName: true },
      },
      investorProfile: { select: { verificationStatus: true, isPublic: true, city: true, fullName: true } },
      avatar: true,
      coverImage: true,
      bio: true,
      city: true,
      address: true,
      firstName: true,
      lastName: true,
      profileIco: true,
      brokerOfficeName: true,
      rating: true,
      createdAt: true,
      creditBalance: true,
      _count: { select: { followers: true, following: true } },
    } as const;
    let hasCropColumns = true;
    let user: any;
    try {
      user = await this.prisma.user.findUnique({
        where: { id: resolvedId },
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
          where: { id: resolvedId },
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
    if (viewerId && viewerId !== resolvedId) {
      const row = await this.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: viewerId,
            followingId: resolvedId,
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

    const isOwnerViewer = Boolean(viewerId && viewerId === resolvedId);
    const canSeePrivate = isOwnerViewer || viewerIsAdmin;
    const isActivePublicPromo =
      Boolean(user.isPromoProfile) &&
      Boolean(user.promoProfileActive) &&
      Boolean(user.isPublicBrokerProfile);
    if (!canSeePrivate) {
      if (user.isPromoProfile) {
        if (!isActivePublicPromo) {
          throw new NotFoundException('User not found');
        }
      } else {
        const portalVisible =
          Boolean(user.publicProfessionalProfile) || Boolean(user.isPublicBrokerProfile);
        if (!portalVisible) {
          throw new NotFoundException('User not found');
        }
      }
    }

    const [videos, posts, properties] = await Promise.all([
      this.prisma.video.findMany({
        where: { userId: resolvedId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.post.findMany({
        where: { userId: resolvedId },
        orderBy: { createdAt: 'desc' },
        include: {
          media: {
            orderBy: { order: 'asc' },
          },
        },
      }),
      this.prisma.property.findMany({
        where:
          viewerId === resolvedId || viewerIsAdmin
            ? { userId: resolvedId, deletedAt: null }
            : { userId: resolvedId, ...classicPublicListingWhere },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { likes: true } },
          user: { select: { id: true, city: true } },
        },
      }),
    ]);

    const whatsappAvailable =
      Boolean(user.whatsappEnabled) && isValidWhatsAppPhone(user.whatsappPhone ?? '');

    const reqInput: ProfileRequirementsInput = {
      role: user.role,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      emailVerified: user.emailVerified === true,
      whatsappVerified: user.whatsappVerified === true,
      city: user.city,
      address: user.address,
      profileIco: user.profileIco,
      isTipar: Boolean(user.isTipar),
      tiparPayoutBankAccount: user.tiparPayoutBankAccount,
      professionalVerified: Boolean(user.professionalVerified),
      professionalVerificationStatus: user.professionalVerificationStatus,
      brokerOfficeName: user.brokerOfficeName,
      agentProfile: user.agentProfile,
      companyProfile: user.companyProfile,
      agencyProfile: user.agencyProfile,
      financialAdvisorProfile: user.financialAdvisorProfile,
      investorProfile: user.investorProfile,
    };
    const showTiparBadge = showVerifiedTiparBadge(reqInput);
    const showProfBadge = showVerifiedProfessionalBadge(reqInput);
    const verified = showProfBadge || showTiparBadge;
    const verifiedBadgeLabel = showTiparBadge
      ? 'Ověřený tipař'
      : showProfBadge
        ? verifiedBadgeLabelForRole(user.role)
        : null;

    return {
      user: {
      id: user.id,
      name: user.name,
      phone: user.phonePublic ? user.phone : null,
      phonePublic: Boolean(user.phonePublic),
      whatsappEnabled: whatsappAvailable,
      facebookUrl: user.facebookUrl ?? null,
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
      creditBalance: user.creditBalance ?? 0,
      isTipar: Boolean(user.isTipar),
      isVerified: verified,
      verifiedBadgeLabel: verified ? verifiedBadgeLabel : null,
      profileHref: publicProfileHref(user.id, user.role),
      },
      videos: videos.map((v) => ({
        ...v,
        url: upgradeHttpToHttpsForApi(v.url) ?? v.url,
      })),
      posts: posts
        .map((p) => ({
          ...p,
          media: (p.media ?? []).map((m) => ({
            ...m,
            url: upgradeHttpToHttpsForApi(m.url) ?? m.url,
          })),
        }))
        .sort(
          (a, b) =>
            (b.publishedAt ?? b.createdAt).getTime() - (a.publishedAt ?? a.createdAt).getTime(),
        ),
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

      const follower = await this.prisma.user.findUnique({
        where: { id: followerId },
        select: { name: true },
      });
      const followerLabel = follower?.name?.trim() || 'Uživatel';
      void this.notifications
        .create(
          followingId,
          'NEW_FOLLOWER',
          'Nový sledující',
          `${followerLabel} vás začal sledovat`,
          { followerId, profileUrl: `/profile/${followerId}` },
        )
        .catch((err) => {
          this.logger.warn(
            `[follow] notification failed followingId=${followingId}: ${
              err instanceof Error ? err.message : err
            }`,
          );
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
      select: {
        role: true,
        professionalVerified: true,
        professionalVerificationStatus: true,
      },
    });
    if (!u) throw new NotFoundException('User not found');

    if (isPublic) {
      if (
        !u.professionalVerified ||
        u.professionalVerificationStatus !== ProfessionalVerificationStatus.APPROVED
      ) {
        throw new ForbiddenException(
          'Profesní profil lze zveřejnit až po schválení administrátorem. Nejprve odešlete žádost o ověření.',
        );
      }
    }

    if (u.role === UserRole.AGENT) {
      const [userUpdate, profileUpdate] = await Promise.all([
        this.prisma.user.update({
          where: { id: userId },
          data: { isPublicBrokerProfile: isPublic, publicProfessionalProfile: isPublic },
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

  async updateUserProfileVisibility(userId: string, isPublic: boolean) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { isPublicBrokerProfile: isPublic },
    });
    return { isPublic };
  }

  async changePassword(userId: string, currentPassword: string, nextPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) {
      throw new BadRequestException('Aktuální heslo není správné.');
    }
    const hashed = await bcrypt.hash(nextPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });
    return { success: true };
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

  async updateWhatsAppSettings(
    userId: string,
    input: {
      whatsappPhone?: string;
      whatsappEnabled?: boolean;
      whatsappMarketingOptOut?: boolean;
      whatsappNotifyMyUploads?: boolean;
      whatsappNotifyNewPosts?: boolean;
    },
  ) {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        whatsappPhone: true,
        whatsappEnabled: true,
        whatsappMarketingOptOut: true,
        whatsappNotifyMyUploads: true,
        whatsappNotifyNewPosts: true,
      },
    });
    if (!current) {
      throw new NotFoundException('User not found');
    }

    const phoneRaw =
      input.whatsappPhone !== undefined
        ? input.whatsappPhone.trim()
        : current.whatsappPhone;
    const phone = normalizeToE164(phoneRaw) ?? phoneRaw;
    const enabled =
      input.whatsappEnabled !== undefined
        ? input.whatsappEnabled
        : current.whatsappEnabled;

    if (enabled && !isValidWhatsAppPhone(phone)) {
      throw new BadRequestException(
        'Pro zapnutí WhatsApp zadejte platné číslo ve formátu +420123456789.',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.whatsappPhone !== undefined ? { whatsappPhone: phone } : {}),
        ...(input.whatsappEnabled !== undefined ? { whatsappEnabled: enabled } : {}),
        ...(input.whatsappMarketingOptOut !== undefined
          ? {
              whatsappMarketingOptOut: input.whatsappMarketingOptOut,
              ...(input.whatsappMarketingOptOut === false
                ? { whatsappMarketingConsentAt: new Date() }
                : {}),
            }
          : {}),
        ...(input.whatsappNotifyMyUploads !== undefined
          ? {
              whatsappNotifyMyUploads: input.whatsappNotifyMyUploads,
              ...(input.whatsappNotifyMyUploads && !current.whatsappMarketingOptOut
                ? { whatsappMarketingConsentAt: new Date() }
                : {}),
            }
          : {}),
        ...(input.whatsappNotifyNewPosts !== undefined
          ? {
              whatsappNotifyNewPosts: input.whatsappNotifyNewPosts,
              ...(input.whatsappNotifyNewPosts && !current.whatsappMarketingOptOut
                ? { whatsappMarketingConsentAt: new Date() }
                : {}),
            }
          : {}),
      },
      select: {
        whatsappPhone: true,
        whatsappEnabled: true,
        whatsappMarketingOptOut: true,
        whatsappNotifyMyUploads: true,
        whatsappNotifyNewPosts: true,
      },
    });

    return {
      success: true,
      whatsappPhone: updated.whatsappPhone,
      whatsappEnabled: updated.whatsappEnabled,
      whatsappMarketingOptOut: updated.whatsappMarketingOptOut,
      whatsappNotifyMyUploads: updated.whatsappNotifyMyUploads,
      whatsappNotifyNewPosts: updated.whatsappNotifyNewPosts,
    };
  }
}
