import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProfessionalVerificationStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { CreateTestAccountDto } from './dto/create-test-account.dto';
import type { UpdateTestAccountDto } from './dto/update-test-account.dto';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcrypt');

export type TestAccountConfig = {
  resetPaidCredit: number;
  resetBonusCredit: number;
  emailVerified: boolean;
  whatsappVerified: boolean;
  profileApproved: boolean;
  publicProfile: boolean;
  testPhone: string;
};

function defaultConfig(overrides: Partial<TestAccountConfig> = {}): TestAccountConfig {
  return {
    resetPaidCredit: 500,
    resetBonusCredit: 100,
    emailVerified: true,
    whatsappVerified: true,
    profileApproved: false,
    publicProfile: false,
    testPhone: '+420777000000',
    ...overrides,
  };
}

function parseConfig(raw: unknown): TestAccountConfig {
  if (!raw || typeof raw !== 'object') return defaultConfig();
  const o = raw as Record<string, unknown>;
  return defaultConfig({
    resetPaidCredit:
      typeof o.resetPaidCredit === 'number' ? Math.max(0, Math.trunc(o.resetPaidCredit)) : undefined,
    resetBonusCredit:
      typeof o.resetBonusCredit === 'number'
        ? Math.max(0, Math.trunc(o.resetBonusCredit))
        : undefined,
    emailVerified: o.emailVerified === true,
    whatsappVerified: o.whatsappVerified === true,
    profileApproved: o.profileApproved === true,
    publicProfile: o.publicProfile === true,
    testPhone: typeof o.testPhone === 'string' ? o.testPhone : undefined,
  });
}

@Injectable()
export class PortalTestingService {
  constructor(private readonly prisma: PrismaService) {}

