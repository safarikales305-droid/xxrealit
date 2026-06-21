import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  PROPERTY_SEEKER_SHARE_REQUIRED,
  propertySeekerOnboardingComplete,
} from '../../common/property-seeker.util';

@Injectable()
export class PropertySeekerService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        whatsappVerified: true,
        whatsappPhone: true,
        shareCount: true,
        shareCompletedAt: true,
        marketingConsentWhatsApp: true,
        marketingConsentEmail: true,
        consentCreatedAt: true,
        consentSource: true,
        invitedViaWhatsApp: true,
      },
    });
    if (!user) throw new NotFoundException('Uživatel nenalezen.');
    if (user.role !== UserRole.PROPERTY_SEEKER) {
      throw new ForbiddenException('Tato funkce je jen pro hledače nemovitosti.');
    }
    const onboardingComplete = propertySeekerOnboardingComplete({
      whatsappVerified: user.whatsappVerified,
      shareCount: user.shareCount,
      shareCompletedAt: user.shareCompletedAt,
    });
    return {
      role: user.role,
      whatsappVerified: user.whatsappVerified,
      whatsappPhone: user.whatsappPhone,
      shareCount: user.shareCount,
      shareRequired: PROPERTY_SEEKER_SHARE_REQUIRED,
      shareCompletedAt: user.shareCompletedAt?.toISOString() ?? null,
      onboardingComplete,
      marketingConsentWhatsApp: user.marketingConsentWhatsApp,
      marketingConsentEmail: user.marketingConsentEmail,
      invitedViaWhatsApp: user.invitedViaWhatsApp,
    };
  }

  async recordShare(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        whatsappVerified: true,
        shareCount: true,
        shareCompletedAt: true,
      },
    });
    if (!user) throw new NotFoundException('Uživatel nenalezen.');
    if (user.role !== UserRole.PROPERTY_SEEKER) {
      throw new ForbiddenException('Sdílení portálu je jen pro hledače nemovitosti.');
    }
    if (!user.whatsappVerified) {
      throw new BadRequestException('Nejdříve ověřte WhatsApp číslo.');
    }
    if (user.shareCompletedAt) {
      return {
        shareCount: user.shareCount,
        shareRequired: PROPERTY_SEEKER_SHARE_REQUIRED,
        completed: true,
      };
    }

    const nextCount = user.shareCount + 1;
    const completed = nextCount >= PROPERTY_SEEKER_SHARE_REQUIRED;
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        shareCount: nextCount,
        invitedViaWhatsApp: true,
        ...(completed
          ? { shareCompletedAt: new Date() }
          : {}),
      },
      select: { shareCount: true, shareCompletedAt: true },
    });

    return {
      shareCount: updated.shareCount,
      shareRequired: PROPERTY_SEEKER_SHARE_REQUIRED,
      completed: Boolean(updated.shareCompletedAt),
      shareCompletedAt: updated.shareCompletedAt?.toISOString() ?? null,
    };
  }

  async listForAdmin() {
    const rows = await this.prisma.user.findMany({
      where: { role: UserRole.PROPERTY_SEEKER },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        whatsappPhone: true,
        whatsappVerified: true,
        whatsappVerifiedPhone: true,
        marketingConsentWhatsApp: true,
        marketingConsentEmail: true,
        consentCreatedAt: true,
        consentSource: true,
        shareCount: true,
        shareCompletedAt: true,
        invitedViaWhatsApp: true,
        createdAt: true,
      },
    });
    return {
      total: rows.length,
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        whatsappPhone: r.whatsappPhone,
        whatsappVerifiedPhone: r.whatsappVerifiedPhone,
        whatsappVerified: r.whatsappVerified,
        marketingConsentWhatsApp: r.marketingConsentWhatsApp,
        marketingConsentEmail: r.marketingConsentEmail,
        consentCreatedAt: r.consentCreatedAt?.toISOString() ?? null,
        consentSource: r.consentSource,
        shareCount: r.shareCount,
        shareCompletedAt: r.shareCompletedAt?.toISOString() ?? null,
        invitedViaWhatsApp: r.invitedViaWhatsApp,
        registeredAt: r.createdAt.toISOString(),
      })),
    };
  }

  exportCsv(): Promise<string> {
    return this.listForAdmin().then(({ items }) => {
      const header =
        'id,name,email,phone,whatsappPhone,whatsappVerified,marketingConsentWhatsApp,marketingConsentEmail,shareCount,shareCompletedAt,registeredAt';
      const lines = items.map((r) =>
        [
          r.id,
          `"${(r.name ?? '').replace(/"/g, '""')}"`,
          r.email,
          r.phone,
          r.whatsappPhone,
          r.whatsappVerified ? '1' : '0',
          r.marketingConsentWhatsApp ? '1' : '0',
          r.marketingConsentEmail ? '1' : '0',
          r.shareCount,
          r.shareCompletedAt ?? '',
          r.registeredAt,
        ].join(','),
      );
      return [header, ...lines].join('\n');
    });
  }
}
