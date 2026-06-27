import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ClientPreregistrationStatus,
  PortalWorkerStatus,
  UserRole,
  WorkerClientAuditAction,
  WorkerCommissionStatus,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { resolveFrontendUrl } from '../../common/resolve-frontend-url';
import { PrismaService } from '../../database/prisma.service';
import { EmailsService } from '../emails/emails.service';
import type { CreateClientPreregistrationDto } from './dto/create-client-preregistration.dto';
import type { UpdateWorkerCommissionSettingsDto } from './dto/update-worker-commission-settings.dto';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcrypt');

const WORKER_CLIENT_ROLES: UserRole[] = [
  UserRole.AGENT,
  UserRole.AGENCY,
  UserRole.COMPANY,
  UserRole.INVESTOR,
  UserRole.FINANCIAL_ADVISOR,
  UserRole.PRIVATE_SELLER,
];

@Injectable()
export class PortalWorkerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailsService,
    private readonly config: ConfigService,
  ) {}

  isActivePortalWorker(user: {
    role: UserRole;
    portalWorkerStatus: PortalWorkerStatus | null;
    emailVerified: boolean;
    whatsappVerified: boolean;
  }): boolean {
    return (
      user.role === UserRole.PORTAL_WORKER &&
      user.portalWorkerStatus === PortalWorkerStatus.APPROVED &&
      user.emailVerified === true &&
      user.whatsappVerified === true
    );
  }

  async requireActiveWorker(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        portalWorkerStatus: true,
        emailVerified: true,
        whatsappVerified: true,
        name: true,
        email: true,
      },
    });
    if (!user) throw new NotFoundException('Uživatel nenalezen.');
    if (!this.isActivePortalWorker(user)) {
      throw new ForbiddenException(
        'Funkce pracovníka portálu je dostupná po schválení adminem a ověření e-mailu a WhatsApp.',
      );
    }
    return user;
  }

  async listWorkersForAdmin() {
    const rows = await this.prisma.user.findMany({
      where: { role: UserRole.PORTAL_WORKER },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        city: true,
        whatsappPhone: true,
        whatsappVerified: true,
        emailVerified: true,
        portalWorkerStatus: true,
        portalWorkerApprovedAt: true,
        portalWorkerRejectedAt: true,
        portalWorkerSuspendedAt: true,
        createdAt: true,
        _count: { select: { portalWorkerClients: true } },
        workerProfile: { select: { maxBonusPerClient: true, commissionPercent: true, adminNotes: true } },
      },
    });

    const workerIds = rows.map((r) => r.id);
    const commissionAgg =
      workerIds.length > 0
        ? await this.prisma.workerCommission.groupBy({
            by: ['workerId'],
            where: { workerId: { in: workerIds } },
            _sum: { commissionAmount: true },
          })
        : [];
    const commissionMap = new Map(
      commissionAgg.map((a) => [a.workerId, a._sum.commissionAmount ?? 0]),
    );

    const clientIdsByWorker = await Promise.all(
      workerIds.map(async (workerId) => {
        const clients = await this.prisma.user.findMany({
          where: { portalWorkerId: workerId },
          select: { id: true },
        });
        return { workerId, clientIds: clients.map((c) => c.id) };
      }),
    );
    const allClientIds = clientIdsByWorker.flatMap((x) => x.clientIds);
    const turnoverAgg =
      allClientIds.length > 0
        ? await this.prisma.creditTopUpTransaction.groupBy({
            by: ['userId'],
            where: { userId: { in: allClientIds }, status: 'CONFIRMED' },
            _sum: { amount: true },
          })
        : [];
    const turnoverByClient = new Map(
      turnoverAgg.map((t) => [t.userId, t._sum.amount ?? 0]),
    );
    const turnoverByWorker = new Map<string, number>();
    for (const { workerId, clientIds } of clientIdsByWorker) {
      turnoverByWorker.set(
        workerId,
        clientIds.reduce((sum, id) => sum + (turnoverByClient.get(id) ?? 0), 0),
      );
    }

    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        city: r.city ?? '',
        whatsappPhone: r.whatsappPhone,
        whatsappVerified: r.whatsappVerified,
        emailVerified: r.emailVerified,
        status: r.portalWorkerStatus ?? PortalWorkerStatus.PENDING_APPROVAL,
        registeredAt: r.createdAt.toISOString(),
        referredClientCount: r._count.portalWorkerClients,
        clientsTurnover: turnoverByWorker.get(r.id) ?? 0,
        totalCommission: commissionMap.get(r.id) ?? 0,
        approvedAt: r.portalWorkerApprovedAt?.toISOString() ?? null,
        rejectedAt: r.portalWorkerRejectedAt?.toISOString() ?? null,
        suspendedAt: r.portalWorkerSuspendedAt?.toISOString() ?? null,
        maxBonusPerClient: r.workerProfile?.maxBonusPerClient ?? 3000,
        commissionPercent: r.workerProfile?.commissionPercent ?? null,
        adminNotes: r.workerProfile?.adminNotes ?? null,
      })),
      total: rows.length,
    };
  }

  async setWorkerStatus(workerId: string, action: 'approve' | 'reject' | 'suspend' | 'activate') {
    const user = await this.prisma.user.findUnique({
      where: { id: workerId },
      select: { id: true, role: true },
    });
    if (!user || user.role !== UserRole.PORTAL_WORKER) {
      throw new NotFoundException('Pracovník portálu nenalezen.');
    }
    const now = new Date();
    const data: Record<string, unknown> = {};
    switch (action) {
      case 'approve':
        data.portalWorkerStatus = PortalWorkerStatus.APPROVED;
        data.portalWorkerApprovedAt = now;
        data.portalWorkerRejectedAt = null;
        data.portalWorkerSuspendedAt = null;
        break;
      case 'reject':
        data.portalWorkerStatus = PortalWorkerStatus.REJECTED;
        data.portalWorkerRejectedAt = now;
        break;
      case 'suspend':
        data.portalWorkerStatus = PortalWorkerStatus.SUSPENDED;
        data.portalWorkerSuspendedAt = now;
        break;
      case 'activate':
        data.portalWorkerStatus = PortalWorkerStatus.APPROVED;
        data.portalWorkerApprovedAt = now;
        data.portalWorkerSuspendedAt = null;
        break;
      default:
        throw new BadRequestException('Neznámá akce.');
    }
    await this.prisma.user.update({ where: { id: workerId }, data });
    return { ok: true, status: data.portalWorkerStatus };
  }

  async getWorkerDashboard(workerId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: workerId },
      select: {
        id: true,
        role: true,
        portalWorkerStatus: true,
        emailVerified: true,
        whatsappVerified: true,
      },
    });
    if (!user || user.role !== UserRole.PORTAL_WORKER) {
      throw new NotFoundException('Pracovník portálu nenalezen.');
    }
    if (user.portalWorkerStatus === PortalWorkerStatus.SUSPENDED) {
      throw new ForbiddenException('Účet pracovníka byl pozastaven administrátorem.');
    }
    if (
      user.portalWorkerStatus === PortalWorkerStatus.PENDING_APPROVAL ||
      user.portalWorkerStatus === PortalWorkerStatus.REJECTED
    ) {
      throw new ForbiddenException('Účet pracovníka čeká na schválení administrátorem.');
    }

    const isActive = this.isActivePortalWorker(user);
    const [clients, commissions, preregistrations] = await Promise.all([
      isActive
        ? this.prisma.user.findMany({
            where: { portalWorkerId: workerId },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              createdAt: true,
              emailVerified: true,
              whatsappVerified: true,
              realCreditBalance: true,
            },
          })
        : Promise.resolve([] as Array<{
            id: string;
            name: string;
            email: string;
            role: UserRole;
            createdAt: Date;
            emailVerified: boolean;
            whatsappVerified: boolean;
            realCreditBalance: number;
          }>),
      isActive
        ? this.prisma.workerCommission.findMany({
            where: { workerId },
            orderBy: { createdAt: 'desc' },
            take: 100,
            include: {
              referredUser: { select: { id: true, name: true, email: true, role: true } },
              creditTopUp: { select: { amount: true, confirmedAt: true, invoiceNumber: true } },
            },
          })
        : Promise.resolve([] as Array<{
            id: string;
            status: WorkerCommissionStatus;
            referredUserId: string;
            commissionAmount: number;
            amount: number;
            percent: number;
            createdAt: Date;
            paidAt: Date | null;
            referredUser: { id: string; name: string; email: string; role: UserRole };
            creditTopUp: { amount: number; confirmedAt: Date | null; invoiceNumber: string | null };
          }>),
      this.prisma.clientPreregistration.findMany({
        where: { workerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          name: true,
          email: true,
          targetRole: true,
          status: true,
          createdAt: true,
          tokenExpiresAt: true,
        },
      }),
    ]);

    const topUpSums =
      clients.length > 0
        ? await this.prisma.creditTopUpTransaction.groupBy({
            by: ['userId'],
            where: {
              userId: { in: clients.map((c) => c.id) },
              status: 'CONFIRMED',
            },
            _sum: { amount: true },
          })
        : [];
    const topUpMap = new Map(topUpSums.map((t) => [t.userId, t._sum.amount ?? 0]));

    const pending = commissions
      .filter((c) => c.status === WorkerCommissionStatus.PENDING)
      .reduce((s, c) => s + c.commissionAmount, 0);
    const approved = commissions
      .filter((c) => c.status === WorkerCommissionStatus.APPROVED)
      .reduce((s, c) => s + c.commissionAmount, 0);
    const paid = commissions
      .filter((c) => c.status === WorkerCommissionStatus.PAID)
      .reduce((s, c) => s + c.commissionAmount, 0);

    return {
      isActive,
      clientCount: clients.length,
      totalCommission: commissions.reduce((s, c) => s + c.commissionAmount, 0),
      pendingCommission: pending,
      approvedCommission: approved,
      paidCommission: paid,
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        role: c.role,
        registeredAt: c.createdAt.toISOString(),
        status:
          c.emailVerified && c.whatsappVerified
            ? 'ACTIVE'
            : c.emailVerified
              ? 'EMAIL_VERIFIED'
              : 'PENDING',
        totalTopUp: topUpMap.get(c.id) ?? 0,
        totalCommission: commissions
          .filter((x) => x.referredUserId === c.id)
          .reduce((s, x) => s + x.commissionAmount, 0),
      })),
      commissions: commissions.map((c) => ({
        id: c.id,
        referredUserId: c.referredUserId,
        referredUserName: c.referredUser.name,
        referredUserRole: c.referredUser.role,
        topUpAmount: c.amount,
        percent: c.percent,
        commissionAmount: c.commissionAmount,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
        paidAt: c.paidAt?.toISOString() ?? null,
        invoiceNumber: c.creditTopUp.invoiceNumber,
      })),
      preregistrations: preregistrations.map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        targetRole: p.targetRole,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        expiresAt: p.tokenExpiresAt.toISOString(),
      })),
    };
  }

  async createClientPreregistration(workerId: string, dto: CreateClientPreregistrationDto) {
    await this.requireActiveWorker(workerId);
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new BadRequestException('Uživatel s tímto e-mailem již existuje.');

    const pending = await this.prisma.clientPreregistration.findFirst({
      where: { email, status: ClientPreregistrationStatus.PENDING },
    });
    if (pending) throw new BadRequestException('Pro tento e-mail už existuje čekající předregistrace.');

    if (!WORKER_CLIENT_ROLES.includes(dto.targetRole as UserRole)) {
      throw new BadRequestException('Neplatná role klienta.');
    }

    const token = randomBytes(32).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const row = await this.prisma.clientPreregistration.create({
      data: {
        workerId,
        targetRole: dto.targetRole as UserRole,
        name: dto.name.trim(),
        firstName: dto.firstName?.trim() ?? '',
        lastName: dto.lastName?.trim() ?? '',
        company: dto.company?.trim() ?? '',
        email,
        phone: dto.phone.trim(),
        whatsappPhone: (dto.whatsappPhone ?? dto.phone).trim(),
        ico: dto.ico?.trim() ?? '',
        city: dto.city?.trim() ?? '',
        note: dto.note?.trim() || null,
        completionToken: token,
        tokenExpiresAt,
        lastActivityAt: new Date(),
      },
    });

    const completionUrl = `${resolveFrontendUrl(this.config)}/dokoncit-registraci-pracovnik?token=${encodeURIComponent(token)}`;
    await this.emails.sendWorkerClientInvitationEmail({
      email,
      clientName: row.name,
      completionUrl,
    });

    return {
      id: row.id,
      email: row.email,
      status: row.status,
      completionUrl,
      message: 'Předregistrace vytvořena a e-mail odeslán.',
    };
  }

  async getPreregistrationByToken(token: string) {
    const row = await this.prisma.clientPreregistration.findUnique({
      where: { completionToken: token },
      include: { worker: { select: { name: true } } },
    });
    if (!row) throw new NotFoundException('Odkaz není platný.');
    if (row.status === ClientPreregistrationStatus.COMPLETED) {
      throw new BadRequestException('Registrace už byla dokončena.');
    }
    if (row.tokenExpiresAt.getTime() < Date.now()) {
      await this.prisma.clientPreregistration.update({
        where: { id: row.id },
        data: { status: ClientPreregistrationStatus.EXPIRED },
      });
      throw new BadRequestException('Odkaz vypršel.');
    }
    return {
      name: row.name,
      email: row.email,
      phone: row.phone,
      city: row.city,
      targetRole: row.targetRole,
      workerName: row.worker.name,
      note: row.note,
    };
  }

  async completePreregistration(token: string, password: string, name?: string) {
    const row = await this.prisma.clientPreregistration.findUnique({
      where: { completionToken: token },
    });
    if (!row) throw new NotFoundException('Odkaz není platný.');
    if (row.status !== ClientPreregistrationStatus.PENDING) {
      throw new BadRequestException('Předregistrace už není aktivní.');
    }
    if (row.tokenExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Odkaz vypršel.');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: row.email } });
    if (existing) throw new BadRequestException('Účet s tímto e-mailem už existuje.');

    const hashed = await bcrypt.hash(password, 10);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: row.email,
          password: hashed,
          name: name?.trim() || row.name,
          phone: row.phone,
          phonePublic: false,
          role: row.targetRole,
          portalWorkerId: row.workerId,
          city: row.city,
          emailVerified: false,
          phoneVerified: false,
        },
      });
      await tx.clientPreregistration.update({
        where: { id: row.id },
        data: {
          status: ClientPreregistrationStatus.COMPLETED,
          completedUserId: created.id,
          lastActivityAt: new Date(),
        },
      });
      await tx.workerClientAuditLog.create({
        data: {
          workerId: row.workerId,
          actorUserId: created.id,
          preregistrationId: row.id,
          clientUserId: created.id,
          action: WorkerClientAuditAction.REGISTRATION_COMPLETED,
        },
      });
      return created;
    });

    return {
      ok: true,
      userId: user.id,
      email: user.email,
      message: 'Účet byl vytvořen. Ověřte e-mail a dokončete profil.',
    };
  }

  async processCommissionForTopUp(referredUserId: string, creditTopUpId: string, amount: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: referredUserId },
      select: { portalWorkerId: true, role: true, createdAt: true },
    });
    if (!user?.portalWorkerId) return null;

    const settings = await this.getCommissionSettings();
    const paidAmount = Math.max(0, Math.trunc(amount));
    if (paidAmount < settings.minTopUpAmount) return null;

    const roleRate = await this.prisma.workerCommissionRoleRate.findUnique({
      where: { role: user.role },
    });
    if (!roleRate) return null;

    const validityMs = settings.validityDays * 24 * 60 * 60 * 1000;
    if (Date.now() - user.createdAt.getTime() > validityMs) return null;

    const existing = await this.prisma.workerCommission.findUnique({
      where: { creditTopUpId },
    });
    if (existing) return existing;

    const percent = roleRate.percent;
    const fixedAmount = roleRate.fixedAmount ?? 0;
    const commissionAmount = Math.floor((paidAmount * percent) / 100) + fixedAmount;
    if (commissionAmount <= 0) return null;

    return this.prisma.workerCommission.create({
      data: {
        workerId: user.portalWorkerId,
        referredUserId,
        creditTopUpId,
        amount: paidAmount,
        percent,
        commissionAmount,
        status: WorkerCommissionStatus.PENDING,
      },
    });
  }

  async getCommissionSettings() {
    const row = await this.prisma.workerCommissionSetting.findUnique({
      where: { id: 'default' },
    });
    const roleRates = await this.prisma.workerCommissionRoleRate.findMany();
    return {
      defaultPercent: row?.defaultPercent ?? 10,
      defaultFixedAmount: row?.defaultFixedAmount ?? 0,
      minTopUpAmount: row?.minTopUpAmount ?? 300,
      validityDays: row?.validityDays ?? 365,
      roleRates: roleRates.map((r) => ({
        role: r.role,
        percent: r.percent,
        fixedAmount: r.fixedAmount ?? 0,
      })),
    };
  }

  async updateCommissionSettings(dto: UpdateWorkerCommissionSettingsDto) {
    await this.prisma.workerCommissionSetting.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        defaultPercent: dto.defaultPercent ?? 10,
        defaultFixedAmount: dto.defaultFixedAmount ?? 0,
        minTopUpAmount: dto.minTopUpAmount ?? 300,
        validityDays: dto.validityDays ?? 365,
      },
      update: {
        ...(dto.defaultPercent !== undefined ? { defaultPercent: dto.defaultPercent } : {}),
        ...(dto.defaultFixedAmount !== undefined
          ? { defaultFixedAmount: dto.defaultFixedAmount }
          : {}),
        ...(dto.minTopUpAmount !== undefined ? { minTopUpAmount: dto.minTopUpAmount } : {}),
        ...(dto.validityDays !== undefined ? { validityDays: dto.validityDays } : {}),
      },
    });
    if (dto.roleRates?.length) {
      for (const rr of dto.roleRates) {
        await this.prisma.workerCommissionRoleRate.upsert({
          where: { role: rr.role as UserRole },
          create: {
            role: rr.role as UserRole,
            percent: rr.percent,
            fixedAmount: rr.fixedAmount ?? 0,
          },
          update: {
            percent: rr.percent,
            ...(rr.fixedAmount !== undefined ? { fixedAmount: rr.fixedAmount } : {}),
          },
        });
      }
    }
    return this.getCommissionSettings();
  }

  async listCommissionsForAdmin(params: { workerId?: string; status?: string }) {
    const rows = await this.prisma.workerCommission.findMany({
      where: {
        ...(params.workerId ? { workerId: params.workerId } : {}),
        ...(params.status ? { status: params.status as WorkerCommissionStatus } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        worker: { select: { id: true, name: true, email: true } },
        referredUser: { select: { id: true, name: true, email: true, role: true } },
        creditTopUp: { select: { invoiceNumber: true, confirmedAt: true } },
      },
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        workerId: r.workerId,
        workerName: r.worker.name,
        workerEmail: r.worker.email,
        referredUserId: r.referredUserId,
        referredUserName: r.referredUser.name,
        referredUserRole: r.referredUser.role,
        amount: r.amount,
        percent: r.percent,
        commissionAmount: r.commissionAmount,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        paidAt: r.paidAt?.toISOString() ?? null,
        invoiceNumber: r.creditTopUp.invoiceNumber,
        confirmedAt: r.creditTopUp.confirmedAt?.toISOString() ?? null,
      })),
      total: rows.length,
    };
  }

  async markCommissionPaid(commissionId: string) {
    const row = await this.prisma.workerCommission.update({
      where: { id: commissionId },
      data: { status: WorkerCommissionStatus.PAID, paidAt: new Date() },
    });
    return { ok: true, id: row.id, status: row.status };
  }

  async exportCommissionsCsv(params: { workerId?: string; status?: string }) {
    const { items } = await this.listCommissionsForAdmin(params);
    const header =
      'id,worker,client,role,topup_amount,percent,commission,status,created_at,paid_at\n';
    const lines = items.map(
      (r) =>
        `${r.id},"${r.workerName}","${r.referredUserName}",${r.referredUserRole},${r.amount},${r.percent},${r.commissionAmount},${r.status},${r.createdAt},${r.paidAt ?? ''}`,
    );
    return header + lines.join('\n');
  }
}
