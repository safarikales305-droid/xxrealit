import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ClientPreregistrationStatus,
  UserRole,
  WorkerClientAuditAction,
  WorkerClientNoteType,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { resolveFrontendUrl } from '../../common/resolve-frontend-url';
import { PrismaService } from '../../database/prisma.service';
import { CreditWalletService } from '../credits/credit-wallet.service';
import { EmailsService } from '../emails/emails.service';
import { WhatsAppMarketingService } from '../whatsapp/whatsapp-marketing.service';
import type {
  AddWorkerClientNoteDto,
  CreateWorkerClientDto,
  GrantWorkerBonusDto,
  UpdateWorkerProfileAdminDto,
  UpdateWorkerSelfSettingsDto,
  WorkerCrmMessageDto,
} from './dto/worker-crm.dto';
import { PortalWorkerService } from './portal-worker.service';

const WORKER_CLIENT_ROLES: UserRole[] = [
  UserRole.AGENT,
  UserRole.AGENCY,
  UserRole.COMPANY,
  UserRole.INVESTOR,
  UserRole.FINANCIAL_ADVISOR,
  UserRole.PRIVATE_SELLER,
];

const ROLE_LABELS: Record<string, string> = {
  AGENT: 'Makléř',
  AGENCY: 'Realitní kancelář',
  COMPANY: 'Stavební firma',
  INVESTOR: 'Investor',
  FINANCIAL_ADVISOR: 'Finanční poradce',
  PRIVATE_SELLER: 'Soukromý inzerent',
};

