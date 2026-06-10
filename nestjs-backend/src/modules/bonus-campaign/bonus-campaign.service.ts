import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BonusAppliesTo,
  BonusSourceType,
  Prisma,
  type BonusCampaign,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreditWalletService } from '../credits/credit-wallet.service';
import { CreateBonusCampaignDto } from './dto/create-bonus-campaign.dto';
import { UpdateBonusCampaignDto } from './dto/update-bonus-campaign.dto';

export type BonusGrantedResult = {
  granted: boolean;
  amount?: number;
  message?: string;
  campaignId?: string;
};

export type PublicBonusCampaign = {
  ctaText: string;
  bonusText: string;
  amount: number;
};

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (value == null || !String(value).trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatBonusMessage(amount: number): string {
  return `Gratulujeme, získali jste bonus ${amount.toLocaleString('cs-CZ')} Kč kreditu.`;
}

const DEFAULT_CTA_TEXT = 'Založ účet, inzeruj a vydělávej';
const DEFAULT_BONUS_TEXT =
  'Bonus 1 000 Kč kreditu při vložení inzerátu nebo tipu';

function trimOrDefault(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

@Injectable()
export class BonusCampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: CreditWalletService,
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

  private serializePublic(campaign: BonusCampaign): PublicBonusCampaign {
    return {
      ctaText: campaign.ctaText.trim(),
      bonusText: campaign.bonusText.trim(),
      amount: campaign.amount,
    };
  }

  private serializeAdmin(campaign: BonusCampaign) {
    return {
      id: campaign.id,
      title: campaign.title,
      ctaText: campaign.ctaText,
      bonusText: campaign.bonusText,
      amount: campaign.amount,
      appliesTo: campaign.appliesTo,
      isActive: campaign.isActive,
      activeFrom: campaign.activeFrom?.toISOString() ?? null,
      activeTo: campaign.activeTo?.toISOString() ?? null,
      oncePerUser: campaign.oncePerUser,
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

  async listForAdmin() {
    const rows = await this.prisma.bonusCampaign.findMany({
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    });
    return rows.map((c) => this.serializeAdmin(c));
  }

  async create(dto: CreateBonusCampaignDto) {
    const created = await this.prisma.bonusCampaign.create({
      data: {
        title: dto.title.trim(),
        ctaText: trimOrDefault(dto.ctaText, DEFAULT_CTA_TEXT),
        bonusText: trimOrDefault(dto.bonusText, DEFAULT_BONUS_TEXT),
        amount: Math.max(1, Math.trunc(dto.amount)),
        appliesTo: dto.appliesTo,
        isActive: dto.isActive ?? false,
        activeFrom: parseOptionalDate(dto.activeFrom),
        activeTo: parseOptionalDate(dto.activeTo),
        oncePerUser: dto.oncePerUser ?? true,
      },
    });
    return this.serializeAdmin(created);
  }

  async update(id: string, dto: UpdateBonusCampaignDto) {
    const existing = await this.prisma.bonusCampaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Bonusová akce nenalezena');

    const data: Prisma.BonusCampaignUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.ctaText !== undefined) {
      data.ctaText = trimOrDefault(dto.ctaText, DEFAULT_CTA_TEXT);
    }
    if (dto.bonusText !== undefined) {
      data.bonusText = trimOrDefault(dto.bonusText, DEFAULT_BONUS_TEXT);
    }
    if (dto.amount !== undefined) data.amount = Math.max(1, Math.trunc(dto.amount));
    if (dto.appliesTo !== undefined) data.appliesTo = dto.appliesTo;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.activeFrom !== undefined) data.activeFrom = parseOptionalDate(dto.activeFrom);
    if (dto.activeTo !== undefined) data.activeTo = parseOptionalDate(dto.activeTo);
    if (dto.oncePerUser !== undefined) data.oncePerUser = dto.oncePerUser;

    const updated = await this.prisma.bonusCampaign.update({ where: { id }, data });
    return this.serializeAdmin(updated);
  }

  async delete(id: string) {
    const existing = await this.prisma.bonusCampaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Bonusová akce nenalezena');
    await this.prisma.bonusCampaign.delete({ where: { id } });
    return { ok: true };
  }

  async tryGrantBonus(
    userId: string,
    sourceType: BonusSourceType,
    sourceId: string,
  ): Promise<BonusGrantedResult> {
    const now = new Date();
    const campaigns = await this.prisma.bonusCampaign.findMany({
      where: { isActive: true },
      orderBy: [{ amount: 'desc' }, { createdAt: 'desc' }],
    });

    for (const campaign of campaigns) {
      if (!this.isWithinDates(campaign, now)) continue;
      if (!this.appliesToSource(campaign.appliesTo, sourceType)) continue;

      const isFirstSource = await this.isFirstUserSource(userId, sourceType);
      if (!isFirstSource) continue;

      if (campaign.oncePerUser) {
        const existingClaim = await this.prisma.bonusClaim.findUnique({
          where: {
            userId_campaignId: { userId, campaignId: campaign.id },
          },
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
          );
          await tx.bonusClaim.create({
            data: {
              userId,
              campaignId: campaign.id,
              amount: campaign.amount,
              sourceType,
              sourceId,
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