  private serializeUser(row: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    isTestAccount: boolean;
    testAccountPublicVisible: boolean;
    testAccountConfig: unknown;
    realCreditBalance: number;
    bonusCreditBalance: number;
    emailVerified: boolean;
    whatsappVerified: boolean;
    whatsappPhone: string;
    professionalVerificationStatus: ProfessionalVerificationStatus;
    publicProfessionalProfile: boolean;
    isPublicBrokerProfile: boolean;
    createdAt: Date;
  }) {
    const cfg = parseConfig(row.testAccountConfig);
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      isTestAccount: row.isTestAccount,
      testAccountPublicVisible: row.testAccountPublicVisible,
      config: cfg,
      paidCredit: row.realCreditBalance,
      bonusCredit: row.bonusCreditBalance,
      emailVerified: row.emailVerified,
      whatsappVerified: row.whatsappVerified,
      whatsappPhone: row.whatsappPhone,
      profileApproved: row.professionalVerificationStatus === 'APPROVED',
      publicProfile: row.publicProfessionalProfile || row.isPublicBrokerProfile,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listTestAccounts() {
    const rows = await this.prisma.user.findMany({
      where: { isTestAccount: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isTestAccount: true,
        testAccountPublicVisible: true,
        testAccountConfig: true,
        realCreditBalance: true,
        bonusCreditBalance: true,
        emailVerified: true,
        whatsappVerified: true,
        whatsappPhone: true,
        professionalVerificationStatus: true,
        publicProfessionalProfile: true,
        isPublicBrokerProfile: true,
        createdAt: true,
      },
    });
    return { items: rows.map((r) => this.serializeUser(r)), total: rows.length };
  }

  async createTestAccount(dto: CreateTestAccountDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new BadRequestException('E-mail je již použitý.');

    const config = defaultConfig({
      resetPaidCredit: dto.paidCredit,
      resetBonusCredit: dto.bonusCredit,
      emailVerified: dto.emailVerified,
      whatsappVerified: dto.whatsappVerified,
      profileApproved: dto.profileApproved,
      publicProfile: dto.publicProfile,
      testPhone: dto.testPhone?.trim() || '+420777000000',
    });

    const hashed = await bcrypt.hash(dto.password, 10);
    const now = new Date();
    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name.trim(),
        password: hashed,
        role: dto.role as UserRole,
        isTestAccount: true,
        testAccountPublicVisible: dto.publicVisible === true,
        testAccountConfig: config as object,
        realCreditBalance: config.resetPaidCredit,
        bonusCreditBalance: config.resetBonusCredit,
        creditBalance: config.resetPaidCredit + config.resetBonusCredit,
        emailVerified: config.emailVerified,
        emailVerifiedAt: config.emailVerified ? now : null,
        whatsappPhone: config.testPhone,
        whatsappVerified: config.whatsappVerified,
        whatsappVerifiedAt: config.whatsappVerified ? now : null,
        professionalVerificationStatus: config.profileApproved
          ? ProfessionalVerificationStatus.APPROVED
          : ProfessionalVerificationStatus.NONE,
        professionalVerified: config.profileApproved,
        professionalVerifiedAt: config.profileApproved ? now : null,
        publicProfessionalProfile: config.publicProfile,
        isPublicBrokerProfile: config.publicProfile,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isTestAccount: true,
        testAccountPublicVisible: true,
        testAccountConfig: true,
        realCreditBalance: true,
        bonusCreditBalance: true,
        emailVerified: true,
        whatsappVerified: true,
        whatsappPhone: true,
        professionalVerificationStatus: true,
        publicProfessionalProfile: true,
        isPublicBrokerProfile: true,
        createdAt: true,
      },
    });

    await this.prisma.creditLedger.create({
      data: {
        userId: user.id,
        amount: config.resetPaidCredit,
        type: 'TEST',
        creditType: 'REAL',
        purpose: 'TEST',
        description: 'Počáteční testovací placený kredit',
      },
    });
    if (config.resetBonusCredit > 0) {
      await this.prisma.creditLedger.create({
        data: {
          userId: user.id,
          amount: config.resetBonusCredit,
          type: 'TEST',
          creditType: 'BONUS',
          purpose: 'TEST',
          description: 'Počáteční testovací bonusový kredit',
        },
      });
    }

    return this.serializeUser(user);
  }

  async updateTestAccount(userId: string, dto: UpdateTestAccountDto) {
    const user = await this.requireTestAccount(userId);
    const config = parseConfig(user.testAccountConfig);
    const nextConfig = defaultConfig({
      ...config,
      ...(dto.paidCredit !== undefined ? { resetPaidCredit: dto.paidCredit } : {}),
      ...(dto.bonusCredit !== undefined ? { resetBonusCredit: dto.bonusCredit } : {}),
      ...(dto.emailVerified !== undefined ? { emailVerified: dto.emailVerified } : {}),
      ...(dto.whatsappVerified !== undefined ? { whatsappVerified: dto.whatsappVerified } : {}),
      ...(dto.profileApproved !== undefined ? { profileApproved: dto.profileApproved } : {}),
      ...(dto.publicProfile !== undefined ? { publicProfile: dto.publicProfile } : {}),
      ...(dto.testPhone !== undefined ? { testPhone: dto.testPhone } : {}),
    });

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.publicVisible !== undefined
          ? { testAccountPublicVisible: dto.publicVisible }
          : {}),
        testAccountConfig: nextConfig as object,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isTestAccount: true,
        testAccountPublicVisible: true,
        testAccountConfig: true,
        realCreditBalance: true,
        bonusCreditBalance: true,
        emailVerified: true,
        whatsappVerified: true,
        whatsappPhone: true,
        professionalVerificationStatus: true,
        publicProfessionalProfile: true,
        isPublicBrokerProfile: true,
        createdAt: true,
      },
    });
    return this.serializeUser(updated);
  }

  async resetTestAccount(userId: string) {
    const user = await this.requireTestAccount(userId);
    const config = parseConfig(user.testAccountConfig);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.contactLead.deleteMany({
        where: { OR: [{ interestedUserId: userId }, { ownerUserId: userId }] },
      });
      await tx.listingContactUnlock.deleteMany({ where: { userId } });
      await tx.contactUnlock.deleteMany({ where: { userId } });

      const convIds = (
        await tx.propertyConversation.findMany({
          where: { OR: [{ userLowId: userId }, { userHighId: userId }] },
          select: { id: true },
        })
      ).map((c) => c.id);
      if (convIds.length > 0) {
        await tx.propertyMessage.deleteMany({ where: { conversationId: { in: convIds } } });
        await tx.propertyConversation.deleteMany({ where: { id: { in: convIds } } });
      }

      await tx.userNotification.deleteMany({ where: { userId } });
      await tx.creditLedger.deleteMany({ where: { userId } });
      await tx.creditTransaction.deleteMany({
        where: { OR: [{ buyerUserId: userId }, { tiparUserId: userId }] },
      });
      await tx.propertyLike.deleteMany({ where: { userId } });
      await tx.favorite.deleteMany({ where: { userId } });
      await tx.follow.deleteMany({
        where: { OR: [{ followerId: userId }, { followingId: userId }] },
      });
      await tx.webPushSubscription.deleteMany({ where: { userId } });
      await tx.postReaction.deleteMany({ where: { userId } });
      await tx.comment.deleteMany({ where: { userId } });

      await tx.user.update({
        where: { id: userId },
        data: {
          realCreditBalance: config.resetPaidCredit,
          bonusCreditBalance: config.resetBonusCredit,
          pendingCreditBalance: 0,
          creditBalance: config.resetPaidCredit + config.resetBonusCredit,
          creditDebt: 0,
          accountLimited: false,
          emailVerified: config.emailVerified,
          emailVerifiedAt: config.emailVerified ? now : null,
          emailVerificationToken: null,
          emailVerificationExpires: null,
          whatsappPhone: config.testPhone,
          whatsappVerified: config.whatsappVerified,
          whatsappVerifiedAt: config.whatsappVerified ? now : null,
          whatsappVerificationCode: null,
          whatsappVerificationExpiresAt: null,
          whatsappVerificationAttempts: 0,
          whatsappVerificationSentAt: null,
          professionalVerificationStatus: config.profileApproved
            ? ProfessionalVerificationStatus.APPROVED
            : ProfessionalVerificationStatus.NONE,
          professionalVerified: config.profileApproved,
          professionalVerifiedAt: config.profileApproved ? now : null,
          publicProfessionalProfile: config.publicProfile,
          isPublicBrokerProfile: config.publicProfile,
        },
      });

      if (config.resetPaidCredit > 0) {
        await tx.creditLedger.create({
          data: {
            userId,
            amount: config.resetPaidCredit,
            type: 'TEST',
            creditType: 'REAL',
            purpose: 'TEST',
            description: 'Reset testovacího placeného kreditu',
          },
        });
      }
      if (config.resetBonusCredit > 0) {
        await tx.creditLedger.create({
          data: {
            userId,
            amount: config.resetBonusCredit,
            type: 'TEST',
            creditType: 'BONUS',
            purpose: 'TEST',
            description: 'Reset testovacího bonusového kreditu',
          },
        });
      }
    });

    return { ok: true, message: 'Testovací účet byl resetován.' };
  }

  async runScenario(userId: string, scenario: string) {
    const user = await this.requireTestAccount(userId);
    const config = parseConfig(user.testAccountConfig);

    switch (scenario) {
      case 'lead_with_credit':
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            realCreditBalance: 1000,
            bonusCreditBalance: 0,
            creditBalance: 1000,
          },
        });
        return {
          scenario,
          message: 'Nastaven placený kredit 1000 Kč pro test leadu s kreditem.',
          hint: 'Otevřete inzerát jako jiný uživatel a odešlete zájem.',
        };
      case 'lead_without_credit':
        await this.prisma.user.update({
          where: { id: userId },
          data: { realCreditBalance: 0, bonusCreditBalance: 0, creditBalance: 0 },
        });
        return {
          scenario,
          message: 'Kredit vynulován — lead půjde do WAITING_FOR_CREDIT.',
        };
      case 'contact_unlock':
        return {
          scenario,
          message: 'Otevřete detail inzerátu a použijte „Zobrazit kontakt“.',
          url: '/nemovitosti',
        };
      case 'shorts_contact':
        return { scenario, message: 'Test Shorts kontaktu.', url: '/?tab=shorts' };
      case 'classic_contact':
        return { scenario, message: 'Test Classic kontaktu.', url: '/nemovitosti' };
      case 'tipster_paid_credit':
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            isTipar: true,
            realCreditBalance: 500,
            bonusCreditBalance: 0,
            creditBalance: 500,
          },
        });
        return { scenario, message: 'Tipař s placeným kreditem 500 Kč.' };
      case 'tipster_bonus_credit':
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            isTipar: true,
            realCreditBalance: 0,
            bonusCreditBalance: 500,
            creditBalance: 500,
          },
        });
        return {
          scenario,
          message: 'Tipař s bonusovým kreditem — tip unlock vyžaduje placený kredit.',
        };
      case 'whatsapp_verify':
        return {
          scenario,
          message: `Ověřte WhatsApp na testovacím čísle ${config.testPhone}.`,
          url: '/profil/dashboard?tab=settings#whatsapp-verify',
        };
      case 'email_verify':
        return {
          scenario,
          message: `Test e-mailu na ${user.email} (jen testovací účet).`,
          url: '/profil/dashboard?tab=settings',
        };
      case 'professional_verified':
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            professionalVerificationStatus: ProfessionalVerificationStatus.APPROVED,
            professionalVerified: true,
            professionalVerifiedAt: new Date(),
            publicProfessionalProfile: true,
          },
        });
        return { scenario, message: 'Profesionální profil schválen (test).' };
      case 'pwa_notification':
        await this.prisma.userNotification.create({
          data: {
            userId,
            type: 'TEST',
            title: 'Test PWA upozornění',
            body: 'Toto je testovací notifikace z administrace portálu.',
            data: { test: true, scenario: 'pwa_notification' },
          },
        });
        return {
          scenario,
          message: 'Testovací in-app notifikace byla vytvořena.',
          url: '/profil/dashboard?tab=notifications',
        };
      case 'whatsapp_message':
        return {
          scenario,
          message: `Test WhatsApp zprávy pouze na ${config.testPhone} (bez hromadné kampaně).`,
        };
      case 'email_message':
        return {
          scenario,
          message: `Test e-mailu pouze na ${user.email}.`,
        };
      default:
        throw new BadRequestException('Neznámý testovací scénář.');
    }
  }

  private async requireTestAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        isTestAccount: true,
        testAccountConfig: true,
      },
    });
    if (!user) throw new NotFoundException('Uživatel nenalezen.');
    if (!user.isTestAccount) {
      throw new BadRequestException('Akce je povolena jen pro testovací účty.');
    }
    return user;
  }
}
