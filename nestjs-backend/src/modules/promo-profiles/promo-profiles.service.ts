import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AgentVerificationStatus, Prisma, ProfessionalVerificationStatus, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { ProfileImagesService } from '../upload/profile-images.service';
import { ProfileMediaStorageService } from '../upload/profile-media-storage.service';
import {
  publicProfileHref,
  verifiedBadgeLabelForRole,
} from '../brokers/professional-verification.util';
import {
  showVerifiedProfessionalBadge,
  type ProfileRequirementsInput,
} from '../users/profile-requirements.util';
import {
  composePromoDisplayName,
  generatePromoProfileName,
  isPromoProfileRole,
  PORTAL_CAROUSEL_ROLES,
  promoRoleLabel,
} from './promo-profile-role.util';

const bcrypt = require('bcrypt');

type CreatePromoInput = {
  firstName: string;
  lastName: string;
  role: UserRole;
  isPublic: boolean;
  active: boolean;
  avatarUrl?: string | null;
};

@Injectable()
export class PromoProfilesService {
  private readonly log = new Logger(PromoProfilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly profileImages: ProfileImagesService,
    private readonly profileMediaStorage: ProfileMediaStorageService,
  ) {}

  generateName() {
    return generatePromoProfileName();
  }

  private publicWhere(): Prisma.UserWhereInput {
    return {
      isPromoProfile: true,
      promoProfileActive: true,
      isPublicBrokerProfile: true,
    };
  }

  async listPublic(limit = 48) {
    return this.listPortalCarousel(limit);
  }

  /** Všechny veřejné profily na portálu (promo + běžné), bez jmen. */
  async listPortalCarousel(limit = 48) {
    const take = Math.min(Math.max(limit, 1), 100);
    const rows = await this.prisma.user.findMany({
      where: {
        role: { in: PORTAL_CAROUSEL_ROLES },
        avatar: { not: null },
        OR: [
          {
            isPromoProfile: true,
            promoProfileActive: true,
            isPublicBrokerProfile: true,
          },
          {
            isPromoProfile: false,
            OR: [
              { isPublicBrokerProfile: true },
              { publicProfessionalProfile: true },
            ],
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }],
      take: take * 2,
      select: {
        id: true,
        role: true,
        avatar: true,
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        emailVerified: true,
        whatsappVerified: true,
        city: true,
        address: true,
        postalCode: true,
        profileIco: true,
        isPromoProfile: true,
        promoProfileActive: true,
        isPublicBrokerProfile: true,
        publicProfessionalProfile: true,
        professionalVerified: true,
        professionalVerificationStatus: true,
        brokerOfficeName: true,
        agentProfile: {
          select: {
            verificationStatus: true,
            fullName: true,
            companyName: true,
            ico: true,
            city: true,
          },
        },
        companyProfile: {
          select: {
            verificationStatus: true,
            companyName: true,
            ico: true,
            city: true,
            contactFullName: true,
          },
        },
        agencyProfile: {
          select: {
            verificationStatus: true,
            agencyName: true,
            ico: true,
            city: true,
            contactFullName: true,
          },
        },
        financialAdvisorProfile: {
          select: {
            verificationStatus: true,
            fullName: true,
            ico: true,
            city: true,
          },
        },
        investorProfile: {
          select: {
            verificationStatus: true,
            fullName: true,
            city: true,
          },
        },
      },
    });

    const mapped = rows
      .filter((row) => Boolean(row.avatar?.trim()))
      .filter((row) => {
        if (row.isPromoProfile) {
          return row.promoProfileActive && row.isPublicBrokerProfile;
        }
        return row.isPublicBrokerProfile || row.publicProfessionalProfile;
      })
      .slice(0, take)
      .map((row) => {
        const reqInput: ProfileRequirementsInput = {
          role: row.role,
          name: row.name,
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          emailVerified: row.emailVerified === true,
          whatsappVerified: row.whatsappVerified === true,
          city: row.city,
          address: row.address,
          profileIco: row.profileIco,
          professionalVerified: Boolean(row.professionalVerified),
          professionalVerificationStatus: row.professionalVerificationStatus,
          brokerOfficeName: row.brokerOfficeName,
          agentProfile: row.agentProfile,
          companyProfile: row.companyProfile,
          agencyProfile: row.agencyProfile,
          financialAdvisorProfile: row.financialAdvisorProfile,
          investorProfile: row.investorProfile,
        };
        const verified = showVerifiedProfessionalBadge(reqInput);
        const profileHref = `/profile/${row.id}`;
        return {
          id: row.id,
          role: row.role,
          roleLabel: promoRoleLabel(row.role),
          avatarUrl: row.avatar,
          profileHref,
          isPromoProfile: Boolean(row.isPromoProfile),
          isVerified: verified,
          verifiedBadgeLabel: verified ? verifiedBadgeLabelForRole(row.role) : null,
        };
      });

    return mapped;
  }

  async listPromoOnly(limit = 48) {
    const rows = await this.prisma.user.findMany({
      where: this.publicWhere(),
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      select: {
        id: true,
        role: true,
        avatar: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      roleLabel: promoRoleLabel(row.role),
      avatarUrl: row.avatar,
      profileHref: `/profile/${row.id}`,
    }));
  }

  async listForAdmin() {
    const rows = await this.prisma.user.findMany({
      where: { isPromoProfile: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        promoFirstName: true,
        promoLastName: true,
        role: true,
        avatar: true,
        isPublicBrokerProfile: true,
        promoProfileActive: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      firstName: row.promoFirstName,
      lastName: row.promoLastName,
      name: row.name,
      role: row.role,
      roleLabel: promoRoleLabel(row.role),
      avatarUrl: row.avatar,
      isPublic: row.isPublicBrokerProfile,
      active: row.promoProfileActive,
      isPromoProfile: true,
      createdAt: row.createdAt,
    }));
  }

  async create(input: CreatePromoInput, avatarBuffer?: Buffer) {
    if (!isPromoProfileRole(input.role)) {
      throw new BadRequestException('Neplatná role pro promo profil.');
    }
    const firstName = input.firstName.trim().slice(0, 80);
    const lastName = input.lastName.trim().slice(0, 80);
    if (!firstName || !lastName) {
      throw new BadRequestException('Jméno a příjmení jsou povinné.');
    }
    const displayName = composePromoDisplayName(firstName, lastName);
    const id = randomUUID();
    const email = `promo-${id}@promo.internal`;
    const password = await bcrypt.hash(randomUUID(), 10);

    const user = await this.prisma.user.create({
      data: {
        id,
        email,
        password,
        name: displayName,
        role: input.role,
        isPromoProfile: true,
        promoProfileActive: input.active,
        promoFirstName: firstName,
        promoLastName: lastName,
        isPublicBrokerProfile: input.isPublic,
        publicProfessionalProfile: input.isPublic,
        professionalVerified: true,
        professionalVerificationStatus: ProfessionalVerificationStatus.APPROVED,
        emailVerified: true,
        avatar: input.avatarUrl?.trim() || null,
      },
    });

    let avatarUrl = user.avatar;
    if (avatarBuffer?.length) {
      avatarUrl = await this.storeAvatar(user.id, avatarBuffer);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { avatar: avatarUrl },
      });
    }

