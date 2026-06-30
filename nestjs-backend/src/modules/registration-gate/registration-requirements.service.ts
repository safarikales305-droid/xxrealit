import { Injectable } from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UpdateRegistrationRequirementDto } from './dto/update-registration-requirement.dto';

export const REGISTRATION_REQUIREMENT_ROLES: UserRole[] = [
  'USER',
  'AGENT',
  'AGENCY',
  'COMPANY',
  'CRAFTSMAN',
  'FINANCIAL_ADVISOR',
  'INVESTOR',
];

export type RegistrationStepKey =
  | 'FIRST_LISTING'
  | 'FIRST_POST'
  | 'FACEBOOK_PAGE'
  | 'PROFILE_COMPLETE'
  | 'PHONE_VERIFIED'
  | 'EMAIL_VERIFIED';

export type RegistrationStepStatus = {
  key: RegistrationStepKey;
  label: string;
  completed: boolean;
  required: boolean;
  href: string;
};

export type RegistrationRequirementsStatus = {
  allCompleted: boolean;
  pendingCount: number;
  steps: RegistrationStepStatus[];
};

const STEP_LABELS: Record<RegistrationStepKey, string> = {
  FIRST_LISTING: 'Vložit první inzerát',
  FIRST_POST: 'Vložit první příspěvek',
  FACEBOOK_PAGE: 'Propojit Facebook stránku',
  PROFILE_COMPLETE: 'Doplnit profil na 100 %',
  PHONE_VERIFIED: 'Ověřit telefon',
  EMAIL_VERIFIED: 'Ověřit e-mail',
};

const STEP_HREFS: Record<RegistrationStepKey, string> = {
  FIRST_LISTING: '/inzerat/pridat',
  FIRST_POST: '/profil',
  FACEBOOK_PAGE: '/profil/dashboard?tab=social-integrations',
  PROFILE_COMPLETE: '/profil/dashboard?tab=settings',
  PHONE_VERIFIED: '/profil/dashboard?tab=settings',
  EMAIL_VERIFIED: '/profil/dashboard?tab=settings',
};

