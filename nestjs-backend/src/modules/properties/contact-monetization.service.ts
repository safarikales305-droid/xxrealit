import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export type ContactMonetizationSettings = {
  tipPortalPercent: number;
  tipTipsterPercent: number;
  ownerListingContactPrice: number;
};

const DEFAULT_SETTINGS: ContactMonetizationSettings = {
  tipPortalPercent: 30,
  tipTipsterPercent: 70,
  ownerListingContactPrice: 50,
};

@Injectable()
export class ContactMonetizationService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<ContactMonetizationSettings> {
    const row = await this.prisma.contactMonetizationSetting.findUnique({
      where: { id: 'default' },
    });
    if (!row) return { ...DEFAULT_SETTINGS };
    return {
      tipPortalPercent: row.tipPortalPercent,
      tipTipsterPercent: row.tipTipsterPercent,
      ownerListingContactPrice: row.ownerListingContactPrice,
    };
  }

  async updateSettings(dto: Partial<ContactMonetizationSettings>): Promise<ContactMonetizationSettings> {
    const current = await this.getSettings();
    const next = {
      tipPortalPercent: dto.tipPortalPercent ?? current.tipPortalPercent,
      tipTipsterPercent: dto.tipTipsterPercent ?? current.tipTipsterPercent,
      ownerListingContactPrice:
        dto.ownerListingContactPrice ?? current.ownerListingContactPrice,
    };

    if (
      next.tipPortalPercent < 0 ||
      next.tipTipsterPercent < 0 ||
      next.ownerListingContactPrice < 0
    ) {
      throw new BadRequestException('Hodnoty nemohou být záporné.');
    }
    if (next.tipPortalPercent + next.tipTipsterPercent !== 100) {
      throw new BadRequestException('Součet provizí portálu a tipaře musí být 100 %.');
    }

    const row = await this.prisma.contactMonetizationSetting.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...next },
      update: next,
    });
    return {
      tipPortalPercent: row.tipPortalPercent,
      tipTipsterPercent: row.tipTipsterPercent,
      ownerListingContactPrice: row.ownerListingContactPrice,
    };
  }

  computeTipSplit(price: number, settings: ContactMonetizationSettings) {
    const safePrice = Math.max(0, Math.trunc(price));
    const portalAmount = Math.floor((safePrice * settings.tipPortalPercent) / 100);
    const tipsterAmount = safePrice - portalAmount;
    return { portalAmount, tipsterAmount };
  }

  async chargeOwnerForLead(
    tx: Prisma.TransactionClient,
    ownerUserId: string,
    amount: number,
    referenceId: string,
    description: string,
  ): Promise<number> {
    const charge = Math.max(0, Math.trunc(amount));
    if (charge === 0) return 0;

    const owner = await tx.user.findUnique({
      where: { id: ownerUserId },
      select: { creditBalance: true },
    });
    if (!owner) return charge;

    const newBalance = owner.creditBalance - charge;
    let creditBalance = newBalance;
    let creditDebt = 0;
    if (newBalance < 0) {
      creditDebt = -newBalance;
      creditBalance = 0;
    }

    await tx.user.update({
      where: { id: ownerUserId },
      data: {
        creditBalance,
        ...(creditDebt > 0
          ? { creditDebt: { increment: creditDebt }, accountLimited: true }
          : {}),
      },
    });

    await tx.creditLedger.create({
      data: {
        userId: ownerUserId,
        amount: -charge,
        type: 'OWNER_CONTACT_LEAD',
        referenceId,
        description,
      },
    });

    return charge;
  }
}
