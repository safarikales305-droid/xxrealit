import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreditTopUpStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UpdateCreditSettingsDto } from './dto/update-credit-settings.dto';
import { buildQrImageUrl, buildSpdPayload } from './utils/spd-qr.util';

const SETTINGS_ID = 'default';

const PENDING_MESSAGE =
  'Kredit byl dočasně připsán. Proveďte platbu podle QR kódu. Pokud platba nebude do 2 dnů potvrzena administrátorem, kredit bude odečten zpět a účet může být omezen nebo zablokován.';

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);

  constructor(private readonly prisma: PrismaService) {}

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
        creditDebt: true,
        accountLimited: true,
      },
    });
    if (!user) throw new NotFoundException('Uživatel nenalezen');

    const pending = await this.prisma.creditTopUpTransaction.findMany({
      where: { userId, status: CreditTopUpStatus.PENDING },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const settings = await this.getSettingsRow();
    const warning =
      pending.length > 0
        ? PENDING_MESSAGE.replace(
            '2 dnů',
            `${settings.confirmDeadlineDays} ${settings.confirmDeadlineDays === 1 ? 'dne' : 'dnů'}`,
          )
        : user.accountLimited
          ? 'Váš účet je omezen kvůli neuhrazenému dobití kreditu. Kontaktujte podporu.'
          : user.creditDebt > 0
            ? `Máte dluh ${user.creditDebt.toLocaleString('cs-CZ')} Kč z neuhrazeného dobití kreditu.`
            : null;

    return {
      creditBalance: user.creditBalance,
      creditDebt: user.creditDebt,
      accountLimited: user.accountLimited,
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
          creditedImmediately: true,
          expiresAt,
        },
      });

      await db.user.update({
        where: { id: userId },
        data: { creditBalance: { increment: amount } },
      });

      await db.creditLedger.create({
        data: {
          userId,
          amount,
          type: 'TOP_UP_PENDING',
          referenceId: created.id,
          description: `Dobití kreditu ${invoiceNumber} (čeká na potvrzení)`,
        },
      });

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
      },
    });
    return this.serializeSettings(updated);
  }

  async confirmTopUp(id: string) {
    const tx = await this.findTopUpOrThrow(id);
    if (tx.status !== CreditTopUpStatus.PENDING) {
      throw new BadRequestException('Transakci lze potvrdit jen ve stavu PENDING.');
    }
    const updated = await this.prisma.creditTopUpTransaction.update({
      where: { id },
      data: {
        status: CreditTopUpStatus.CONFIRMED,
        confirmedAt: new Date(),
      },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    await this.prisma.creditLedger.create({
      data: {
        userId: tx.userId,
        amount: 0,
        type: 'TOP_UP_CONFIRMED',
        referenceId: id,
        description: `Potvrzeno dobití ${tx.invoiceNumber}`,
      },
    });
    return this.serializeTransaction(updated);
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

    const updated = await this.prisma.$transaction(async (db) => {
      const user = await db.user.findUnique({
        where: { id: tx.userId },
        select: { creditBalance: true },
      });
      if (!user) throw new NotFoundException('Uživatel nenalezen');

      const newBalance = user.creditBalance - tx.amount;
      let creditDebt = 0;
      let creditBalance = newBalance;
      if (newBalance < 0) {
        creditDebt = -newBalance;
        creditBalance = 0;
      }

      await db.user.update({
        where: { id: tx.userId },
        data: {
          creditBalance,
          creditDebt: { increment: creditDebt },
          ...(opts.blockAccount || creditDebt > 0 ? { accountLimited: true } : {}),
        },
      });

      await db.creditLedger.create({
        data: {
          userId: tx.userId,
          amount: -tx.amount,
          type: status === 'EXPIRED' ? 'TOP_UP_EXPIRED' : 'TOP_UP_REVERSED',
          referenceId: tx.id,
          description: `Odečtení dočasného kreditu ${tx.invoiceNumber} (${status})`,
        },
      });

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
}