@Injectable()
export class RegistrationRequirementsService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(row: {
    role: UserRole;
    requireFirstListing: boolean;
    requireFirstPost: boolean;
    requireFacebookPage: boolean;
    requireProfileComplete: boolean;
    requirePhoneVerified: boolean;
    requireEmailVerified: boolean;
    updatedAt: Date;
  }) {
    return {
      role: row.role,
      requireFirstListing: row.requireFirstListing,
      requireFirstPost: row.requireFirstPost,
      requireFacebookPage: row.requireFacebookPage,
      requireProfileComplete: row.requireProfileComplete,
      requirePhoneVerified: row.requirePhoneVerified,
      requireEmailVerified: row.requireEmailVerified,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async ensureDefaults(): Promise<void> {
    for (const role of REGISTRATION_REQUIREMENT_ROLES) {
      await this.prisma.registrationRequirementSetting.upsert({
        where: { role },
        create: { role },
        update: {},
      });
    }
  }

  async listForAdmin() {
    await this.ensureDefaults();
    const rows = await this.prisma.registrationRequirementSetting.findMany({
      where: { role: { in: REGISTRATION_REQUIREMENT_ROLES } },
      orderBy: { role: 'asc' },
    });
    return rows.map((r) => this.serialize(r));
  }

  async updateForRole(role: UserRole, dto: UpdateRegistrationRequirementDto) {
    await this.ensureDefaults();
    const updated = await this.prisma.registrationRequirementSetting.update({
      where: { role },
      data: {
        ...(dto.requireFirstListing !== undefined
          ? { requireFirstListing: dto.requireFirstListing }
          : {}),
        ...(dto.requireFirstPost !== undefined
          ? { requireFirstPost: dto.requireFirstPost }
          : {}),
        ...(dto.requireFacebookPage !== undefined
          ? { requireFacebookPage: dto.requireFacebookPage }
          : {}),
        ...(dto.requireProfileComplete !== undefined
          ? { requireProfileComplete: dto.requireProfileComplete }
          : {}),
        ...(dto.requirePhoneVerified !== undefined
          ? { requirePhoneVerified: dto.requirePhoneVerified }
          : {}),
        ...(dto.requireEmailVerified !== undefined
          ? { requireEmailVerified: dto.requireEmailVerified }
          : {}),
      },
    });
    return this.serialize(updated);
  }

  async getSettingsForRole(role: UserRole) {
    await this.ensureDefaults();
    return this.prisma.registrationRequirementSetting.findUnique({ where: { role } });
  }

  private async computeProfileCompletionPercent(userId: string, role: UserRole): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        phone: true,
        avatar: true,
        bio: true,
        city: true,
        agentProfile: { select: { id: true, bio: true, avatarUrl: true } },
        companyProfile: { select: { id: true, description: true, logoUrl: true } },
        agencyProfile: { select: { id: true } },
        financialAdvisorProfile: { select: { id: true } },
        investorProfile: { select: { id: true } },
      },
    });
    if (!user) return 0;

    const checks: boolean[] = [
      Boolean(user.name?.trim()),
      Boolean(user.phone?.trim()),
      Boolean(user.avatar?.trim()),
      Boolean(user.bio?.trim()),
      Boolean(user.city?.trim()),
    ];

    if (role === 'AGENT') {
      checks.push(Boolean(user.agentProfile?.bio?.trim()));
      checks.push(Boolean(user.agentProfile?.avatarUrl?.trim()));
    }
    if (role === 'COMPANY' || role === 'CRAFTSMAN') {
      checks.push(Boolean(user.companyProfile?.description?.trim()));
      checks.push(Boolean(user.companyProfile?.logoUrl?.trim()));
    }
    if (['AGENCY', 'FINANCIAL_ADVISOR', 'INVESTOR'].includes(role)) {
      checks.push(
        Boolean(
          user.agencyProfile?.id ||
            user.financialAdvisorProfile?.id ||
            user.investorProfile?.id,
        ),
      );
    }

    const done = checks.filter(Boolean).length;
    return Math.round((done / checks.length) * 100);
  }

  private async isFacebookPageRequirementMet(userId: string): Promise<boolean> {
    const page = await this.prisma.facebookPageConnection.findFirst({
      where: { userId, isActive: true },
      select: { id: true },
    });
    if (!page) return false;
    const imported = await this.prisma.facebookSyncedPost.count({
      where: { userId, pageConnectionId: page.id },
    });
    if (imported > 0) return true;
    const socialImported = await this.prisma.socialImportedPost.count({
      where: { userId, provider: 'FACEBOOK' },
    });
    return socialImported > 0;
  }

  async getStatusForUser(userId: string, role: UserRole): Promise<RegistrationRequirementsStatus> {
    if (role === 'ADMIN' || role === 'PROPERTY_SEEKER' || role === 'PORTAL_WORKER') {
      return { allCompleted: true, pendingCount: 0, steps: [] };
    }

    const settings = await this.getSettingsForRole(role);
    if (!settings) {
      return { allCompleted: true, pendingCount: 0, steps: [] };
    }

    const [listingCount, postCount, userFlags, profilePercent, facebookOk] =
      await Promise.all([
        this.prisma.property.count({ where: { userId, deletedAt: null } }),
        this.prisma.post.count({ where: { userId } }),
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { emailVerified: true, phone: true, whatsappPhone: true },
        }),
        this.computeProfileCompletionPercent(userId, role),
        settings.requireFacebookPage
          ? this.isFacebookPageRequirementMet(userId)
          : Promise.resolve(true),
      ]);

    const requirements: Array<{ key: RegistrationStepKey; required: boolean; completed: boolean }> =
      [
        {
          key: 'FIRST_LISTING',
          required: settings.requireFirstListing,
          completed: listingCount > 0,
        },
        {
          key: 'FIRST_POST',
          required: settings.requireFirstPost,
          completed: postCount > 0,
        },
        {
          key: 'FACEBOOK_PAGE',
          required: settings.requireFacebookPage,
          completed: facebookOk,
        },
        {
          key: 'PROFILE_COMPLETE',
          required: settings.requireProfileComplete,
          completed: profilePercent >= 100,
        },
        {
          key: 'PHONE_VERIFIED',
          required: settings.requirePhoneVerified,
          completed: Boolean(
            String(userFlags?.whatsappPhone ?? userFlags?.phone ?? '').trim(),
          ),
        },
        {
          key: 'EMAIL_VERIFIED',
          required: settings.requireEmailVerified,
          completed: Boolean(userFlags?.emailVerified),
        },
      ];

    const steps: RegistrationStepStatus[] = requirements
      .filter((r) => r.required)
      .map((r) => ({
        key: r.key,
        label: STEP_LABELS[r.key],
        completed: r.completed,
        required: true,
        href: STEP_HREFS[r.key],
      }));

    const pendingCount = steps.filter((s) => !s.completed).length;
    return {
      allCompleted: pendingCount === 0,
      pendingCount,
      steps,
    };
  }

  hasAnyRequirement(settings: {
    requireFirstListing: boolean;
    requireFirstPost: boolean;
    requireFacebookPage: boolean;
    requireProfileComplete: boolean;
    requirePhoneVerified: boolean;
    requireEmailVerified: boolean;
  }): boolean {
    return (
      settings.requireFirstListing ||
      settings.requireFirstPost ||
      settings.requireFacebookPage ||
      settings.requireProfileComplete ||
      settings.requirePhoneVerified ||
      settings.requireEmailVerified
    );
  }
}