    await this.ensureRoleProfile(user.id, input.role, displayName, input.isPublic, avatarUrl);

    return this.toAdminRow(user.id);
  }

  private async storeAvatar(userId: string, buffer: Buffer): Promise<string> {
    const { buffer: out } = await this.profileImages.processAvatarForUpload(buffer);
    if (this.profileMediaStorage.isRemotePersistent()) {
      return this.profileMediaStorage.uploadAvatar(userId, out);
    }
    const fs = await import('node:fs');
    const { join } = await import('node:path');
    const { getUploadsPath } = await import('../../lib/uploads-path');
    const name = `${userId}-${Date.now()}.webp`;
    const dir = join(getUploadsPath(), 'avatars');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(join(dir, name), out);
    return `/uploads/avatars/${name}`;
  }

  private async ensureRoleProfile(
    userId: string,
    role: UserRole,
    fullName: string,
    isPublic: boolean,
    avatarUrl: string | null,
  ) {
    const verified = AgentVerificationStatus.verified;
    const commonPublic = { isPublic, verificationStatus: verified };
    switch (role) {
      case UserRole.AGENT:
        await this.prisma.agentProfile.upsert({
          where: { userId },
          create: {
            userId,
            fullName,
            companyName: '',
            phone: '',
            city: '',
            bio: '',
            avatarUrl,
            ...commonPublic,
          },
          update: { fullName, avatarUrl, ...commonPublic },
        });
        break;
      case UserRole.COMPANY:
        await this.prisma.companyProfile.upsert({
          where: { userId },
          create: {
            userId,
            companyName: fullName,
            contactFullName: fullName,
            phone: '',
            email: '',
            city: '',
            description: '',
            services: '',
            logoUrl: avatarUrl,
            ...commonPublic,
          },
          update: { companyName: fullName, contactFullName: fullName, logoUrl: avatarUrl, ...commonPublic },
        });
        break;
      case UserRole.AGENCY:
        await this.prisma.agencyProfile.upsert({
          where: { userId },
          create: {
            userId,
            agencyName: fullName,
            contactFullName: fullName,
            phone: '',
            email: '',
            city: '',
            description: '',
            branchCities: [],
            logoUrl: avatarUrl,
            ...commonPublic,
          },
          update: { agencyName: fullName, contactFullName: fullName, logoUrl: avatarUrl, ...commonPublic },
        });
        break;
      case UserRole.FINANCIAL_ADVISOR:
        await this.prisma.financialAdvisorProfile.upsert({
          where: { userId },
          create: {
            userId,
            fullName,
            phone: '',
            email: '',
            city: '',
            bio: '',
            specializations: [],
            avatarUrl,
            ...commonPublic,
          },
          update: { fullName, avatarUrl, ...commonPublic },
        });
        break;
      case UserRole.INVESTOR:
        await this.prisma.investorProfile.upsert({
          where: { userId },
          create: {
            userId,
            fullName,
            phone: '',
            email: '',
            city: '',
            bio: '',
            investmentFocus: [],
            avatarUrl,
            ...commonPublic,
          },
          update: { fullName, avatarUrl, ...commonPublic },
        });
        break;
      case UserRole.CRAFTSMAN:
        break;
      default:
        break;
    }
  }

  private async syncRoleProfilePublic(userId: string, role: UserRole, isPublic: boolean) {
    const data = { isPublic, verificationStatus: AgentVerificationStatus.verified };
    switch (role) {
      case UserRole.AGENT:
        await this.prisma.agentProfile.updateMany({ where: { userId }, data });
        break;
      case UserRole.COMPANY:
        await this.prisma.companyProfile.updateMany({ where: { userId }, data });
        break;
      case UserRole.AGENCY:
        await this.prisma.agencyProfile.updateMany({ where: { userId }, data });
        break;
      case UserRole.FINANCIAL_ADVISOR:
        await this.prisma.financialAdvisorProfile.updateMany({ where: { userId }, data });
        break;
      case UserRole.INVESTOR:
        await this.prisma.investorProfile.updateMany({ where: { userId }, data });
        break;
      default:
        break;
    }
  }

  async bulkAction(ids: string[], action: 'publish' | 'hide' | 'deactivate' | 'delete') {
    const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) {
      throw new BadRequestException('Vyberte alespoň jeden profil.');
    }
    const rows = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds }, isPromoProfile: true },
      select: { id: true, role: true },
    });
    if (rows.length === 0) {
      throw new NotFoundException('Žádné promo profily nenalezeny.');
    }
    const foundIds = rows.map((r) => r.id);

    if (action === 'delete') {
      await this.prisma.user.deleteMany({
        where: { id: { in: foundIds }, isPromoProfile: true },
      });
      return { affected: foundIds.length, action };
    }

    if (action === 'publish') {
      await this.prisma.user.updateMany({
        where: { id: { in: foundIds } },
        data: { isPublicBrokerProfile: true, publicProfessionalProfile: true },
      });
      for (const row of rows) {
        await this.syncRoleProfilePublic(row.id, row.role, true);
      }
      return { affected: foundIds.length, action };
    }

    if (action === 'hide') {
      await this.prisma.user.updateMany({
        where: { id: { in: foundIds } },
        data: { isPublicBrokerProfile: false, publicProfessionalProfile: false },
      });
      for (const row of rows) {
        await this.syncRoleProfilePublic(row.id, row.role, false);
      }
      return { affected: foundIds.length, action };
    }

    await this.prisma.user.updateMany({
      where: { id: { in: foundIds } },
      data: { promoProfileActive: false },
    });
    return { affected: foundIds.length, action };
  }

  private async toAdminRow(userId: string) {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        promoFirstName: true,
        promoLastName: true,
        role: true,
        avatar: true,
        isPublicBrokerProfile: true,
        promoProfileActive: true,
        createdAt: true,
      },
    });
    if (!row) throw new NotFoundException('Profil nenalezen');
    return {
      id: row.id,
      firstName: row.promoFirstName,
      lastName: row.promoLastName,
      name: row.name,
      role: row.role,
      roleLabel: promoRoleLabel(row.role),
      avatarUrl: row.avatar,
      isPublic: row.isPublicBrokerProfile,
      active: row.promoProfileActive,
      isPromoProfile: true,
      createdAt: row.createdAt,
    };
  }
}
