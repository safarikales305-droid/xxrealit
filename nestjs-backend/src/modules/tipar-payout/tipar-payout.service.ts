import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TiparPayoutStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreditWalletService } from '../credits/credit-wallet.service';
import { EmailsService } from '../emails/emails.service';
import type { CreateTiparPayoutRequestDto, UpdateTiparPayoutStatusDto } from './dto/tipar-payout.dto';

const ACTIVE_PAYOUT_STATUSES: TiparPayoutStatus[] = [
  TiparPayoutStatus.PENDING,
  TiparPayoutStatus.APPROVED,
];

@Injectable()
export class TiparPayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: CreditWalletService,
    private readonly emails: EmailsService,
  ) {}

  private async getTiparUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        whatsappPhone: true,
        role: true,
        isTipar: true,
        emailVerified: true,
        phoneVerified: true,
        whatsappVerified: true,
        tiparPayoutBankAccount: true,
        tiparLifetimeEarnings: true,
        tiparEarningsBalance: true,
        tiparPaidOutTotal: true,
        bonusCreditBalance: true,
        realCreditBalance: true,
      },
    });
    if (!user || !user.isTipar) {
      throw new ForbiddenException('Pouze aktivní tipař může spravovat výplaty.');
    }
    return user;
  }

  private async sumActivePayoutRequests(userId: string): Promise<number> {
    const agg = await this.prisma.tiparPayoutRequest.aggregate({
      where: { userId, status: { in: ACTIVE_PAYOUT_STATUSES } },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? 0;
  }

  private payoutEligibility(
    user: {
      emailVerified: boolean;
      phoneVerified: boolean;
      whatsappVerified: boolean;
      tiparPayoutBankAccount: string | null;
      tiparEarningsBalance: number;
    },
    availableForPayout: number,
  ) {
    const blockers: string[] = [];
    if (!String(user.tiparPayoutBankAccount ?? '').trim()) {
      blockers.push('Doplňte bankovní účet');
    }
    if (!user.phoneVerified && !user.whatsappVerified) {
      blockers.push('Ověřte telefonní číslo');
    }
    if (!user.emailVerified) {
      blockers.push('Ověřte e-mail');
    }
    if (availableForPayout <= 0) {
      blockers.push('Nemáte žádný výdělek k výplatě');
    }
    return {
      canRequest: blockers.length === 0,
      blockers,
    };
  }

  async getSummary(userId: string) {
    const user = await this.getTiparUser(userId);
    const reserved = await this.sumActivePayoutRequests(userId);
    const availableForPayout = Math.max(0, user.tiparEarningsBalance - reserved);
    const eligibility = this.payoutEligibility(user, availableForPayout);

    return {
      lifetimeEarnings: user.tiparLifetimeEarnings,
      paidOutTotal: user.tiparPaidOutTotal,
      earningsBalance: user.tiparEarningsBalance,
      reservedInRequests: reserved,
      availableForPayout,
      bonusCredit: user.bonusCreditBalance,
      realCreditBalance: user.realCreditBalance,
      bankAccount: user.tiparPayoutBankAccount,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      whatsappVerified: user.whatsappVerified,
      ...eligibility,
    };
  }

  async listHistory(userId: string) {
    await this.getTiparUser(userId);
    const rows = await this.prisma.tiparPayoutRequest.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
      take: 100,
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        amount: r.amount,
        status: r.status,
        adminNote: r.adminNote,
        requestedAt: r.requestedAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
      })),
    };
  }

  async createRequest(userId: string, dto: CreateTiparPayoutRequestDto) {
    const user = await this.getTiparUser(userId);
    const amount = Math.trunc(dto.amount);
    if (amount <= 0) throw new BadRequestException('Neplatná částka.');

    const reserved = await this.sumActivePayoutRequests(userId);
    const availableForPayout = Math.max(0, user.tiparEarningsBalance - reserved);
    const eligibility = this.payoutEligibility(user, availableForPayout);
    if (!eligibility.canRequest) {
      throw new BadRequestException(eligibility.blockers[0] ?? 'Výplatu nelze požádat.');
    }
    if (amount > availableForPayout) {
      throw new BadRequestException(
        `Maximálně lze vyplatit ${availableForPayout.toLocaleString('cs-CZ')} Kč.`,
      );
    }

    const bank = String(user.tiparPayoutBankAccount ?? '').trim();
    const request = await this.prisma.tiparPayoutRequest.create({
      data: {
        userId,
        amount,
        bankAccountSnapshot: bank,
        userEmailSnapshot: user.email,
        userPhoneSnapshot: user.phone ?? user.whatsappPhone,
        userRoleSnapshot: user.role,
      },
    });

    try {
      await this.emails.sendTiparPayoutRequestReceivedEmail({
        to: user.email,
        userName: user.name || 'tipaři',
        amount,
        userId: user.id,
        requestId: request.id,
      });
    } catch {
      /* e-mail failure must not block request */
    }

    return {
      ok: true,
      request: {
        id: request.id,
        amount: request.amount,
        status: request.status,
        requestedAt: request.requestedAt.toISOString(),
      },
      message: 'Žádost o výplatu byla odeslána.',
    };
  }

  async listAdmin(status?: TiparPayoutStatus) {
    const rows = await this.prisma.tiparPayoutRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { requestedAt: 'desc' },
      take: 500,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            whatsappPhone: true,
            role: true,
            tiparPayoutBankAccount: true,
          },
        },
      },
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: r.user.name,
        userEmail: r.userEmailSnapshot || r.user.email,
        userPhone: r.userPhoneSnapshot || r.user.phone || r.user.whatsappPhone,
        userRole: r.userRoleSnapshot || r.user.role,
        bankAccount: r.bankAccountSnapshot || r.user.tiparPayoutBankAccount,
        amount: r.amount,
        status: r.status,
        adminNote: r.adminNote,
        requestedAt: r.requestedAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
      })),
    };
  }

  async updateStatus(adminId: string, requestId: string, dto: UpdateTiparPayoutStatusDto) {
    const request = await this.prisma.tiparPayoutRequest.findUnique({
      where: { id: requestId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!request) throw new NotFoundException('Žádost nenalezena.');

    const next = dto.status;
    const note = dto.adminNote?.trim() || null;

    if (next === TiparPayoutStatus.PAID) {
      if (request.status === TiparPayoutStatus.PAID) {
        throw new BadRequestException('Žádost je již označena jako vyplacená.');
      }
      if (request.status === TiparPayoutStatus.REJECTED) {
        throw new BadRequestException('Zamítnutou žádost nelze vyplatit.');
      }

      await this.prisma.$transaction(async (tx) => {
        await this.wallet.debitTiparPayout(
          tx,
          request.userId,
          request.amount,
          request.id,
          `Výplata výdělku z tipů (${request.id})`,
        );
        await tx.tiparPayoutRequest.update({
          where: { id: request.id },
          data: {
            status: TiparPayoutStatus.PAID,
            adminNote: note ?? request.adminNote,
            resolvedAt: new Date(),
            resolvedByAdminId: adminId,
          },
        });
      });
    } else if (next === TiparPayoutStatus.REJECTED) {
      if (request.status === TiparPayoutStatus.PAID) {
        throw new BadRequestException('Vyplacenou žádost nelze zamítnout.');
      }
      await this.prisma.tiparPayoutRequest.update({
        where: { id: request.id },
        data: {
          status: TiparPayoutStatus.REJECTED,
          adminNote: note ?? request.adminNote,
          resolvedAt: new Date(),
          resolvedByAdminId: adminId,
        },
      });
    } else if (next === TiparPayoutStatus.APPROVED) {
      if (request.status === TiparPayoutStatus.PAID || request.status === TiparPayoutStatus.REJECTED) {
        throw new BadRequestException('Žádost už byla uzavřena.');
      }
      await this.prisma.tiparPayoutRequest.update({
        where: { id: request.id },
        data: {
          status: TiparPayoutStatus.APPROVED,
          adminNote: note ?? request.adminNote,
          resolvedAt: new Date(),
          resolvedByAdminId: adminId,
        },
      });
    } else if (next === TiparPayoutStatus.PENDING) {
      throw new BadRequestException('Nelze vrátit žádost do stavu čeká.');
    }

    const updated = await this.prisma.tiparPayoutRequest.findUnique({ where: { id: requestId } });
    const user = request.user;

    try {
      if (next === TiparPayoutStatus.APPROVED) {
        await this.emails.sendTiparPayoutApprovedEmail({
          to: user.email,
          userName: user.name || 'tipaři',
          amount: request.amount,
          userId: user.id,
          requestId: request.id,
          adminNote: note,
        });
      } else if (next === TiparPayoutStatus.REJECTED) {
        await this.emails.sendTiparPayoutRejectedEmail({
          to: user.email,
          userName: user.name || 'tipaři',
          amount: request.amount,
          userId: user.id,
          requestId: request.id,
          adminNote: note,
        });
      } else if (next === TiparPayoutStatus.PAID) {
        await this.emails.sendTiparPayoutPaidEmail({
          to: user.email,
          userName: user.name || 'tipaři',
          amount: request.amount,
          userId: user.id,
          requestId: request.id,
          adminNote: note,
        });
      }
    } catch {
      /* ignore email errors */
    }

    return { ok: true, request: updated };
  }
}
