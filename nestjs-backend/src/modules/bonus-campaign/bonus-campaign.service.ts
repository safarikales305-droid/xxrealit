import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BonusAppliesTo,
  BonusSourceType,
  MarketingBonusActionType,
  Prisma,
  type BonusCampaign,
  type UserRole,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { CreditLedgerPurpose } from '../credits/credit-wallet.types';
import { CreditWalletService } from '../credits/credit-wallet.service';
import { ReferralService } from './referral.service';
import { CreateBonusCampaignDto } from './dto/create-bonus-campaign.dto';
import { UpdateBonusCampaignDto } from './dto/update-bonus-campaign.dto';

export type BonusGrantedResult = {
  granted: boolean;
  amount?: number;
  message?: string;
  campaignId?: string;
};

export type PublicBonusCampaign = {
  id: string;
  title: string;
  description: string;
  ctaText: string;
  bonusText: string;
  amount: number;
  actionType: MarketingBonusActionType;
  conditionMinCount: number;
};

const DEFAULT_CTA_TEXT = 'Založ účet, inzeruj a vydělávej';
const DEFAULT_BONUS_TEXT =
  'Bonus 1 000 Kč kreditu při vložení inzerátu nebo tipu';

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (value == null || !String(value).trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatBonusMessage(amount: number): string {
  return `Gratulujeme, získali jste bonus ${amount.toLocaleString('cs-CZ')} Kč kreditu.`;
}

function trimOrDefault(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function ledgerPurposeForAction(
  actionType: MarketingBonusActionType,
): CreditLedgerPurpose {
  switch (actionType) {
    case MarketingBonusActionType.FACEBOOK_CONNECT:
      return 'FACEBOOK_CONNECT';
    case MarketingBonusActionType.INVITE_EMAIL:
      return 'INVITE_EMAIL';
    case MarketingBonusActionType.INVITE_WHATSAPP:
      return 'INVITE_WHATSAPP';
    case MarketingBonusActionType.REFERRAL_REGISTRATION:
      return 'INVITE_EMAIL';
    case MarketingBonusActionType.FIRST_AD:
      return 'FIRST_AD';
    case MarketingBonusActionType.FIRST_VIDEO_AD:
      return 'FIRST_VIDEO_AD';
    case MarketingBonusActionType.FIRST_POST:
      return 'FIRST_POST';
    case MarketingBonusActionType.PROFILE_COMPLETE:
      return 'PROFILE_COMPLETE';
    case MarketingBonusActionType.PROFILE_VERIFIED:
      return 'PROFILE_VERIFIED';
    case MarketingBonusActionType.CUSTOM:
      return 'CUSTOM';
    default:
      return 'BONUS_GRANTED';
  }
}

@Injectable()
export class BonusCampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: CreditWalletService,
    private readonly referral: ReferralService,
  ) {}

  private isWithinDates(campaign: BonusCampaign, now: Date): boolean {
    if (campaign.activeFrom && now < campaign.activeFrom) return false;
    if (campaign.activeTo && now > campaign.activeTo) return false;
    return true;
  }

  private appliesToSource(appliesTo: BonusAppliesTo, sourceType: BonusSourceType): boolean {
    if (appliesTo === BonusAppliesTo.BOTH) return true;
    if (appliesTo === BonusAppliesTo.LISTING) return sourceType === BonusSourceType.LISTING;
    return sourceType === BonusSourceType.TIP;
  }

  private roleMatches(campaign: BonusCampaign, role: UserRole): boolean {
    if (!campaign.roles?.length) return true;
    return campaign.roles.includes(role);
  }

  private serializePublic(campaign: BonusCampaign): PublicBonusCampaign {
    return {
      id: campaign.id,
      title: campaign.title.trim(),
      description: campaign.description?.trim() ?? '',
      ctaText: campaign.ctaText.trim(),
      bonusText: campaign.bonusText.trim(),
      amount: campaign.amount,
      actionType: campaign.actionType,
      conditionMinCount: campaign.conditionMinCount,
    };
  }

  private serializeAdmin(campaign: BonusCampaign & { _count?: { claims: number } }) {
    return {
      id: campaign.id,
      title: campaign.title,
      description: campaign.description ?? '',
      ctaText: campaign.ctaText,
      bonusText: campaign.bonusText,
      amount: campaign.amount,
      appliesTo: campaign.appliesTo,
      actionType: campaign.actionType,
      roles: campaign.roles ?? [],
      isActive: campaign.isActive,
      activeFrom: campaign.activeFrom?.toISOString() ?? null,
      activeTo: campaign.activeTo?.toISOString() ?? null,
      oncePerUser: campaign.oncePerUser,
      maxTotalClaims: campaign.maxTotalClaims,
      maxClaimsPerUser: campaign.maxClaimsPerUser,
      conditionMinCount: campaign.conditionMinCount,
      customConditionText: campaign.customConditionText ?? '',
      claimsCount: campaign._count?.claims ?? undefined,
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
    };
  }

  async getActiveForPublic(): Promise<PublicBonusCampaign | null> {
    const now = new Date();
    const rows = await this.prisma.bonusCampaign.findMany({
      where: { isActive: true },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
    const match = rows.find((c) => this.isWithinDates(c, now));
    return match ? this.serializePublic(match) : null;
  }

  async listActiveForUser(userId: string): Promise<PublicBonusCampaign[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) return [];
    const now = new Date();
    const rows = await this.prisma.bonusCampaign.findMany({
      where: { isActive: true },
      orderBy: [{ amount: 'desc' }, { updatedAt: 'desc' }],
    });
    return rows
      .filter((c) => this.isWithinDates(c, now) && this.roleMatches(c, user.role))
      .map((c) => this.serializePublic(c));
  }

  async listForAdmin() {
    const rows = await this.prisma.bonusCampaign.findMany({
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
      include: { _count: { select: { claims: true } } },
    });
    return rows.map((c) => this.serializeAdmin(c));
  }

  async listClaimsForAdmin(limit = 200) {
    const claims = await this.prisma.bonusClaim.findMany({
      take: Math.min(500, Math.max(1, limit)),
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        campaign: { select: { id: true, title: true, actionType: true } },
      },
    });
    const totalCredits = claims.reduce((sum, c) => sum + c.amount, 0);
    return {
      summary: {
        totalClaims: claims.length,
        totalCreditsGranted: totalCredits,
      },
      claims: claims.map((c) => ({
        id: c.id,
        userId: c.userId,
        userName: c.user.name,
        userEmail: c.user.email,
        userRole: c.user.role,
        campaignId: c.campaignId,
        campaignTitle: c.campaign.title,
        actionType: c.campaign.actionType,
        amount: c.amount,
        reason: c.reason,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  async create(dto: CreateBonusCampaignDto) {
    const created = await this.prisma.bonusCampaign.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() ?? '',
        ctaText: trimOrDefault(dto.ctaText, DEFAULT_CTA_TEXT),
        bonusText: trimOrDefault(dto.bonusText, DEFAULT_BONUS_TEXT),
        amount: Math.max(1, Math.trunc(dto.amount)),
        appliesTo: dto.appliesTo ?? BonusAppliesTo.BOTH,
        actionType: dto.actionType ?? MarketingBonusActionType.LEGACY_LISTING_TIP,
        roles: dto.roles ?? [],
        isActive: dto.isActive ?? false,
        activeFrom: parseOptionalDate(dto.activeFrom),
        activeTo: parseOptionalDate(dto.activeTo),
        oncePerUser: dto.oncePerUser ?? true,
        maxTotalClaims: dto.maxTotalClaims ?? null,
        maxClaimsPerUser: dto.maxClaimsPerUser ?? 1,
        conditionMinCount: dto.conditionMinCount ?? 1,
        customConditionText: dto.customConditionText?.trim() ?? '',
      },
    });
    return this.serializeAdmin(created);
  }

  async update(id: string, dto: UpdateBonusCampaignDto) {
    const existing = await this.prisma.bonusCampaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Bonusová akce nenalezena');

    const data: Prisma.BonusCampaignUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description.trim();
    if (dto.ctaText !== undefined) data.ctaText = trimOrDefault(dto.ctaText, DEFAULT_CTA_TEXT);
    if (dto.bonusText !== undefined) data.bonusText = trimOrDefault(dto.bonusText, DEFAULT_BONUS_TEXT);
    if (dto.amount !== undefined) data.amount = Math.max(1, Math.trunc(dto.amount));
    if (dto.appliesTo !== undefined) data.appliesTo = dto.appliesTo;
    if (dto.actionType !== undefined) data.actionType = dto.actionType;
    if (dto.roles !== undefined) data.roles = dto.roles;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.activeFrom !== undefined) data.activeFrom = parseOptionalDate(dto.activeFrom);
    if (dto.activeTo !== undefined) data.activeTo = parseOptionalDate(dto.activeTo);
    if (dto.oncePerUser !== undefined) data.oncePerUser = dto.oncePerUser;
    if (dto.maxTotalClaims !== undefined) data.maxTotalClaims = dto.maxTotalClaims;
    if (dto.maxClaimsPerUser !== undefined) data.maxClaimsPerUser = dto.maxClaimsPerUser;
    if (dto.conditionMinCount !== undefined) data.conditionMinCount = dto.conditionMinCount;
    if (dto.customConditionText !== undefined) {
      data.customConditionText = dto.customConditionText.trim();
    }

    const updated = await this.prisma.bonusCampaign.update({ where: { id }, data });
    return this.serializeAdmin(updated);
  }

  async delete(id: string) {
    const existing = await this.prisma.bonusCampaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Bonusová akce nenalezena');
    await this.prisma.bonusCampaign.delete({ where: { id } });
    return { ok: true };
  }

  async manualGrant(input: {
    userId: string;
    amount: number;
    campaignId?: string;
    reason?: string;
    description?: string;
  }) {
    const amount = Math.max(1, Math.trunc(input.amount));
    const purpose = (input.reason?.trim() || 'CUSTOM') as CreditLedgerPurpose;
    const campaignId = input.campaignId?.trim() || null;
    let claimId: string | null = null;

    await this.prisma.$transaction(async (tx) => {
      await this.wallet.creditBonus(
        tx,
        input.userId,
        amount,
        campaignId,
        input.description?.trim() || `Manuální bonus ${amount} Kč`,
        purpose,
      );
      if (campaignId) {
        const claim = await tx.bonusClaim.create({
          data: {
            userId: input.userId,
            campaignId,
            amount,
            reason: purpose,
          },
        });
        claimId = claim.id;
      }
    });

    return { ok: true, claimId, amount };
  }

  async manualRevoke(claimId: string) {
    const claim = await this.prisma.bonusClaim.findUnique({
      where: { id: claimId },
      include: { campaign: { select: { title: true } } },
    });
    if (!claim) throw new NotFoundException('Bonusový záznam nenalezen');

    await this.prisma.$transaction(async (tx) => {
      await this.wallet.debitBonus(
        tx,
        claim.userId,
        claim.amount,
        claim.campaignId,
        `Odebrání bonusu: ${claim.campaign.title}`,
        'ADMIN_ADJUSTMENT',
      );
      await tx.bonusClaim.delete({ where: { id: claimId } });
    });
    return { ok: true };
  }

  async evaluateMarketingBonuses(
    userId: string,
    trigger: MarketingBonusActionType,
  ): Promise<BonusGrantedResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) return { granted: false };

    const now = new Date();
    const campaigns = await this.prisma.bonusCampaign.findMany({
      where: { isActive: true, actionType: trigger },
      orderBy: [{ amount: 'desc' }, { createdAt: 'desc' }],
    });

    for (const campaign of campaigns) {
      if (!this.isWithinDates(campaign, now)) continue;
      if (!this.roleMatches(campaign, user.role)) continue;

      const met = await this.isConditionMet(userId, campaign);
      if (!met) continue;

      const granted = await this.tryGrantCampaign(userId, campaign, trigger);
      if (granted.granted) return granted;
    }
    return { granted: false };
  }

  private async isConditionMet(userId: string, campaign: BonusCampaign): Promise<boolean> {
    const min = Math.max(1, campaign.conditionMinCount);
    switch (campaign.actionType) {
      case MarketingBonusActionType.FACEBOOK_CONNECT: {
        const page = await this.prisma.facebookPageConnection.findFirst({
          where: { userId, isActive: true },
        });
        if (!page) return false;
        const imported = await this.prisma.facebookSyncedPost.count({
          where: { userId, pageConnectionId: page.id },
        });
        return imported >= min;
      }
      case MarketingBonusActionType.INVITE_EMAIL:
        return (await this.referral.countInvites(userId, 'EMAIL')) >= min;
      case MarketingBonusActionType.INVITE_WHATSAPP:
        return (await this.referral.countInvites(userId, 'WHATSAPP')) >= min;
      case MarketingBonusActionType.REFERRAL_REGISTRATION: {
        const count = await this.prisma.user.count({ where: { referredByUserId: userId } });
        return count >= min;
      }
      case MarketingBonusActionType.FIRST_AD: {
        const count = await this.prisma.property.count({
          where: {
            userId,
            deletedAt: null,
            OR: [
              { approved: true },
              { status: { equals: 'ACTIVE', mode: 'insensitive' } },
              { status: { equals: 'APPROVED', mode: 'insensitive' } },
            ],
          },
        });
        return count >= min;
      }
      case MarketingBonusActionType.FIRST_VIDEO_AD: {
        const count = await this.prisma.property.count({
          where: {
            userId,
            deletedAt: null,
            OR: [
              { videoUrl: { not: null } },
              { shortsListingSources: { some: { videoUrl: { not: null } } } },
            ],
          },
        });
        return count >= min;
      }
      case MarketingBonusActionType.FIRST_POST: {
        const count = await this.prisma.post.count({ where: { userId } });
        return count >= min;
      }
      case MarketingBonusActionType.PROFILE_COMPLETE: {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            name: true,
            phone: true,
            avatar: true,
            bio: true,
            city: true,
          },
        });
        if (!user) return false;
        const filled = [user.name, user.phone, user.avatar, user.bio, user.city].filter((v) =>
          Boolean(String(v ?? '').trim()),
        ).length;
        return filled >= 5;
      }
      case MarketingBonusActionType.PROFILE_VERIFIED: {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { professionalVerificationStatus: true },
        });
        return user?.professionalVerificationStatus === 'APPROVED';
      }
      case MarketingBonusActionType.CUSTOM:
        return true;
      default:
        return false;
    }
  }

  private async tryGrantCampaign(
    userId: string,
    campaign: BonusCampaign,
    trigger: MarketingBonusActionType,
  ): Promise<BonusGrantedResult> {
    if (campaign.maxTotalClaims != null) {
      const total = await this.prisma.bonusClaim.count({
        where: { campaignId: campaign.id },
      });
      if (total >= campaign.maxTotalClaims) return { granted: false };
    }

    const userClaims = await this.prisma.bonusClaim.count({
      where: { userId, campaignId: campaign.id },
    });
    const maxPerUser = campaign.oncePerUser ? 1 : campaign.maxClaimsPerUser;
    if (userClaims >= maxPerUser) return { granted: false };

    const purpose = ledgerPurposeForAction(trigger);

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.wallet.creditBonus(
          tx,
          userId,
          campaign.amount,
          campaign.id,
          `Bonus: ${campaign.title}`,
          purpose,
        );
        await tx.bonusClaim.create({
          data: {
            userId,
            campaignId: campaign.id,
            amount: campaign.amount,
            reason: purpose,
          },
        });
      });

      return {
        granted: true,
        amount: campaign.amount,
        message: formatBonusMessage(campaign.amount),
        campaignId: campaign.id,
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return { granted: false };
      }
      throw err;
    }
  }

  async tryGrantBonus(
    userId: string,
    sourceType: BonusSourceType,
    sourceId: string,
  ): Promise<BonusGrantedResult> {
    const legacy = await this.evaluateLegacyListingTipBonus(userId, sourceType, sourceId);
    if (legacy.granted) return legacy;

    const trigger =
      sourceType === BonusSourceType.LISTING
        ? MarketingBonusActionType.FIRST_AD
        : MarketingBonusActionType.FIRST_POST;
    return this.evaluateMarketingBonuses(userId, trigger);
  }

  private async evaluateLegacyListingTipBonus(
    userId: string,
    sourceType: BonusSourceType,
    sourceId: string,
  ): Promise<BonusGrantedResult> {
    const now = new Date();
    const campaigns = await this.prisma.bonusCampaign.findMany({
      where: { isActive: true, actionType: MarketingBonusActionType.LEGACY_LISTING_TIP },
      orderBy: [{ amount: 'desc' }, { createdAt: 'desc' }],
    });

    for (const campaign of campaigns) {
      if (!this.isWithinDates(campaign, now)) continue;
      if (!this.appliesToSource(campaign.appliesTo, sourceType)) continue;

      const isFirstSource = await this.isFirstUserSource(userId, sourceType);
      if (!isFirstSource) continue;

      if (campaign.oncePerUser) {
        const existingClaim = await this.prisma.bonusClaim.findUnique({
          where: { userId_campaignId: { userId, campaignId: campaign.id } },
        });
        if (existingClaim) continue;
      }

      try {
        await this.prisma.$transaction(async (tx) => {
          await this.wallet.creditBonus(
            tx,
            userId,
            campaign.amount,
            campaign.id,
            `Bonus: ${campaign.title}`,
            'BONUS_GRANTED',
          );
          await tx.bonusClaim.create({
            data: {
              userId,
              campaignId: campaign.id,
              amount: campaign.amount,
              sourceType,
              sourceId,
              reason: 'BONUS_GRANTED',
            },
          });
        });

        return {
          granted: true,
          amount: campaign.amount,
          message: formatBonusMessage(campaign.amount),
          campaignId: campaign.id,
        };
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          continue;
        }
        throw err;
      }
    }

    return { granted: false };
  }

  private async isFirstUserSource(
    userId: string,
    sourceType: BonusSourceType,
  ): Promise<boolean> {
    if (sourceType === BonusSourceType.LISTING) {
      const count = await this.prisma.property.count({
        where: { userId, deletedAt: null },
      });
      return count === 1;
    }
    const count = await this.prisma.tiparPost.count({ where: { userId } });
    return count === 1;
  }
}
