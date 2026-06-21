import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreditWalletService } from '../credits/credit-wallet.service';

export type ContactMonetizationSettings = {
  tipPortalPercent: number;
  tipTipsterPercent: number;
  ownerListingContactPrice: number;
  leadPriceClassic: number;
  leadPriceShorts: number;
  leadPriceDeveloper: number;
  leadPriceCompany: number;
  tipMinContactPrice: number;
  tipMaxContactPrice: number;
  tipSuccessBonus: number;
};

export type AdvertiserLeadSource = 'CLASSIC' | 'SHORTS' | 'DEVELOPER' | 'COMPANY';

const DEFAULT_SETTINGS: ContactMonetizationSettings = {
  tipPortalPercent: 30,
  tipTipsterPercent: 70,
  ownerListingContactPrice: 50,
  leadPriceClassic: 50,
  leadPriceShorts: 50,
  leadPriceDeveloper: 50,
  leadPriceCompany: 50,
  tipMinContactPrice: 0,
  tipMaxContactPrice: 10000,
  tipSuccessBonus: 0,
};

@Injectable()
export class ContactMonetizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: CreditWalletService,
  ) {}

  async getSettings(): Promise<ContactMonetizationSettings> {
    const row = await this.prisma.contactMonetizationSetting.findUnique({
      where: { id: 'default' },
    });
    if (!row) return { ...DEFAULT_SETTINGS };
    return {
      tipPortalPercent: row.tipPortalPercent,
      tipTipsterPercent: row.tipTipsterPercent,
      ownerListingContactPrice: row.ownerListingContactPrice,
      leadPriceClassic: row.leadPriceClassic,
      leadPriceShorts: row.leadPriceShorts,
      leadPriceDeveloper: row.leadPriceDeveloper,
      leadPriceCompany: row.leadPriceCompany,
      tipMinContactPrice: row.tipMinContactPrice,
      tipMaxContactPrice: row.tipMaxContactPrice,
      tipSuccessBonus: row.tipSuccessBonus,
    };
  }

  async updateSettings(dto: Partial<ContactMonetizationSettings>): Promise<ContactMonetizationSettings> {
    const current = await this.getSettings();
    const next = {
      tipPortalPercent: dto.tipPortalPercent ?? current.tipPortalPercent,
      tipTipsterPercent: dto.tipTipsterPercent ?? current.tipTipsterPercent,
      ownerListingContactPrice:
        dto.ownerListingContactPrice ?? current.ownerListingContactPrice,
      leadPriceClassic: dto.leadPriceClassic ?? current.leadPriceClassic,
      leadPriceShorts: dto.leadPriceShorts ?? current.leadPriceShorts,
      leadPriceDeveloper: dto.leadPriceDeveloper ?? current.leadPriceDeveloper,
      leadPriceCompany: dto.leadPriceCompany ?? current.leadPriceCompany,
      tipMinContactPrice: dto.tipMinContactPrice ?? current.tipMinContactPrice,
      tipMaxContactPrice: dto.tipMaxContactPrice ?? current.tipMaxContactPrice,
      tipSuccessBonus: dto.tipSuccessBonus ?? current.tipSuccessBonus,
    };

    const nonNegative = [
      next.tipPortalPercent,
      next.tipTipsterPercent,
      next.ownerListingContactPrice,
      next.leadPriceClassic,
      next.leadPriceShorts,
      next.leadPriceDeveloper,
      next.leadPriceCompany,
      next.tipMinContactPrice,
      next.tipMaxContactPrice,
      next.tipSuccessBonus,
    ];
    if (nonNegative.some((v) => v < 0)) {
      throw new BadRequestException('Hodnoty nemohou být záporné.');
    }
    if (next.tipPortalPercent + next.tipTipsterPercent !== 100) {
      throw new BadRequestException('Součet provizí portálu a tipaře musí být 100 %.');
    }
    if (next.tipMinContactPrice > next.tipMaxContactPrice) {
      throw new BadRequestException('Minimální cena kontaktu nesmí být vyšší než maximální.');
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
      leadPriceClassic: row.leadPriceClassic,
      leadPriceShorts: row.leadPriceShorts,
      leadPriceDeveloper: row.leadPriceDeveloper,
      leadPriceCompany: row.leadPriceCompany,
      tipMinContactPrice: row.tipMinContactPrice,
      tipMaxContactPrice: row.tipMaxContactPrice,
      tipSuccessBonus: row.tipSuccessBonus,
    };
  }

  resolveLeadSource(input: {
    listingType: string;
    ownerRole: UserRole;
  }): AdvertiserLeadSource {
    if (input.ownerRole === 'DEVELOPER') return 'DEVELOPER';
    if (input.ownerRole === 'COMPANY') return 'COMPANY';
    if (input.listingType === 'SHORTS') return 'SHORTS';
    return 'CLASSIC';
  }

  resolveLeadPrice(
    settings: ContactMonetizationSettings,
    leadSource: AdvertiserLeadSource,
  ): number {
    switch (leadSource) {
      case 'SHORTS':
        return Math.max(0, settings.leadPriceShorts);
      case 'DEVELOPER':
        return Math.max(0, settings.leadPriceDeveloper);
      case 'COMPANY':
        return Math.max(0, settings.leadPriceCompany);
      default:
        return Math.max(0, settings.leadPriceClassic);
    }
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
    return this.wallet.chargeOwnerReal(tx, ownerUserId, amount, referenceId, description);
  }

  async ownerCanAffordLead(ownerUserId: string, amount: number): Promise<boolean> {
    const price = Math.max(0, Math.trunc(amount));
    if (price === 0) return true;

    const [owner, creditSettings] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: ownerUserId },
        select: {
          realCreditBalance: true,
          bonusCreditBalance: true,
          pendingCreditBalance: true,
          creditBalance: true,
        },
      }),
      this.prisma.creditTopUpSetting.findUnique({ where: { id: 'default' } }),
    ]);
    if (!owner) return false;

    const spendable = this.wallet.spendableForContactUnlock(owner, 'LISTING', {
      allowBonusCreditOnListingContacts:
        creditSettings?.allowBonusCreditOnListingContacts ?? true,
      allowBonusCreditOnTipContacts: creditSettings?.allowBonusCreditOnTipContacts ?? false,
      allowPendingCreditSpending: creditSettings?.allowPendingCreditSpending ?? false,
      allowPendingForInternalServices:
        creditSettings?.allowPendingForInternalServices ?? false,
    });
    return spendable.total >= price;
  }
}