@Injectable()
export class PortalWorkerCrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portalWorker: PortalWorkerService,
    private readonly emails: EmailsService,
    private readonly whatsapp: WhatsAppMarketingService,
    private readonly creditWallet: CreditWalletService,
    private readonly config: ConfigService,
  ) {}

  async ensureWorkerProfile(userId: string) {
    return this.prisma.workerProfile.upsert({
      where: { userId },
      create: { userId, maxBonusPerClient: 3000 },
      update: {},
    });
  }

  async getWorkerProfile(userId: string) {
    return this.ensureWorkerProfile(userId);
  }

  async updateWorkerProfileAdmin(workerId: string, dto: UpdateWorkerProfileAdminDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: workerId },
      select: { id: true, role: true },
    });
    if (!user || user.role !== UserRole.PORTAL_WORKER) {
      throw new NotFoundException('Pracovník portálu nenalezen.');
    }

    await this.ensureWorkerProfile(workerId);

    const userData: Record<string, unknown> = {};
    if (dto.phone !== undefined) userData.phone = dto.phone.trim();
    if (dto.whatsappPhone !== undefined) userData.whatsappPhone = dto.whatsappPhone.trim();
    if (dto.avatarUrl !== undefined) userData.avatar = dto.avatarUrl?.trim() || null;
    if (dto.emailVerified !== undefined) {
      userData.emailVerified = dto.emailVerified;
      userData.emailVerifiedAt = dto.emailVerified ? new Date() : null;
    }
    if (dto.phoneVerified !== undefined) {
      userData.phoneVerified = dto.phoneVerified;
    }
    if (dto.whatsappVerified !== undefined) {
      userData.whatsappVerified = dto.whatsappVerified;
      userData.whatsappVerifiedAt = dto.whatsappVerified ? new Date() : null;
    }

    if (Object.keys(userData).length > 0) {
      await this.prisma.user.update({ where: { id: workerId }, data: userData });
    }

    const profile = await this.prisma.workerProfile.update({
      where: { userId: workerId },
      data: {
        ...(dto.commissionPercent !== undefined
          ? { commissionPercent: dto.commissionPercent }
          : {}),
        ...(dto.maxBonusPerClient !== undefined
          ? { maxBonusPerClient: dto.maxBonusPerClient }
          : {}),
        ...(dto.canAssignBonusCredits !== undefined
          ? { canAssignBonusCredits: dto.canAssignBonusCredits }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.adminNotes !== undefined ? { adminNotes: dto.adminNotes } : {}),
      },
    });

    return this.getWorkerDetailAdmin(workerId);
  }

  async getWorkerDetailAdmin(workerId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: workerId },
      include: {
        workerProfile: true,
        _count: { select: { portalWorkerClients: true } },
      },
    });
    if (!user || user.role !== UserRole.PORTAL_WORKER) {
      throw new NotFoundException('Pracovník portálu nenalezen.');
    }

    const profile = user.workerProfile ?? (await this.ensureWorkerProfile(workerId));
    const clientIds = (
      await this.prisma.user.findMany({
        where: { portalWorkerId: workerId },
        select: { id: true },
      })
    ).map((c) => c.id);

    const [topUpSum, commissionSum] = await Promise.all([
      clientIds.length
        ? this.prisma.creditTopUpTransaction.aggregate({
            where: { userId: { in: clientIds }, status: 'CONFIRMED' },
            _sum: { amount: true },
          })
        : { _sum: { amount: 0 } },
      this.prisma.workerCommission.aggregate({
        where: { workerId },
        _sum: { commissionAmount: true },
      }),
    ]);

    const paidTopUp = topUpSum._sum.amount ?? 0;
    const percent = profile.commissionPercent ?? 10;
    const estimatedCommission = Math.floor((paidTopUp * percent) / 100);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      whatsappPhone: user.whatsappPhone,
      avatarUrl: user.avatar,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      whatsappVerified: user.whatsappVerified,
      portalWorkerStatus: user.portalWorkerStatus,
      clientCount: user._count.portalWorkerClients,
      clientsPaidTopUp: paidTopUp,
      totalCommissionRecorded: commissionSum._sum.commissionAmount ?? 0,
      estimatedCommission,
      profile: {
        commissionPercent: profile.commissionPercent,
        maxBonusPerClient: profile.maxBonusPerClient,
        canAssignBonusCredits: profile.canAssignBonusCredits,
        isActive: profile.isActive,
        adminNotes: profile.adminNotes,
      },
    };
  }

  async listWorkersCommissionOverview() {
    const workers = await this.prisma.user.findMany({
      where: { role: UserRole.PORTAL_WORKER },
      orderBy: { createdAt: 'desc' },
      include: {
        workerProfile: true,
        _count: { select: { portalWorkerClients: true } },
      },
    });

    const items = await Promise.all(
      workers.map(async (w) => {
        const profile = w.workerProfile ?? (await this.ensureWorkerProfile(w.id));
        const clientIds = (
          await this.prisma.user.findMany({
            where: { portalWorkerId: w.id },
            select: { id: true },
          })
        ).map((c) => c.id);

        const [topUpSum, commissionSum] = await Promise.all([
          clientIds.length
            ? this.prisma.creditTopUpTransaction.aggregate({
                where: { userId: { in: clientIds }, status: 'CONFIRMED' },
                _sum: { amount: true },
              })
            : { _sum: { amount: 0 } },
          this.prisma.workerCommission.aggregate({
            where: { workerId: w.id },
            _sum: { commissionAmount: true },
          }),
        ]);

        const paidTopUp = topUpSum._sum.amount ?? 0;
        const percent = profile.commissionPercent ?? 10;

        return {
          id: w.id,
          name: w.name,
          email: w.email,
          status: w.portalWorkerStatus,
          clientCount: w._count.portalWorkerClients,
          clientsPaidTopUp: paidTopUp,
          commissionPercent: profile.commissionPercent,
          maxBonusPerClient: profile.maxBonusPerClient,
          canAssignBonusCredits: profile.canAssignBonusCredits,
          isActive: profile.isActive,
          totalCommission: commissionSum._sum.commissionAmount ?? 0,
          estimatedCommission: Math.floor((paidTopUp * percent) / 100),
        };
      }),
    );

    return { items };
  }

  exportWorkersCommissionCsv() {
    return this.listWorkersCommissionOverview().then(({ items }) => {
      const header =
        'id,name,email,client_count,paid_topup,commission_percent,max_bonus_per_client,can_assign_bonus,is_active,total_commission,estimated_commission\n';
      const lines = items.map(
        (w) =>
          `${w.id},"${w.name}","${w.email}",${w.clientCount},${w.clientsPaidTopUp},${w.commissionPercent ?? ''},${w.maxBonusPerClient},${w.canAssignBonusCredits},${w.isActive},${w.totalCommission},${w.estimatedCommission}`,
      );
      return header + lines.join('\n');
    });
  }

  async updateWorkerSelfSettings(workerId: string, dto: UpdateWorkerSelfSettingsDto) {
    await this.portalWorker.requireActiveWorker(workerId);
    const data: Record<string, string> = {};
    if (dto.phone !== undefined) data.phone = dto.phone.trim();
    if (dto.whatsappPhone !== undefined) data.whatsappPhone = dto.whatsappPhone.trim();
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (Object.keys(data).length === 0) {
      return this.getWorkerSelfSettings(workerId);
    }
    await this.prisma.user.update({ where: { id: workerId }, data });
    return this.getWorkerSelfSettings(workerId);
  }

  async getWorkerSelfSettings(workerId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: workerId },
      include: { workerProfile: true },
    });
    if (!user || user.role !== UserRole.PORTAL_WORKER) {
      throw new NotFoundException('Pracovník nenalezen.');
    }
    const profile = user.workerProfile ?? (await this.ensureWorkerProfile(workerId));
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      whatsappPhone: user.whatsappPhone,
      avatarUrl: user.avatar,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      whatsappVerified: user.whatsappVerified,
      maxBonusPerClient: profile.maxBonusPerClient,
      canAssignBonusCredits: profile.canAssignBonusCredits,
      commissionPercent: profile.commissionPercent,
    };
  }

  private async audit(
    workerId: string,
    actorUserId: string,
    action: WorkerClientAuditAction,
    opts: { preregistrationId?: string; clientUserId?: string; metadata?: object },
  ) {
    await this.prisma.workerClientAuditLog.create({
      data: {
        workerId,
        actorUserId,
        action,
        preregistrationId: opts.preregistrationId ?? null,
        clientUserId: opts.clientUserId ?? null,
        metadata: opts.metadata ?? undefined,
      },
    });
  }

  private completionUrl(token: string): string {
    return `${resolveFrontendUrl(this.config)}/dokoncit-registraci-pracovnik?token=${encodeURIComponent(token)}`;
  }

  async createWorkerClient(workerId: string, dto: CreateWorkerClientDto) {
    await this.portalWorker.requireActiveWorker(workerId);
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new BadRequestException('Uživatel s tímto e-mailem již existuje.');

    const pending = await this.prisma.clientPreregistration.findFirst({
      where: { email, status: ClientPreregistrationStatus.PENDING },
    });
    if (pending) throw new BadRequestException('Pro tento e-mail už existuje zahájená registrace.');

    if (!WORKER_CLIENT_ROLES.includes(dto.targetRole)) {
      throw new BadRequestException('Neplatná role klienta.');
    }

    const firstName = dto.firstName?.trim() ?? '';
    const lastName = dto.lastName?.trim() ?? '';
    const displayName =
      dto.name.trim() ||
      [firstName, lastName].filter(Boolean).join(' ') ||
      dto.company?.trim() ||
      email;

    const token = randomBytes(32).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const whatsappPhone = (dto.whatsappPhone ?? dto.phone).trim();

    const row = await this.prisma.clientPreregistration.create({
      data: {
        workerId,
        targetRole: dto.targetRole,
        name: displayName,
        firstName,
        lastName,
        company: dto.company?.trim() ?? '',
        email,
        phone: dto.phone.trim(),
        whatsappPhone,
        ico: dto.ico?.trim() ?? '',
        city: dto.city?.trim() ?? '',
        note: dto.note?.trim() || null,
        completionToken: token,
        tokenExpiresAt,
        lastActivityAt: new Date(),
      },
    });

    if (dto.note?.trim()) {
      await this.prisma.workerClientNote.create({
        data: {
          workerId,
          preregistrationId: row.id,
          noteType: WorkerClientNoteType.OTHER,
          body: dto.note.trim(),
        },
      });
    }

    await this.audit(workerId, workerId, WorkerClientAuditAction.CLIENT_CREATED, {
      preregistrationId: row.id,
      metadata: { email, targetRole: dto.targetRole },
    });

    return {
      id: row.id,
      email: row.email,
      status: row.status,
      registrationStatus: 'STARTED',
      completionUrl: this.completionUrl(token),
      message: 'Zahájená registrace vytvořena.',
    };
  }

  async listWorkerClients(
    workerId: string,
    query: { q?: string; status?: string },
  ) {
    await this.portalWorker.requireActiveWorker(workerId);

    const preregWhere = {
      workerId,
      ...(query.status ? { status: query.status as ClientPreregistrationStatus } : {}),
      ...(query.q?.trim()
        ? {
            OR: [
              { name: { contains: query.q.trim(), mode: 'insensitive' as const } },
              { email: { contains: query.q.trim(), mode: 'insensitive' as const } },
              { phone: { contains: query.q.trim() } },
              { whatsappPhone: { contains: query.q.trim() } },
              { company: { contains: query.q.trim(), mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [preregs, clients] = await Promise.all([
      this.prisma.clientPreregistration.findMany({
        where: preregWhere,
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
      this.prisma.user.findMany({
        where: {
          portalWorkerId: workerId,
          ...(query.q?.trim()
            ? {
                OR: [
                  { name: { contains: query.q.trim(), mode: 'insensitive' } },
                  { email: { contains: query.q.trim(), mode: 'insensitive' } },
                  { phone: { contains: query.q.trim() } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          whatsappPhone: true,
          role: true,
          emailVerified: true,
          whatsappVerified: true,
          realCreditBalance: true,
          bonusCreditBalance: true,
          createdAt: true,
          profileIco: true,
          city: true,
        },
      }),
    ]);

    const clientIds = clients.map((c) => c.id);
    const [topUps, commissions, bonusLedger] = await Promise.all([
      clientIds.length
        ? this.prisma.creditTopUpTransaction.groupBy({
            by: ['userId'],
            where: { userId: { in: clientIds }, status: 'CONFIRMED' },
            _sum: { amount: true },
          })
        : [],
      clientIds.length
        ? this.prisma.workerCommission.findMany({
            where: { workerId, referredUserId: { in: clientIds } },
          })
        : [],
      clientIds.length
        ? this.prisma.creditLedger.findMany({
            where: {
              userId: { in: clientIds },
              creditType: 'BONUS',
              purpose: { startsWith: 'WORKER_BONUS' },
            },
          })
        : [],
    ]);

    const topUpMap = new Map(topUps.map((t) => [t.userId, t._sum.amount ?? 0]));
    const commissionMap = new Map<string, number>();
    for (const c of commissions) {
      commissionMap.set(
        c.referredUserId,
        (commissionMap.get(c.referredUserId) ?? 0) + c.commissionAmount,
      );
    }

    const preregRows = preregs
      .filter((p) => p.status !== ClientPreregistrationStatus.COMPLETED || !p.completedUserId)
      .map((p) => ({
        kind: 'preregistration' as const,
        id: p.id,
        name: p.name,
        company: p.company,
        role: p.targetRole,
        roleLabel: ROLE_LABELS[p.targetRole] ?? p.targetRole,
        phone: p.phone,
        whatsapp: p.whatsappPhone || p.phone,
        email: p.email,
        registrationStatus: p.status,
        whatsappVerified: false,
        emailVerified: false,
        bonusCredit: 0,
        paidCredit: 0,
        commission: 0,
        createdAt: p.createdAt.toISOString(),
        lastActivityAt: (p.lastActivityAt ?? p.updatedAt).toISOString(),
        clientUserId: p.completedUserId,
      }));

    const clientRows = clients.map((c) => ({
      kind: 'client' as const,
      id: c.id,
      preregistrationId: null as string | null,
      name: c.name,
      company: '',
      role: c.role,
      roleLabel: ROLE_LABELS[c.role] ?? c.role,
      phone: c.phone,
      whatsapp: c.whatsappPhone || c.phone,
      email: c.email,
      registrationStatus: c.emailVerified && c.whatsappVerified ? 'COMPLETED' : 'IN_PROGRESS',
      whatsappVerified: c.whatsappVerified,
      emailVerified: c.emailVerified,
      bonusCredit: c.bonusCreditBalance,
      paidCredit: topUpMap.get(c.id) ?? c.realCreditBalance,
      commission: commissionMap.get(c.id) ?? 0,
      createdAt: c.createdAt.toISOString(),
      lastActivityAt: c.createdAt.toISOString(),
      clientUserId: c.id,
    }));

    return { items: [...preregRows, ...clientRows] };
  }

  async getClientDetail(workerId: string, id: string, kind?: string) {
    await this.portalWorker.requireActiveWorker(workerId);

    if (kind === 'preregistration' || id.startsWith('pre_')) {
      const preregId = id.replace(/^pre_/, '');
      const row = await this.prisma.clientPreregistration.findFirst({
        where: { id: preregId, workerId },
        include: {
          notes: { orderBy: { createdAt: 'desc' } },
          auditLogs: { orderBy: { createdAt: 'desc' }, take: 100 },
        },
      });
      if (!row) throw new NotFoundException('Klient nenalezen.');
      return this.serializePreregDetail(row);
    }

    const user = await this.prisma.user.findFirst({
      where: { id, portalWorkerId: workerId },
    });
    if (!user) {
      const prereg = await this.prisma.clientPreregistration.findFirst({
        where: { id, workerId },
        include: {
          notes: { orderBy: { createdAt: 'desc' } },
          auditLogs: { orderBy: { createdAt: 'desc' }, take: 100 },
        },
      });
      if (prereg) return this.serializePreregDetail(prereg);
      throw new NotFoundException('Klient nenalezen.');
    }

    const [notes, audits, topUps, commissions, ledger, prereg] = await Promise.all([
      this.prisma.workerClientNote.findMany({
        where: { workerId, clientUserId: user.id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.workerClientAuditLog.findMany({
        where: { workerId, clientUserId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.creditTopUpTransaction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.workerCommission.findMany({
        where: { workerId, referredUserId: user.id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.creditLedger.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.clientPreregistration.findFirst({
        where: { completedUserId: user.id, workerId },
      }),
    ]);

    return {
      kind: 'client',
      id: user.id,
      preregistrationId: prereg?.id ?? null,
      profile: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        whatsapp: user.whatsappPhone,
        role: user.role,
        roleLabel: ROLE_LABELS[user.role] ?? user.role,
        city: user.city,
        ico: user.profileIco,
        emailVerified: user.emailVerified,
        whatsappVerified: user.whatsappVerified,
        bonusCredit: user.bonusCreditBalance,
        realCredit: user.realCreditBalance,
        registeredAt: user.createdAt.toISOString(),
      },
      notes,
      timeline: audits,
      topUps,
      commissions,
      creditHistory: ledger,
      completionUrl: prereg ? this.completionUrl(prereg.completionToken) : null,
    };
  }

  private serializePreregDetail(
    row: {
      id: string;
      name: string;
      firstName: string;
      lastName: string;
      company: string;
      email: string;
      phone: string;
      whatsappPhone: string;
      ico: string;
      city: string;
      targetRole: UserRole;
      status: ClientPreregistrationStatus;
      note: string | null;
      createdAt: Date;
      updatedAt: Date;
      lastActivityAt: Date | null;
      lastWhatsappAt: Date | null;
      lastEmailAt: Date | null;
      completionToken: string;
      completedUserId: string | null;
      notes: Array<{
        id: string;
        noteType: WorkerClientNoteType;
        body: string;
        createdAt: Date;
      }>;
      auditLogs: Array<{
        id: string;
        action: WorkerClientAuditAction;
        metadata: unknown;
        createdAt: Date;
      }>;
    },
  ) {
    return {
      kind: 'preregistration',
      id: row.id,
      profile: {
        name: row.name,
        firstName: row.firstName,
        lastName: row.lastName,
        company: row.company,
        email: row.email,
        phone: row.phone,
        whatsapp: row.whatsappPhone || row.phone,
        ico: row.ico,
        city: row.city,
        role: row.targetRole,
        roleLabel: ROLE_LABELS[row.targetRole] ?? row.targetRole,
        registrationStatus: row.status,
        initialNote: row.note,
        createdAt: row.createdAt.toISOString(),
        lastActivityAt: (row.lastActivityAt ?? row.updatedAt).toISOString(),
        lastWhatsappAt: row.lastWhatsappAt?.toISOString() ?? null,
        lastEmailAt: row.lastEmailAt?.toISOString() ?? null,
      },
      notes: row.notes,
      timeline: row.auditLogs,
      completionUrl: this.completionUrl(row.completionToken),
      clientUserId: row.completedUserId,
    };
  }

  async addNote(workerId: string, dto: AddWorkerClientNoteDto) {
    await this.portalWorker.requireActiveWorker(workerId);
    if (!dto.preregistrationId && !dto.clientUserId) {
      throw new BadRequestException('Chybí identifikátor klienta.');
    }
    if (dto.preregistrationId) {
      const p = await this.prisma.clientPreregistration.findFirst({
        where: { id: dto.preregistrationId, workerId },
      });
      if (!p) throw new NotFoundException('Registrace nenalezena.');
    }
    if (dto.clientUserId) {
      const u = await this.prisma.user.findFirst({
        where: { id: dto.clientUserId, portalWorkerId: workerId },
      });
      if (!u) throw new NotFoundException('Klient nenalezen.');
    }

    const note = await this.prisma.workerClientNote.create({
      data: {
        workerId,
        preregistrationId: dto.preregistrationId ?? null,
        clientUserId: dto.clientUserId ?? null,
        noteType: dto.noteType,
        body: dto.body.trim(),
      },
    });

    await this.audit(workerId, workerId, WorkerClientAuditAction.NOTE_ADDED, {
      preregistrationId: dto.preregistrationId,
      clientUserId: dto.clientUserId,
      metadata: { noteType: dto.noteType },
    });

    return note;
  }

  async grantBonus(workerId: string, dto: GrantWorkerBonusDto) {
    await this.portalWorker.requireActiveWorker(workerId);
    const client = await this.prisma.user.findFirst({
      where: { id: dto.clientUserId, portalWorkerId: workerId },
    });
    if (!client) throw new NotFoundException('Klient nenalezen.');

    const profile = await this.ensureWorkerProfile(workerId);
    if (!profile.canAssignBonusCredits) {
      throw new ForbiddenException('Přidělování bonusových kreditů nemáte povoleno administrátorem.');
    }
    if (!profile.isActive) {
      throw new ForbiddenException('Váš pracovní účet není aktivní.');
    }
    const amount = Math.trunc(dto.amount);
    if (amount <= 0) throw new BadRequestException('Neplatná částka.');

    const existingBonus = await this.prisma.creditLedger.aggregate({
      where: {
        userId: client.id,
        creditType: 'BONUS',
        purpose: 'WORKER_BONUS',
        referenceId: workerId,
      },
      _sum: { amount: true },
    });
    const alreadyGranted = existingBonus._sum.amount ?? 0;
    if (alreadyGranted + amount > profile.maxBonusPerClient) {
      throw new BadRequestException(
        `Limit bonusového kreditu na klienta je ${profile.maxBonusPerClient} Kč (zbývá ${Math.max(0, profile.maxBonusPerClient - alreadyGranted)} Kč).`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.creditWallet.creditBonus(
        tx,
        client.id,
        amount,
        workerId,
        dto.description?.trim() || `Bonus od pracovníka portálu`,
        'WORKER_BONUS',
      );
    });

    await this.audit(workerId, workerId, WorkerClientAuditAction.BONUS_GRANTED, {
      clientUserId: client.id,
      metadata: { amount },
    });

    return { ok: true, amount };
  }

  async sendRegistrationEmail(workerId: string, preregistrationId: string) {
    await this.portalWorker.requireActiveWorker(workerId);
    const row = await this.prisma.clientPreregistration.findFirst({
      where: { id: preregistrationId, workerId },
    });
    if (!row) throw new NotFoundException('Registrace nenalezena.');
    if (row.status !== ClientPreregistrationStatus.PENDING) {
      throw new BadRequestException('Registrace už není aktivní.');
    }

    const completionUrl = this.completionUrl(row.completionToken);
    await this.emails.sendWorkerClientInvitationEmail({
      email: row.email,
      clientName: row.name,
      completionUrl,
    });

    await this.prisma.clientPreregistration.update({
      where: { id: row.id },
      data: { lastEmailAt: new Date(), lastActivityAt: new Date() },
    });

    await this.audit(workerId, workerId, WorkerClientAuditAction.EMAIL_SENT, {
      preregistrationId: row.id,
      metadata: { type: 'invite' },
    });

    return { ok: true, message: 'E-mail odeslán.' };
  }

  async sendWhatsAppAction(workerId: string, dto: WorkerCrmMessageDto) {
    await this.portalWorker.requireActiveWorker(workerId);
    const row = await this.prisma.clientPreregistration.findFirst({
      where: { id: dto.preregistrationId, workerId },
    });
    if (!row) throw new NotFoundException('Registrace nenalezena.');

    const phone = (row.whatsappPhone || row.phone).trim();
    if (!phone) throw new BadRequestException('Chybí telefon/WhatsApp.');

    const odkaz = this.completionUrl(row.completionToken);
    const result = await this.whatsapp.sendWorkerCrmTemplate({
      phone,
      templateKey: dto.action,
      vars: { jmeno: row.firstName || row.name, odkaz },
    });

    if (!result.ok) {
      throw new BadRequestException(result.error ?? 'WhatsApp se nepodařilo odeslat.');
    }

    await this.prisma.clientPreregistration.update({
      where: { id: row.id },
      data: { lastWhatsappAt: new Date(), lastActivityAt: new Date() },
    });

    await this.audit(workerId, workerId, WorkerClientAuditAction.WHATSAPP_SENT, {
      preregistrationId: row.id,
      metadata: { action: dto.action },
    });

    return { ok: true, message: 'WhatsApp zpráva odeslána.' };
  }

  async getCrmOverview(workerId: string) {
    const dash = await this.portalWorker.getWorkerDashboard(workerId);
    const profile = await this.ensureWorkerProfile(workerId);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [todayNotes, pendingRegs, needsContact, totalBonus] = await Promise.all([
      this.prisma.workerClientNote.count({
        where: {
          workerId,
          createdAt: { gte: todayStart },
          noteType: { in: [WorkerClientNoteType.PHONE_CALL, WorkerClientNoteType.WHATSAPP] },
        },
      }),
      this.prisma.clientPreregistration.count({
        where: { workerId, status: ClientPreregistrationStatus.PENDING },
      }),
      this.prisma.clientPreregistration.count({
        where: { workerId, status: ClientPreregistrationStatus.NEEDS_CONTACT },
      }),
      this.prisma.creditLedger.aggregate({
        where: {
          creditType: 'BONUS',
          purpose: 'WORKER_BONUS',
          referenceId: workerId,
        },
        _sum: { amount: true },
      }),
    ]);

    const completedRegs = dash.preregistrations?.filter((p) => p.status === 'COMPLETED').length ?? 0;
    const paidCredit =
      dash.clients?.reduce((s, c) => s + c.totalTopUp, 0) ?? 0;

    return {
      ...dash,
      maxBonusPerClient: profile.maxBonusPerClient,
      commissionPercent: profile.commissionPercent,
      cards: {
        clientCount: dash.clientCount,
        newRegistrations: pendingRegs,
        completedRegistrations: completedRegs,
        pendingRegistrations: pendingRegs,
        needsContact,
        bonusCreditsGranted: totalBonus._sum.amount ?? 0,
        paidCredits: paidCredit,
        myCommission: dash.totalCommission,
        todayCalls: todayNotes,
        todayWhatsapp: 0,
      },
    };
  }

  async listAllClientsAdmin(query: {
    workerId?: string;
    status?: string;
    q?: string;
  }) {
    const where = {
      ...(query.workerId ? { workerId: query.workerId } : {}),
      ...(query.status ? { status: query.status as ClientPreregistrationStatus } : {}),
      ...(query.q?.trim()
        ? {
            OR: [
              { name: { contains: query.q.trim(), mode: 'insensitive' as const } },
              { email: { contains: query.q.trim(), mode: 'insensitive' as const } },
              { phone: { contains: query.q.trim() } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.clientPreregistration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        worker: { select: { id: true, name: true, email: true } },
      },
    });

    return {
      items: rows.map((r) => ({
        id: r.id,
        workerId: r.workerId,
        workerName: r.worker.name,
        name: r.name,
        company: r.company,
        email: r.email,
        phone: r.phone,
        whatsapp: r.whatsappPhone,
        targetRole: r.targetRole,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        completedUserId: r.completedUserId,
      })),
    };
  }

  async processRegistrationReminders() {
    const now = Date.now();
    const h24 = 24 * 60 * 60 * 1000;
    const h72 = 72 * 60 * 60 * 1000;

    const pending = await this.prisma.clientPreregistration.findMany({
      where: { status: ClientPreregistrationStatus.PENDING },
      take: 100,
    });

    for (const row of pending) {
      const age = now - row.createdAt.getTime();
      if (age >= h72 && !row.reminder72hSentAt) {
        const phone = (row.whatsappPhone || row.phone).trim();
        if (phone) {
          await this.whatsapp.sendWorkerCrmTemplate({
            phone,
            templateKey: 'reminder',
            vars: { jmeno: row.firstName || row.name, odkaz: this.completionUrl(row.completionToken) },
          });
        }
        await this.prisma.clientPreregistration.update({
          where: { id: row.id },
          data: {
            reminder72hSentAt: new Date(),
            status: ClientPreregistrationStatus.NEEDS_CONTACT,
            lastActivityAt: new Date(),
          },
        });
        await this.audit(row.workerId, row.workerId, WorkerClientAuditAction.REMINDER_SENT, {
          preregistrationId: row.id,
          metadata: { stage: '72h' },
        });
      } else if (age >= h24 && !row.reminder24hSentAt) {
        const phone = (row.whatsappPhone || row.phone).trim();
        if (phone) {
          await this.whatsapp.sendWorkerCrmTemplate({
            phone,
            templateKey: 'reminder',
            vars: { jmeno: row.firstName || row.name, odkaz: this.completionUrl(row.completionToken) },
          });
        }
        await this.prisma.clientPreregistration.update({
          where: { id: row.id },
          data: { reminder24hSentAt: new Date(), lastActivityAt: new Date() },
        });
        await this.audit(row.workerId, row.workerId, WorkerClientAuditAction.REMINDER_SENT, {
          preregistrationId: row.id,
          metadata: { stage: '24h' },
        });
      }
    }

    return { ok: true };
  }
}
