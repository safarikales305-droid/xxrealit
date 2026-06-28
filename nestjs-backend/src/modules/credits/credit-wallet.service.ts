import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { normalizeCreditDebtState } from './credit-debt.util';
import type {
  ContactUnlockSourceType,
  ContactUnlockSpendBreakdown,
  CreditBucket,
  CreditLedgerPurpose,
  UserCreditBalances,
} from './credit-wallet.types';

const SETTINGS_ID = 'default';

type WalletUserRow = {
  realCreditBalance: number;
  bonusCreditBalance: number;
  pendingCreditBalance: number;
  creditBalance: number;
};

type CreditSettingsRow = {
  allowBonusCreditOnListingContacts: boolean;
  allowBonusCreditOnTipContacts: boolean;
  allowPendingCreditSpending: boolean;
  allowPendingForInternalServices: boolean;
};

@Injectable()
export class CreditWalletService {
  constructor(private readonly prisma: PrismaService) {}

  totalBalance(row: Pick<WalletUserRow, 'realCreditBalance' | 'bonusCreditBalance' | 'pendingCreditBalance'>): number {
    return (
      Math.max(0, row.realCreditBalance) +
      Math.max(0, row.bonusCreditBalance) +
      Math.max(0, row.pendingCreditBalance)
    );
  }

  serializeBalances(row: WalletUserRow): UserCreditBalances {
    return {
      realCreditBalance: row.realCreditBalance,
      bonusCreditBalance: row.bonusCreditBalance,
      pendingCreditBalance: row.pendingCreditBalance,
      creditBalance: this.totalBalance(row),
    };
  }

  private async getSettings(): Promise<CreditSettingsRow> {
    const row = await this.prisma.creditTopUpSetting.findUnique({
      where: { id: SETTINGS_ID },
    });
    return {
      allowBonusCreditOnListingContacts: row?.allowBonusCreditOnListingContacts ?? true,
      allowBonusCreditOnTipContacts: row?.allowBonusCreditOnTipContacts ?? false,
      allowPendingCreditSpending: row?.allowPendingCreditSpending ?? false,
      allowPendingForInternalServices: row?.allowPendingForInternalServices ?? false,
    };
  }

  spendableForAdvertiserLead(row: WalletUserRow): { paid: number; bonus: number; total: number } {
    const paid = Math.max(0, row.realCreditBalance);
    const bonus = Math.max(0, row.bonusCreditBalance);
    return { paid, bonus, total: paid + bonus };
  }

  advertiserLeadAffordable(row: WalletUserRow, amount: number): boolean {
    const price = Math.max(0, Math.trunc(amount));
    if (price === 0) return true;
    return this.spendableForAdvertiserLead(row).total >= price;
  }

  computeAdvertiserLeadSpend(row: WalletUserRow, amount: number): ContactUnlockSpendBreakdown {
    const price = Math.max(0, Math.trunc(amount));
    if (price === 0) {
      return { realUsed: 0, bonusUsed: 0, pendingUsed: 0 };
    }
    const spendable = this.spendableForAdvertiserLead(row);
    if (spendable.total < price) {
      throw new ForbiddenException({
        message: 'Inzerent nemá dostatek kreditu pro lead.',
        code: 'INSUFFICIENT_ADVERTISER_CREDIT',
        required: price,
        realCreditBalance: row.realCreditBalance,
        bonusCreditBalance: row.bonusCreditBalance,
        creditBalance: spendable.total,
      });
    }

    let remaining = price;
    const bonusUsed = Math.min(remaining, spendable.bonus);
    remaining -= bonusUsed;
    const realUsed = Math.min(remaining, spendable.paid);
    return { realUsed, bonusUsed, pendingUsed: 0 };
  }

