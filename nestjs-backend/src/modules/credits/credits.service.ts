import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { CreditTopUpStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreditWalletService } from './credit-wallet.service';
import { UpdateCreditSettingsDto } from './dto/update-credit-settings.dto';
import { buildQrImageUrl, buildSpdPayload } from './utils/spd-qr.util';
import { canTopUpCredits } from '../users/profile-requirements.util';
import { ListingContactUnlockService } from '../properties/listing-contact-unlock.service';
import { PortalWorkerService } from '../portal-worker/portal-worker.service';
import { normalizeCreditDebtState } from './credit-debt.util';

const SETTINGS_ID = 'default';

const PENDING_MESSAGE =
  'Kredit byl dočasně připsán. Proveďte platbu podle QR kódu. Pokud platba nebude do 2 dnů potvrzena administrátorem, kredit bude odečten zpět a účet může být omezen nebo zablokován.';

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: CreditWalletService,
    @Inject(forwardRef(() => ListingContactUnlockService))
    private readonly listingLeads: ListingContactUnlockService,
    @Inject(forwardRef(() => PortalWorkerService))
    private readonly portalWorker: PortalWorkerService,
  ) {}

  private async getSettingsRow() {
    const row = await this.prisma.creditTopUpSetting.findUnique({
      where: { id: SETTINGS_ID },
    });
    if (row) return row;
    return this.prisma.creditTopUpSetting.create({
      data: { id: SETTINGS_ID },
    });
  }

  private serializeSettings(row: Awaited<ReturnType<typeof this.getSettingsRow>>) {
    return {
      id: row.id,
      accountNumber: row.accountNumber,
      bankCode: row.bankCode,
      recipientName: row.recipientName,
      minAmount: row.minAmount,
      maxAmount: row.maxAmount,
      paymentMessage: row.paymentMessage,
      confirmDeadlineDays: row.confirmDeadlineDays,
      allowUnverifiedFirstTopUp: row.allowUnverifiedFirstTopUp,
      maxUnverifiedFirstTopUpAmount: row.maxUnverifiedFirstTopUpAmount,
      allowPendingCreditSpending: row.allowPendingCreditSpending,
      allowPendingForInternalServices: row.allowPendingForInternalServices,
      allowBonusCreditOnListingContacts: row.allowBonusCreditOnListingContacts,
      allowBonusCreditOnTipContacts: row.allowBonusCreditOnTipContacts,
      dailyTopUpLimit: row.dailyTopUpLimit,
      pendingTopUpLimit: row.pendingTopUpLimit,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private serializeTransaction(
    tx: Prisma.CreditTopUpTransactionGetPayload<{
      include: { user: { select: { id: true; email: true; name: true } } };
    }>,
  ) {
    return {
      id: tx.id,
      userId: tx.userId,
      userEmail: tx.user.email,
      userName: tx.user.name,
      amount: tx.amount,
      variableSymbol: tx.variableSymbol,
      invoiceNumber: tx.invoiceNumber,
      status: tx.status,
      qrPayload: tx.qrPayload,
      creditedImmediately: tx.creditedImmediately,
      expiresAt: tx.expiresAt.toISOString(),
      confirmedAt: tx.confirmedAt?.toISOString() ?? null,
      rejectedAt: tx.rejectedAt?.toISOString() ?? null,
      reversedAt: tx.reversedAt?.toISOString() ?? null,
      createdAt: tx.createdAt.toISOString(),
      updatedAt: tx.updatedAt.toISOString(),
      qrImageUrl: buildQrImageUrl(tx.qrPayload),
      paymentDetails: this.paymentDetailsFromPayload(tx.qrPayload, tx.amount),
    };
  }

  private paymentDetailsFromPayload(qrPayload: string, amount: number) {
    const vs = qrPayload.match(/X-VS:([^*]+)/)?.[1] ?? '';
    const acc = qrPayload.match(/ACC:([^*]+)/)?.[1] ?? '';
    const msg = qrPayload.match(/MSG:(.+)$/)?.[1] ?? '';
    return { account: acc, amount, currency: 'CZK', variableSymbol: vs, message: msg };
  }

  private async nextVariableSymbol(): Promise<string> {
    const count = await this.prisma.creditTopUpTransaction.count();
    const base = 1000000000 + count + 1;
    return String(base).slice(-10);
  }

  private nextInvoiceNumber(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const rand = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return `KT-${date}-${rand}`;
  }

  async getBalance(userId: string) {
    await this.expirePendingForUser(userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        creditBalance: true,
        realCreditBalance: true,
        bonusCreditBalance: true,
        pendingCreditBalance: true,
        creditDebt: true,
        accountLimited: true,
        isCreditVerified: true,
        firstTopUpUsed: true,
      },
    });
    if (!user) throw new NotFoundException('Uživatel nenalezen');

    const pending = await this.prisma.creditTopUpTransaction.findMany({
      where: { userId, status: CreditTopUpStatus.PENDING },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const settings = await this.getSettingsRow();

    const balances = this.wallet.serializeBalances(user);
    const paidCredit = balances.realCreditBalance;
    const bonusCredit = balances.bonusCreditBalance;
    const debtState = normalizeCreditDebtState({
      realCreditBalance: paidCredit,
      bonusCreditBalance: bonusCredit,
      creditDebt: user.creditDebt,
      accountLimited: user.accountLimited,
    });
    const displayDebt = debtState.creditDebt;
    const displayLimited = debtState.accountLimited;
    if (
      user.creditDebt !== displayDebt ||
      user.accountLimited !== displayLimited
    ) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { creditDebt: displayDebt, accountLimited: displayLimited },
      });
    }
    const warning =
      pending.length > 0
        ? PENDING_MESSAGE.replace(
            '2 dnů',
            `${settings.confirmDeadlineDays} ${settings.confirmDeadlineDays === 1 ? 'dne' : 'dnů'}`,
          )
        : displayLimited && displayDebt > 0
          ? 'Váš účet je omezen kvůli neuhrazenému dobití kreditu. Kontaktujte podporu.'
          : null;
    return {
      ...balances,
      paidCredit,
      bonusCredit,
      marketingCreditTotal: paidCredit + bonusCredit,
      creditDebt: displayDebt,
      accountLimited: displayLimited,
      isCreditVerified: user.isCreditVerified,
      firstTopUpUsed: user.firstTopUpUsed,
      warning,
      pendingTopUps: pending.map((p) => ({
        id: p.id,
        amount: p.amount,
        status: p.status,
        expiresAt: p.expiresAt.toISOString(),
        variableSymbol: p.variableSymbol,
      })),
    };
  }

  async getHistory(userId: string, limit = 50) {
    const take = Math.min(100, Math.max(1, Math.trunc(limit)));
    const [ledger, transactions] = await Promise.all([
      this.prisma.creditLedger.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.creditTransaction.findMany({
        where: { buyerUserId: userId },
        orderBy: { createdAt: 'desc' },
        take,
      }),
    ]);

    const ledgerRows = ledger.map((row) => ({
      id: row.id,
      source: 'ledger' as const,
      amount: row.amount,
      type: row.type,
      purpose: row.purpose,
      description: row.description,
      createdAt: row.createdAt.toISOString(),
    }));

    const txRows = transactions.map((row) => ({
      id: row.id,
      source: 'transaction' as const,
      amount: row.amount,
      type: row.type,
      purpose: row.type,
      description: row.description,
      propertyId: row.propertyId,
      createdAt: row.createdAt.toISOString(),
    }));

    return [...ledgerRows, ...txRows]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, take);
  }

  async topUp(userId: string, amountInput: number) {
    const amount = Math.trunc(amountInput);
    if (!Number.isFinite(amount) || amount !== amountInput) {
      throw new BadRequestException('Částka musí být celé číslo v Kč.');
    }

    const settings = await this.getSettingsRow();
    if (amount < settings.minAmount) {
      throw new BadRequestException(
        `Minimální částka dobití je ${settings.minAmount.toLocaleString('cs-CZ')} Kč.`,
      );
    }
    if (amount > settings.maxAmount) {
      throw new BadRequestException(
        `Maximální částka dobití je ${settings.maxAmount.toLocaleString('cs-CZ')} Kč.`,
      );
    }
    if (!settings.accountNumber.trim() || !settings.bankCode.trim()) {
      throw new BadRequestException(
        'Platební údaje nejsou nastaveny. Kontaktujte administrátora.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        isCreditVerified: true,
        firstTopUpUsed: true,
        whatsappVerified: true,
        emailVerified: true,
        name: true,
        role: true,
      },
    });
    if (!user) throw new NotFoundException('Uživatel nenalezen');

    if (!canTopUpCredits(user)) {
      const issues: string[] = [];
      if (!user.whatsappVerified) issues.push('ověřte WhatsApp číslo');
      if (!user.emailVerified) issues.push('ověřte e-mail');
      if (!user.name?.trim()) issues.push('vyplňte jméno v profilu');
      throw new BadRequestException(
        `Pro dobití kreditu ${issues.join(', ')}.`,
      );
    }

    if (!user.isCreditVerified) {
      if (!settings.allowUnverifiedFirstTopUp) {
        throw new BadRequestException(
          'Dobití kreditu je dostupné až po ověření účtu administrátorem.',
        );
      }
      const existingTopUp = await this.prisma.creditTopUpTransaction.findFirst({
        where: {
          userId,
          status: {
            in: [
              CreditTopUpStatus.PENDING,
              CreditTopUpStatus.CONFIRMED,
            ],
          },
        },
      });
      if (user.firstTopUpUsed || existingTopUp) {
        throw new BadRequestException(
          'Další dobití kreditu bude možné po ověření první platby administrátorem.',
        );
      }
      if (amount > settings.maxUnverifiedFirstTopUpAmount) {
        throw new BadRequestException(
          `Maximální částka prvního dobití pro neověřeného uživatele je ${settings.maxUnverifiedFirstTopUpAmount.toLocaleString('cs-CZ')} Kč.`,
        );
      }
    }

    await this.assertTopUpLimits(userId, amount, settings);

    const variableSymbol = await this.nextVariableSymbol();
    const invoiceNumber = this.nextInvoiceNumber();
    const qrPayload = buildSpdPayload({
      accountNumber: settings.accountNumber,
      bankCode: settings.bankCode,
      amountCzk: amount,
      variableSymbol,
      message: settings.paymentMessage,
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + settings.confirmDeadlineDays);

    const message = PENDING_MESSAGE.replace(
      '2 dnů',
      `${settings.confirmDeadlineDays} ${settings.confirmDeadlineDays === 1 ? 'dne' : 'dnů'}`,
    );

    const tx = await this.prisma.$transaction(async (db) => {
      const created = await db.creditTopUpTransaction.create({
        data: {
          userId,
          amount,
          variableSymbol,
          invoiceNumber,
          status: CreditTopUpStatus.PENDING,
          qrPayload,
          creditedImmediately: false,
          expiresAt,
        },
      });

      await this.wallet.creditPendingTopUp(
        db,
        userId,
        amount,
        created.id,
        `Dobití kreditu ${invoiceNumber} (čeká na potvrzení)`,
      );

      if (!user.isCreditVerified) {
        await db.user.update({
          where: { id: userId },
          data: { firstTopUpUsed: true },
        });
      }

      return created;
    });

    return {
      transactionId: tx.id,
      amount: tx.amount,
      variableSymbol: tx.variableSymbol,
      invoiceNumber: tx.invoiceNumber,
      qrPayload: tx.qrPayload,
      qrImageUrl: buildQrImageUrl(tx.qrPayload),
      expiresAt: tx.expiresAt.toISOString(),
      message,
      paymentDetails: {
        accountNumber: settings.accountNumber,
        bankCode: settings.bankCode,
        recipientName: settings.recipientName,
        amount: tx.amount,
        currency: 'CZK',
        variableSymbol: tx.variableSymbol,
        paymentMessage: settings.paymentMessage,
      },
    };
  }

  async listTopUpsForAdmin() {
    await this.expireAllPending();
    const rows = await this.prisma.creditTopUpTransaction.findMany({
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((r) => this.serializeTransaction(r));
  }

  async getSettingsForAdmin() {
    return this.serializeSettings(await this.getSettingsRow());
  }

  async updateSettings(dto: UpdateCreditSettingsDto) {
    if (
      dto.minAmount != null &&
      dto.maxAmount != null &&
      dto.minAmount > dto.maxAmount
    ) {
      throw new BadRequestException('Minimum nesmí být větší než maximum.');
    }
    const current = await this.getSettingsRow();
    const minAmount = dto.minAmount ?? current.minAmount;
    const maxAmount = dto.maxAmount ?? current.maxAmount;
    if (minAmount > maxAmount) {
      throw new BadRequestException('Minimum nesmí být větší než maximum.');
    }

    const updated = await this.prisma.creditTopUpSetting.update({
      where: { id: SETTINGS_ID },
      data: {
        ...(dto.accountNumber !== undefined ? { accountNumber: dto.accountNumber.trim() } : {}),
        ...(dto.bankCode !== undefined ? { bankCode: dto.bankCode.trim() } : {}),
        ...(dto.recipientName !== undefined ? { recipientName: dto.recipientName.trim() } : {}),
        ...(dto.minAmount !== undefined ? { minAmount: dto.minAmount } : {}),
        ...(dto.maxAmount !== undefined ? { maxAmount: dto.maxAmount } : {}),
        ...(dto.paymentMessage !== undefined ? { paymentMessage: dto.paymentMessage.trim() } : {}),
        ...(dto.confirmDeadlineDays !== undefined
          ? { confirmDeadlineDays: dto.confirmDeadlineDays }
          : {}),
        ...(dto.allowUnverifiedFirstTopUp !== undefined
          ? { allowUnverifiedFirstTopUp: dto.allowUnverifiedFirstTopUp }
          : {}),
        ...(dto.maxUnverifiedFirstTopUpAmount !== undefined
          ? { maxUnverifiedFirstTopUpAmount: dto.maxUnverifiedFirstTopUpAmount }
          : {}),
        ...(dto.allowPendingCreditSpending !== undefined
          ? { allowPendingCreditSpending: dto.allowPendingCreditSpending }
          : {}),
        ...(dto.allowPendingForInternalServices !== undefined
          ? { allowPendingForInternalServices: dto.allowPendingForInternalServices }
          : {}),
        ...(dto.allowBonusCreditOnListingContacts !== undefined
          ? { allowBonusCreditOnListingContacts: dto.allowBonusCreditOnListingContacts }
          : {}),
        ...(dto.allowBonusCreditOnTipContacts !== undefined
          ? { allowBonusCreditOnTipContacts: dto.allowBonusCreditOnTipContacts }
          : {}),
        ...(dto.dailyTopUpLimit !== undefined ? { dailyTopUpLimit: dto.dailyTopUpLimit } : {}),
        ...(dto.pendingTopUpLimit !== undefined
          ? { pendingTopUpLimit: dto.pendingTopUpLimit }
          : {}),
      },
    });
    return this.serializeSettings(updated);
  }

  private getTodayRange(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  private async assertTopUpLimits(
    userId: string,
    amount: number,
    settings: Awaited<ReturnType<typeof this.getSettingsRow>>,
  ): Promise<void> {
    const { start, end } = this.getTodayRange();
    const [dailyAgg, pendingAgg] = await Promise.all([
      this.prisma.creditTopUpTransaction.aggregate({
        where: {
          userId,
          status: {
            in: [CreditTopUpStatus.PENDING, CreditTopUpStatus.CONFIRMED],
          },
          createdAt: { gte: start, lte: end },
        },
        _sum: { amount: true },
      }),
      this.prisma.creditTopUpTransaction.aggregate({
        where: {
          userId,
          status: CreditTopUpStatus.PENDING,
        },
        _sum: { amount: true },
      }),
    ]);

    const dailySum = dailyAgg._sum.amount ?? 0;
    const pendingSum = pendingAgg._sum.amount ?? 0;

    if (dailySum + amount > settings.dailyTopUpLimit) {
      throw new BadRequestException('Překročili jste denní limit dobití kreditu.');
    }

    if (pendingSum + amount > settings.pendingTopUpLimit) {
      throw new BadRequestException(
        'Máte neuhrazenou nebo nepotvrzenou platbu. Další dobití je možné až po potvrzení administrátorem.',
      );
    }
  }

  async confirmTopUp(id: string) {
    const tx = await this.findTopUpOrThrow(id);
    if (tx.status !== CreditTopUpStatus.PENDING) {
      throw new BadRequestException('Transakci lze potvrdit jen ve stavu PENDING.');
    }
    const updated = await this.prisma.$transaction(async (db) => {
      await this.wallet.confirmPendingTopUp(
        db,
        tx.userId,
        tx.amount,
        tx.id,
        tx.invoiceNumber,
      );
      return db.creditTopUpTransaction.update({
        where: { id },
        data: {
          status: CreditTopUpStatus.CONFIRMED,
          confirmedAt: new Date(),
        },
        include: { user: { select: { id: true, email: true, name: true } } },
      });
    });
    try {
      await this.listingLeads.unlockPendingLeadsForUser(updated.userId);
    } catch (err) {
      this.logger.warn(
        `Unlock pending leads after top-up failed user=${updated.userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    try {
      await this.recalculateUserCredit(updated.userId);
    } catch (err) {
      this.logger.warn(
        `Recalculate credit after top-up failed user=${updated.userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    try {
      await this.portalWorker.processCommissionForTopUp(
        updated.userId,
        updated.id,
        updated.amount,
      );
    } catch (err) {
      this.logger.warn(
        `Worker commission after top-up failed user=${updated.userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return this.serializeTransaction(updated);
  }

  async verifyUserCredit(userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isCreditVerified: true },
      select: {
        id: true,
        isCreditVerified: true,
        firstTopUpUsed: true,
        realCreditBalance: true,
        bonusCreditBalance: true,
        pendingCreditBalance: true,
      },
    });
    const total = this.wallet.totalBalance(user);
    await this.prisma.user.update({
      where: { id: userId },
      data: { creditBalance: total },
    });
    return { ok: true, user: { ...user, creditBalance: total } };
  }

  async unverifyUserCredit(userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isCreditVerified: false },
      select: { id: true, isCreditVerified: true },
    });
    return { ok: true, user };
  }

  async rejectTopUp(id: string, blockAccount = false) {
    const tx = await this.findTopUpOrThrow(id);
    if (tx.status !== CreditTopUpStatus.PENDING) {
      throw new BadRequestException('Zamítnout lze jen transakci ve stavu PENDING.');
    }
    return this.reverseTopUpInternal(tx, CreditTopUpStatus.REJECTED, {
      rejectedAt: new Date(),
      blockAccount,
    });
  }

  async reverseTopUp(id: string, blockAccount = false) {
    const tx = await this.findTopUpOrThrow(id);
    if (
      tx.status !== CreditTopUpStatus.PENDING &&
      tx.status !== CreditTopUpStatus.CONFIRMED
    ) {
      throw new BadRequestException('Odečíst lze jen pending nebo potvrzenou transakci.');
    }
    return this.reverseTopUpInternal(tx, CreditTopUpStatus.REVERSED, {
      reversedAt: new Date(),
      blockAccount,
    });
  }

  private async reverseTopUpInternal(
    tx: { id: string; userId: string; amount: number; invoiceNumber: string; status: CreditTopUpStatus },
    status: Extract<CreditTopUpStatus, 'REJECTED' | 'REVERSED' | 'EXPIRED'>,
    opts: { rejectedAt?: Date; reversedAt?: Date; blockAccount?: boolean },
  ) {
    const pending = CreditTopUpStatus.PENDING;
    const confirmed = CreditTopUpStatus.CONFIRMED;
    const canReverse =
      tx.status === pending ||
      (status === 'REVERSED' && tx.status === confirmed);
    if (!canReverse) {
      throw new BadRequestException('Transakci nelze odečíst v aktuálním stavu.');
    }

    const ledgerPurpose =
      status === 'EXPIRED' ? 'TOP_UP_EXPIRED' : 'TOP_UP_REVERSED';

    const updated = await this.prisma.$transaction(async (db) => {
      if (tx.status === CreditTopUpStatus.PENDING) {
        await this.wallet.reversePendingTopUp(
          db,
          tx.userId,
          tx.amount,
          tx.id,
          tx.invoiceNumber,
          ledgerPurpose,
        );
      } else {
        const user = await db.user.findUnique({
          where: { id: tx.userId },
          select: {
            realCreditBalance: true,
            bonusCreditBalance: true,
            pendingCreditBalance: true,
            creditDebt: true,
            accountLimited: true,
          },
        });
        if (!user) throw new NotFoundException('Uživatel nenalezen');
        let newReal = user.realCreditBalance - tx.amount;
        let rawDebt = user.creditDebt;
        if (newReal < 0) {
          rawDebt += -newReal;
          newReal = 0;
        }
        const debtState = normalizeCreditDebtState({
          realCreditBalance: newReal,
          bonusCreditBalance: user.bonusCreditBalance,
          creditDebt: rawDebt,
          accountLimited: opts.blockAccount || user.accountLimited || rawDebt > 0,
        });
        const row = await db.user.update({
          where: { id: tx.userId },
          data: {
            realCreditBalance: newReal,
            creditDebt: debtState.creditDebt,
            accountLimited: debtState.accountLimited,
          },
          select: {
            realCreditBalance: true,
            bonusCreditBalance: true,
            pendingCreditBalance: true,
          },
        });
        const total = this.wallet.totalBalance(row);
        await db.user.update({
          where: { id: tx.userId },
          data: { creditBalance: total },
        });
        await db.creditLedger.create({
          data: {
            userId: tx.userId,
            amount: -tx.amount,
            type: ledgerPurpose,
            creditType: 'REAL',
            purpose: ledgerPurpose,
            referenceId: tx.id,
            description: `Odečtení potvrzeného kreditu ${tx.invoiceNumber} (${status})`,
          },
        });
      }

      return db.creditTopUpTransaction.update({
        where: { id: tx.id },
        data: {
          status,
          ...(opts.rejectedAt ? { rejectedAt: opts.rejectedAt } : {}),
          ...(opts.reversedAt ? { reversedAt: opts.reversedAt } : {}),
        },
        include: { user: { select: { id: true, email: true, name: true } } },
      });
    });

    return this.serializeTransaction(updated);
  }

  async expireAllPending() {
    const now = new Date();
    const pending = await this.prisma.creditTopUpTransaction.findMany({
      where: { status: CreditTopUpStatus.PENDING, expiresAt: { lt: now } },
      select: { id: true },
    });
    for (const row of pending) {
      try {
        const tx = await this.findTopUpOrThrow(row.id);
        if (tx.status === CreditTopUpStatus.PENDING) {
          await this.reverseTopUpInternal(tx, CreditTopUpStatus.EXPIRED, {});
        }
      } catch (err) {
        this.logger.warn(`Expire top-up ${row.id} failed: ${String(err)}`);
      }
    }
    return pending.length;
  }

  async expirePendingForUser(userId: string) {
    const now = new Date();
    const pending = await this.prisma.creditTopUpTransaction.findMany({
      where: {
        userId,
        status: CreditTopUpStatus.PENDING,
        expiresAt: { lt: now },
      },
      select: { id: true },
    });
    for (const row of pending) {
      try {
        const tx = await this.findTopUpOrThrow(row.id);
        if (tx.status === CreditTopUpStatus.PENDING) {
          await this.reverseTopUpInternal(tx, CreditTopUpStatus.EXPIRED, {});
        }
      } catch {
        /* already processed */
      }
    }
  }

  private async findTopUpOrThrow(id: string) {
    const tx = await this.prisma.creditTopUpTransaction.findUnique({ where: { id } });
    if (!tx) throw new NotFoundException('Transakce nenalezena');
    return tx;
  }

  /**
   * Přepočítá zůstatky z CreditLedger (+ ověří součet CreditTransaction).
   * Vymaže neoprávněný creditDebt, pokud neexistuje zrušené/expir. dobití.
   */
  async recalculateUserCredit(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        accountLimited: true,
        creditDebt: true,
      },
    });
    if (!user) throw new NotFoundException('Uživatel nenalezen');

    const [ledgerRows, txSum] = await Promise.all([
      this.prisma.creditLedger.findMany({
        where: { userId },
        select: { amount: true, creditType: true, purpose: true },
      }),
      this.prisma.creditTransaction.aggregate({
        where: { buyerUserId: userId },
        _sum: { amount: true },
      }),
    ]);

    let real = 0;
    let bonus = 0;
    let pending = 0;
    for (const row of ledgerRows) {
      const bucket = (row.creditType ?? 'REAL').toUpperCase();
      if (bucket === 'BONUS') bonus += row.amount;
      else if (bucket === 'PENDING') pending += row.amount;
      else real += row.amount;
    }

    real = Math.max(0, real);
    bonus = Math.max(0, bonus);
    pending = Math.max(0, pending);

    const hasReversal = ledgerRows.some(
      (r) => r.purpose === 'TOP_UP_REVERSED' || r.purpose === 'TOP_UP_EXPIRED',
    );
    const rawDebt = hasReversal ? Math.max(0, user.creditDebt) : 0;
    const debtState = normalizeCreditDebtState({
      realCreditBalance: real,
      bonusCreditBalance: bonus,
      creditDebt: rawDebt,
      accountLimited: user.accountLimited,
    });
    const creditDebt = debtState.creditDebt;
    const accountLimited = debtState.accountLimited;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        realCreditBalance: real,
        bonusCreditBalance: bonus,
        pendingCreditBalance: pending,
        creditBalance: real + bonus + pending,
        creditDebt,
        accountLimited,
      },
      select: {
        realCreditBalance: true,
        bonusCreditBalance: true,
        pendingCreditBalance: true,
        creditBalance: true,
        creditDebt: true,
        accountLimited: true,
      },
    });

    return {
      ...this.wallet.serializeBalances(updated),
      creditDebt: updated.creditDebt,
      accountLimited: updated.accountLimited,
      ledgerEntries: ledgerRows.length,
      creditTransactionSum: txSum._sum.amount ?? 0,
    };
  }

  /** Jednorázová / hromadná oprava neoprávněného creditDebt u všech uživatelů. */
  async fixUnauthorizedCreditDebts() {
    const users = await this.prisma.user.findMany({
      where: { OR: [{ creditDebt: { gt: 0 } }, { accountLimited: true }] },
      select: { id: true },
    });
    const results: Array<{ userId: string; creditDebt: number }> = [];
    for (const u of users) {
      const r = await this.recalculateUserCredit(u.id);
      results.push({ userId: u.id, creditDebt: r.creditDebt });
    }
    return { fixed: results.length, results };
  }
}