  async spendForAdvertiserLead(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    referenceId: string,
    description: string,
  ): Promise<ContactUnlockSpendBreakdown & UserCreditBalances> {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        realCreditBalance: true,
        bonusCreditBalance: true,
        pendingCreditBalance: true,
        creditBalance: true,
      },
    });
    if (!user) throw new ForbiddenException('Uživatel nenalezen');

    const breakdown = this.computeAdvertiserLeadSpend(user, amount);
    const purpose: CreditLedgerPurpose = 'LEAD_CHARGE';

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        realCreditBalance: { decrement: breakdown.realUsed },
        bonusCreditBalance: { decrement: breakdown.bonusUsed },
      },
      select: {
        realCreditBalance: true,
        bonusCreditBalance: true,
        pendingCreditBalance: true,
        creditBalance: true,
      },
    });

    const clamped = {
      realCreditBalance: Math.max(0, updated.realCreditBalance),
      bonusCreditBalance: Math.max(0, updated.bonusCreditBalance),
      pendingCreditBalance: Math.max(0, updated.pendingCreditBalance),
    };
    if (
      clamped.realCreditBalance !== updated.realCreditBalance ||
      clamped.bonusCreditBalance !== updated.bonusCreditBalance
    ) {
      await tx.user.update({
        where: { id: userId },
        data: clamped,
      });
    }

    const total = this.totalBalance(clamped);
    await tx.user.update({
      where: { id: userId },
      data: { creditBalance: total },
    });

    const ledgerParts: Array<{ bucket: CreditBucket; amount: number }> = [
      { bucket: 'BONUS', amount: breakdown.bonusUsed },
      { bucket: 'REAL', amount: breakdown.realUsed },
    ];
    for (const part of ledgerParts) {
      if (part.amount <= 0) continue;
      await tx.creditLedger.create({
        data: {
          userId,
          amount: -part.amount,
          type: purpose,
          creditType: part.bucket,
          purpose,
          referenceId,
          description,
        },
      });
    }

    return {
      ...breakdown,
      ...this.serializeBalances({ ...clamped, creditBalance: total }),
    };
  }

  spendableForContactUnlock(
    row: WalletUserRow,
    sourceType: ContactUnlockSourceType,
    settings: CreditSettingsRow,
  ): { real: number; bonus: number; pending: number; total: number } {
    const real = Math.max(0, row.realCreditBalance);
    const bonus =
      sourceType === 'LISTING' && settings.allowBonusCreditOnListingContacts
        ? Math.max(0, row.bonusCreditBalance)
        : sourceType !== 'LISTING' && settings.allowBonusCreditOnTipContacts
          ? Math.max(0, row.bonusCreditBalance)
          : 0;
    const pending =
      settings.allowPendingCreditSpending && sourceType === 'LISTING'
        ? Math.max(0, row.pendingCreditBalance)
        : 0;
    return { real, bonus, pending, total: real + bonus + pending };
  }

  assertContactUnlockAffordable(
    row: WalletUserRow,
    amount: number,
    sourceType: ContactUnlockSourceType,
    settings: CreditSettingsRow,
  ): void {
    const price = Math.max(0, Math.trunc(amount));
    if (price === 0) return;

    const isTip = sourceType === 'TIP' || sourceType === 'TIP_SHORTS';
    if (isTip && row.realCreditBalance < price) {
      throw new ForbiddenException({
        message:
          'Pro odemknutí tipu je nutné dobít placený kredit přes QR kód.',
        code: row.bonusCreditBalance > 0 ? 'BONUS_NOT_ALLOWED_FOR_TIP' : 'INSUFFICIENT_CREDIT',
        required: price,
        realCreditBalance: row.realCreditBalance,
        bonusCreditBalance: row.bonusCreditBalance,
        pendingCreditBalance: row.pendingCreditBalance,
      });
    }

    const spendable = this.spendableForContactUnlock(row, sourceType, settings);
    if (spendable.total >= price) return;

    const hasOnlyBonus =
      row.realCreditBalance < price &&
      row.bonusCreditBalance > 0 &&
      row.pendingCreditBalance === 0;
    const hasBonusOrPendingNoReal =
      row.realCreditBalance < price &&
      (row.bonusCreditBalance > 0 || row.pendingCreditBalance > 0);

    if (isTip && hasOnlyBonus) {
      throw new ForbiddenException({
        message:
          'Pro odemknutí tipu je nutné dobít placený kredit přes QR kód.',
        code: 'BONUS_NOT_ALLOWED_FOR_TIP',
        required: price,
        realCreditBalance: row.realCreditBalance,
        bonusCreditBalance: row.bonusCreditBalance,
        pendingCreditBalance: row.pendingCreditBalance,
      });
    }

    if (isTip && hasBonusOrPendingNoReal) {
      throw new ForbiddenException({
        message:
          'Pro odemknutí tipu je nutné dobít placený kredit přes QR kód.',
        code: 'REAL_CREDIT_REQUIRED',
        required: price,
        realCreditBalance: row.realCreditBalance,
        bonusCreditBalance: row.bonusCreditBalance,
        pendingCreditBalance: row.pendingCreditBalance,
      });
    }

    throw new ForbiddenException({
      message: 'Nemáte dostatek kreditu. Dobijte si kredit.',
      code: 'INSUFFICIENT_CREDIT',
      required: price,
      realCreditBalance: row.realCreditBalance,
      bonusCreditBalance: row.bonusCreditBalance,
      pendingCreditBalance: row.pendingCreditBalance,
      creditBalance: this.totalBalance(row),
    });
  }

  computeContactUnlockSpend(
    row: WalletUserRow,
    amount: number,
    sourceType: ContactUnlockSourceType,
    settings: CreditSettingsRow,
  ): ContactUnlockSpendBreakdown {
    const price = Math.max(0, Math.trunc(amount));
    if (price === 0) {
      return { realUsed: 0, bonusUsed: 0, pendingUsed: 0 };
    }
    this.assertContactUnlockAffordable(row, price, sourceType, settings);

    const isTip = sourceType === 'TIP' || sourceType === 'TIP_SHORTS';
    if (isTip) {
      const realUsed = Math.min(price, Math.max(0, row.realCreditBalance));
      return { realUsed, bonusUsed: 0, pendingUsed: 0 };
    }

    let remaining = price;
    const realUsed = Math.min(remaining, Math.max(0, row.realCreditBalance));
    remaining -= realUsed;

    let bonusUsed = 0;
    if (
      remaining > 0 &&
      sourceType === 'LISTING' &&
      settings.allowBonusCreditOnListingContacts
    ) {
      bonusUsed = Math.min(remaining, Math.max(0, row.bonusCreditBalance));
      remaining -= bonusUsed;
    }

    let pendingUsed = 0;
    if (remaining > 0 && settings.allowPendingCreditSpending && sourceType === 'LISTING') {
      pendingUsed = Math.min(remaining, Math.max(0, row.pendingCreditBalance));
      remaining -= pendingUsed;
    }

    return { realUsed, bonusUsed, pendingUsed };
  }

  async spendForContactUnlock(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    sourceType: ContactUnlockSourceType,
    referenceId: string,
    description: string,
    purposeOverride?: CreditLedgerPurpose,
  ): Promise<ContactUnlockSpendBreakdown & UserCreditBalances> {
    const settings = await this.getSettings();
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        realCreditBalance: true,
        bonusCreditBalance: true,
        pendingCreditBalance: true,
        creditBalance: true,
        tiparEarningsBalance: true,
      },
    });
    if (!user) throw new ForbiddenException('Uživatel nenalezen');

    const breakdown = this.computeContactUnlockSpend(user, amount, sourceType, settings);
    const purpose: CreditLedgerPurpose =
      purposeOverride ??
      (sourceType === 'LISTING' ? 'LISTING_CONTACT_UNLOCK' : 'TIP_CONTACT_UNLOCK');

    const tiparEarningsDebit =
      breakdown.realUsed > 0 ? Math.min(breakdown.realUsed, Math.max(0, user.tiparEarningsBalance)) : 0;

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        realCreditBalance: { decrement: breakdown.realUsed },
        bonusCreditBalance: { decrement: breakdown.bonusUsed },
        pendingCreditBalance: { decrement: breakdown.pendingUsed },
        ...(tiparEarningsDebit > 0
          ? { tiparEarningsBalance: { decrement: tiparEarningsDebit } }
          : {}),
      },
      select: {
        realCreditBalance: true,
        bonusCreditBalance: true,
        pendingCreditBalance: true,
        creditBalance: true,
      },
    });

    const total = this.totalBalance(updated);
    await tx.user.update({
      where: { id: userId },
      data: { creditBalance: total },
    });

    const ledgerParts: Array<{ bucket: CreditBucket; amount: number }> = [
      { bucket: 'REAL', amount: breakdown.realUsed },
      { bucket: 'BONUS', amount: breakdown.bonusUsed },
      { bucket: 'PENDING', amount: breakdown.pendingUsed },
    ];
    for (const part of ledgerParts) {
      if (part.amount <= 0) continue;
      await tx.creditLedger.create({
        data: {
          userId,
          amount: -part.amount,
          type: purpose,
          creditType: part.bucket,
          purpose,
          referenceId,
          description,
        },
      });
    }

    return {
      ...breakdown,
      ...this.serializeBalances({ ...updated, creditBalance: total }),
    };
  }

  async creditReal(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    purpose: CreditLedgerPurpose,
    referenceId: string | null,
    description: string,
  ): Promise<UserCreditBalances> {
    const amt = Math.max(0, Math.trunc(amount));
    if (amt === 0) {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          realCreditBalance: true,
          bonusCreditBalance: true,
          pendingCreditBalance: true,
          creditBalance: true,
        },
      });
      return this.serializeBalances(user!);
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: { realCreditBalance: { increment: amt } },
      select: {
        realCreditBalance: true,
        bonusCreditBalance: true,
        pendingCreditBalance: true,
        creditBalance: true,
      },
    });
    const total = this.totalBalance(updated);
    await tx.user.update({ where: { id: userId }, data: { creditBalance: total } });
    await tx.creditLedger.create({
      data: {
        userId,
        amount: amt,
        type: purpose,
        creditType: 'REAL',
        purpose,
        referenceId,
        description,
      },
    });
    return this.serializeBalances({ ...updated, creditBalance: total });
  }

  async creditTipsterEarning(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    referenceId: string | null,
    description: string,
  ): Promise<UserCreditBalances> {
    const amt = Math.max(0, Math.trunc(amount));
    const balances = await this.creditReal(
      tx,
      userId,
      amt,
      'TIPSTER_EARNING',
      referenceId,
      description,
    );
    if (amt > 0) {
      await tx.user.update({
        where: { id: userId },
        data: {
          tiparLifetimeEarnings: { increment: amt },
          tiparEarningsBalance: { increment: amt },
        },
      });
    }
    return balances;
  }

  async debitTiparPayout(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    payoutRequestId: string,
    description: string,
  ): Promise<void> {
    const amt = Math.max(0, Math.trunc(amount));
    if (amt <= 0) return;

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        realCreditBalance: true,
        bonusCreditBalance: true,
        pendingCreditBalance: true,
        tiparEarningsBalance: true,
      },
    });
    if (!user) throw new ForbiddenException('Uživatel nenalezen.');
    if (user.tiparEarningsBalance < amt) {
      throw new BadRequestException('Nedostatečný výdělek k výplatě.');
    }
    if (user.realCreditBalance < amt) {
      throw new BadRequestException('Nedostatečný reálný kredit pro výplatu.');
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        realCreditBalance: { decrement: amt },
        tiparEarningsBalance: { decrement: amt },
        tiparPaidOutTotal: { increment: amt },
      },
      select: {
        realCreditBalance: true,
        bonusCreditBalance: true,
        pendingCreditBalance: true,
        creditBalance: true,
      },
    });
    const total = this.totalBalance(updated);
    await tx.user.update({ where: { id: userId }, data: { creditBalance: total } });
    await tx.creditLedger.create({
      data: {
        userId,
        amount: -amt,
        type: 'TIPAR_PAYOUT',
        creditType: 'REAL',
        purpose: 'TIPAR_PAYOUT',
        referenceId: payoutRequestId,
        description,
      },
    });
  }

  async creditBonus(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    referenceId: string | null,
    description: string,
    purpose: CreditLedgerPurpose = 'BONUS_GRANTED',
  ): Promise<UserCreditBalances> {
    const amt = Math.max(0, Math.trunc(amount));
    const updated = await tx.user.update({
      where: { id: userId },
      data: { bonusCreditBalance: { increment: amt } },
      select: {
        realCreditBalance: true,
        bonusCreditBalance: true,
        pendingCreditBalance: true,
        creditBalance: true,
      },
    });
    const total = this.totalBalance(updated);
    await tx.user.update({ where: { id: userId }, data: { creditBalance: total } });
    const ledgerPurpose =
      purpose === 'BONUS_GRANTED' || purpose.startsWith('BONUS')
        ? purpose
        : purpose;
    await tx.creditLedger.create({
      data: {
        userId,
        amount: amt,
        type: 'BONUS',
        creditType: 'BONUS',
        purpose: ledgerPurpose,
        referenceId,
        description,
      },
    });
    return this.serializeBalances({ ...updated, creditBalance: total });
  }

  async debitBonus(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    referenceId: string | null,
    description: string,
    purpose: CreditLedgerPurpose = 'ADMIN_ADJUSTMENT',
  ): Promise<UserCreditBalances> {
    const amt = Math.max(0, Math.trunc(amount));
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { bonusCreditBalance: true, realCreditBalance: true, pendingCreditBalance: true },
    });
    if (!user) throw new Error('User not found');
    const deduct = Math.min(amt, Math.max(0, user.bonusCreditBalance));
    if (deduct <= 0) {
      return this.serializeBalances({
        ...user,
        creditBalance: this.totalBalance(user),
      });
    }
    const updated = await tx.user.update({
      where: { id: userId },
      data: { bonusCreditBalance: { decrement: deduct } },
      select: {
        realCreditBalance: true,
        bonusCreditBalance: true,
        pendingCreditBalance: true,
        creditBalance: true,
      },
    });
    const total = this.totalBalance(updated);
    await tx.user.update({ where: { id: userId }, data: { creditBalance: total } });
    await tx.creditLedger.create({
      data: {
        userId,
        amount: -deduct,
        type: 'BONUS',
        creditType: 'BONUS',
        purpose,
        referenceId,
        description,
      },
    });
    return this.serializeBalances({ ...updated, creditBalance: total });
  }

  async creditPendingTopUp(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    topUpId: string,
    description: string,
  ): Promise<UserCreditBalances> {
    const amt = Math.max(0, Math.trunc(amount));
    const updated = await tx.user.update({
      where: { id: userId },
      data: { pendingCreditBalance: { increment: amt } },
      select: {
        realCreditBalance: true,
        bonusCreditBalance: true,
        pendingCreditBalance: true,
        creditBalance: true,
      },
    });
    const total = this.totalBalance(updated);
    await tx.user.update({ where: { id: userId }, data: { creditBalance: total } });
    await tx.creditLedger.create({
      data: {
        userId,
        amount: amt,
        type: 'TOP_UP_PENDING',
        creditType: 'PENDING',
        purpose: 'TOP_UP_PENDING',
        referenceId: topUpId,
        description,
      },
    });
    return this.serializeBalances({ ...updated, creditBalance: total });
  }

  async confirmPendingTopUp(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    topUpId: string,
    invoiceNumber: string,
  ): Promise<UserCreditBalances> {
    const amt = Math.max(0, Math.trunc(amount));
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        realCreditBalance: true,
        bonusCreditBalance: true,
        pendingCreditBalance: true,
        creditBalance: true,
      },
    });
    if (!user) throw new ForbiddenException('Uživatel nenalezen');

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        pendingCreditBalance: { decrement: amt },
        realCreditBalance: { increment: amt },
        isCreditVerified: true,
        firstTopUpUsed: true,
      },
      select: {
        realCreditBalance: true,
        bonusCreditBalance: true,
        pendingCreditBalance: true,
        creditBalance: true,
      },
    });
    const total = this.totalBalance(updated);
    await tx.user.update({ where: { id: userId }, data: { creditBalance: total } });
    await tx.creditLedger.create({
      data: {
        userId,
        amount: amt,
        type: 'TOP_UP_CONFIRMED',
        creditType: 'REAL',
        purpose: 'TOP_UP_CONFIRMED',
        referenceId: topUpId,
        description: `Potvrzeno dobití ${invoiceNumber}`,
      },
    });
    return this.serializeBalances({ ...updated, creditBalance: total });
  }

  async reversePendingTopUp(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    topUpId: string,
    invoiceNumber: string,
    purpose: 'TOP_UP_REVERSED' | 'TOP_UP_EXPIRED',
  ): Promise<void> {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        realCreditBalance: true,
        bonusCreditBalance: true,
        pendingCreditBalance: true,
        creditBalance: true,
        creditDebt: true,
        accountLimited: true,
      },
    });
    if (!user) return;

    const amt = Math.max(0, Math.trunc(amount));
    const pendingDebit = Math.min(amt, Math.max(0, user.pendingCreditBalance));
    const realDebit = amt - pendingDebit;
    let newReal = user.realCreditBalance - realDebit;
    let rawDebt = user.creditDebt;
    if (newReal < 0) {
      rawDebt += -newReal;
      newReal = 0;
    }
    const debtState = normalizeCreditDebtState({
      realCreditBalance: newReal,
      bonusCreditBalance: user.bonusCreditBalance,
      creditDebt: rawDebt,
      accountLimited: user.accountLimited || rawDebt > 0,
    });

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        pendingCreditBalance: { decrement: pendingDebit },
        realCreditBalance: newReal,
        creditDebt: debtState.creditDebt,
        accountLimited: debtState.accountLimited,
      },
      select: {
        realCreditBalance: true,
        bonusCreditBalance: true,
        pendingCreditBalance: true,
        creditBalance: true,
      },
    });
    const total = this.totalBalance(updated);
    await tx.user.update({ where: { id: userId }, data: { creditBalance: total } });
    await tx.creditLedger.create({
      data: {
        userId,
        amount: -amt,
        type: purpose,
        creditType: pendingDebit > 0 ? 'PENDING' : 'REAL',
        purpose,
        referenceId: topUpId,
        description: `Odečtení dočasného kreditu ${invoiceNumber} (${purpose})`,
      },
    });
  }

  async chargeOwnerReal(
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
      select: {
        realCreditBalance: true,
        bonusCreditBalance: true,
        pendingCreditBalance: true,
        creditBalance: true,
        creditDebt: true,
        accountLimited: true,
      },
    });
    if (!owner) return charge;

    const spendable = Math.max(0, owner.realCreditBalance) + Math.max(0, owner.bonusCreditBalance);
    if (spendable < charge) {
      throw new ForbiddenException('Nedostatek kreditu pro odečtení.');
    }

    let newReal = owner.realCreditBalance - charge;
    const debtState = normalizeCreditDebtState({
      realCreditBalance: Math.max(0, newReal),
      bonusCreditBalance: owner.bonusCreditBalance,
      creditDebt: owner.creditDebt,
      accountLimited: owner.accountLimited,
    });
    if (newReal < 0) {
      newReal = 0;
    }

    const updated = await tx.user.update({
      where: { id: ownerUserId },
      data: {
        realCreditBalance: newReal,
        creditDebt: debtState.creditDebt,
        accountLimited: debtState.accountLimited,
      },
      select: {
        realCreditBalance: true,
        bonusCreditBalance: true,
        pendingCreditBalance: true,
        creditBalance: true,
      },
    });
    const total = this.totalBalance(updated);
    await tx.user.update({ where: { id: ownerUserId }, data: { creditBalance: total } });
    await tx.creditLedger.create({
      data: {
        userId: ownerUserId,
        amount: -charge,
        type: 'OWNER_CONTACT_LEAD',
        creditType: 'REAL',
        purpose: 'OWNER_CONTACT_LEAD',
        referenceId,
        description,
      },
    });
    return charge;
  }
}
