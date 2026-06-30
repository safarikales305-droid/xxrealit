import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PortalWorkerStatus,
  UserRole,
  WorkerCooperationCancelStatus,
  WorkerInternalMessageSender,
  WorkerRecruitmentTargetType,
} from '@prisma/client';
import { resolveFrontendUrl } from '../../common/resolve-frontend-url';
import { PrismaService } from '../../database/prisma.service';
import { EmailsService } from '../emails/emails.service';
import { PortalWorkerService } from './portal-worker.service';
import { assessWorkerProfileCompleteness } from './portal-worker-profile.utils';
import type {
  ApplyWorkerWorkGuideTemplateDto,
  CreateRecruitmentTargetDto,
  ReplyWorkerInternalMessageDto,
  SaveWorkerBulkTemplateDto,
  SendRecruitmentTargetDto,
  SendWorkerBulkMessageDto,
  SendWorkerInternalMessageDto,
  UpdateRecruitmentTargetDto,
  UpdateWorkerProfileReminderDto,
  UpdateWorkerWorkGuideDto,
  WorkerCooperationCancelDto,
} from './dto/worker-communication.dto';

export const DEFAULT_WORK_GUIDE_STEPS = [
  {
    title: 'Krok 1',
    body: 'Kontaktuj makléře, realitní kanceláře, stavební firmy, investory a finanční poradce.',
  },
  {
    title: 'Krok 2',
    body: 'Pokud budou souhlasit, předzalož jim účet na portálu.',
  },
  {
    title: 'Krok 3',
    body: 'Pokud účet dokončí, uživatel se přiřadí pod tvoji správu.',
  },
  {
    title: 'Krok 4',
    body: 'Můžeš jim nabídnout bonusový kredit do výše limitu, který ti nastavil administrátor.',
  },
  {
    title: 'Krok 5',
    body: 'Vše je hlavně o komunikaci a vysvětlení výhod portálu.',
  },
  {
    title: 'Krok 6',
    body: 'Nabídni jim inzerci zdarma — platí se až za skutečný zájem od zájemce.',
  },
] as const;

export const RECRUITMENT_TARGET_LABELS: Record<WorkerRecruitmentTargetType, string> = {
  AGENT: 'Realitní makléři',
  REAL_ESTATE_AGENCY: 'Realitní kanceláře',
  CONSTRUCTION_COMPANY: 'Stavební firmy',
  INVESTOR: 'Investoři',
  FINANCIAL_ADVISOR: 'Finanční poradci',
  CRAFTSMAN: 'Řemeslníci',
  TIPSTER: 'Tipaři',
  PRIVATE_SELLER: 'Majitelé nemovitostí',
  DEVELOPER: 'Developeři',
};

const DEFAULT_RECRUITMENT_SCENARIOS: Record<WorkerRecruitmentTargetType, string[]> = {
  AGENT: [
    'oslovit',
    'vysvětlit inzerci zdarma',
    'ukázat placení až za zájem',
    'nabídnout bonusový kredit',
    'založit účet',
  ],
  REAL_ESTATE_AGENCY: [
    'oslovit kancelář',
    'vysvětlit inzerci zdarma',
    'nabídnout bonusový kredit',
    'založit účet pro tým',
  ],
  CONSTRUCTION_COMPANY: [
    'nabídnout prezentaci u pozemků',
    'nabídnout profil firmy',
    'nabídnout propojení s investory',
    'nabídnout možnost reklamy',
  ],
  INVESTOR: [
    'nabídnout přístup k tipům',
    'nabídnout sledování zajímavých příležitostí',
    'nabídnout kontakt na prodávající',
  ],
  FINANCIAL_ADVISOR: [
    'nabídnout viditelnost u zájemců o hypotéku',
    'nabídnout možnost profilu a kontaktování',
  ],
  CRAFTSMAN: ['nabídnout profil řemeslníka', 'nabídnout viditelnost u stavebních projektů'],
  TIPSTER: ['vysvětlit systém tipů', 'nabídnout registraci tipaře'],
  PRIVATE_SELLER: [
    'vysvětlit inzerci zdarma',
    'ukázat placení až za zájem',
    'pomoci se založením účtu',
  ],
  DEVELOPER: [
    'nabídnout prezentaci projektů',
    'nabídnout propojení s investory',
    'nabídnout reklamní možnosti',
  ],
};

const RECRUITMENT_TARGET_ORDER: WorkerRecruitmentTargetType[] = [
  WorkerRecruitmentTargetType.AGENT,
  WorkerRecruitmentTargetType.REAL_ESTATE_AGENCY,
  WorkerRecruitmentTargetType.CONSTRUCTION_COMPANY,
  WorkerRecruitmentTargetType.DEVELOPER,
  WorkerRecruitmentTargetType.INVESTOR,
  WorkerRecruitmentTargetType.FINANCIAL_ADVISOR,
  WorkerRecruitmentTargetType.PRIVATE_SELLER,
  WorkerRecruitmentTargetType.TIPSTER,
];

@Injectable()
export class PortalWorkerCommunicationService {
  private readonly logger = new Logger(PortalWorkerCommunicationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailsService,
    private readonly portalWorker: PortalWorkerService,
    private readonly config: ConfigService,
  ) {}

  private frontendUrl(path: string) {
    return `${resolveFrontendUrl(this.config)}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private async getWorkerOrThrow(workerId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: workerId },
      select: {
        id: true,
        role: true,
        name: true,
        email: true,
        portalWorkerStatus: true,
      },
    });
    if (!user || user.role !== UserRole.PORTAL_WORKER) {
      throw new NotFoundException('Pracovník nenalezen.');
    }
    return user;
  }

  async workerBlocksCommunications(workerId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: workerId },
      select: { portalWorkerStatus: true },
    });
    if (user?.portalWorkerStatus === PortalWorkerStatus.COOPERATION_CANCEL_REQUESTED) {
      return true;
    }
    const pending = await this.prisma.workerCooperationCancelRequest.findFirst({
      where: { workerId, status: WorkerCooperationCancelStatus.PENDING },
    });
    return Boolean(pending);
  }

  private serializeMessage(row: {
    id: string;
    body: string;
    senderRole: WorkerInternalMessageSender;
    senderUserId: string;
    readAt: Date | null;
    createdAt: Date;
    sender: { id: string; name: string; role: UserRole };
  }) {
    return {
      id: row.id,
      body: row.body,
      senderRole: row.senderRole,
      senderUserId: row.senderUserId,
      senderName: row.sender.name,
      senderUserRole: row.sender.role,
      read: Boolean(row.readAt),
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listMessagesAdmin(workerId: string) {
    await this.getWorkerOrThrow(workerId);
    const rows = await this.prisma.workerInternalMessage.findMany({
      where: { workerId },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, name: true, role: true } },
      },
    });
    const unreadFromWorker = rows.filter(
      (r) => r.senderRole === WorkerInternalMessageSender.WORKER && !r.readAt,
    ).length;
    return {
      messages: rows.map((r) => this.serializeMessage(r)),
      unreadFromWorker,
    };
  }

  async sendMessageAdmin(adminId: string, workerId: string, dto: SendWorkerInternalMessageDto) {
    await this.getWorkerOrThrow(workerId);
    const body = dto.body.trim();
    if (!body) throw new BadRequestException('Zpráva je prázdná.');

    const msg = await this.prisma.workerInternalMessage.create({
      data: {
        workerId,
        senderRole: WorkerInternalMessageSender.ADMIN,
        senderUserId: adminId,
        body,
      },
      include: { sender: { select: { id: true, name: true, role: true } } },
    });

    const worker = await this.prisma.user.findUnique({
      where: { id: workerId },
      select: { email: true, name: true },
    });
    if (worker?.email?.trim() && !(await this.workerBlocksCommunications(workerId))) {
      try {
        await this.emails.sendWorkerInternalMessageNotificationEmail({
          to: worker.email.trim(),
          workerName: worker.name || 'pracovníku',
          messageUrl: this.frontendUrl('/pracovnik'),
          workerId,
        });
      } catch (e) {
        this.logger.warn(`Worker internal message email failed: ${e instanceof Error ? e.message : e}`);
      }
    }

    return { ok: true, message: this.serializeMessage(msg) };
  }

  async listMessagesWorker(workerId: string) {
    await this.portalWorker.requireActiveWorker(workerId);
    const rows = await this.prisma.workerInternalMessage.findMany({
      where: { workerId },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, name: true, role: true } },
      },
    });
    const unreadFromAdmin = rows.filter(
      (r) => r.senderRole === WorkerInternalMessageSender.ADMIN && !r.readAt,
    ).length;
    return {
      messages: rows.map((r) => this.serializeMessage(r)),
      unreadFromAdmin,
    };
  }

  async replyMessageWorker(workerId: string, dto: ReplyWorkerInternalMessageDto) {
    await this.portalWorker.requireActiveWorker(workerId);
    const body = dto.body.trim();
    if (!body) throw new BadRequestException('Zpráva je prázdná.');

    const msg = await this.prisma.workerInternalMessage.create({
      data: {
        workerId,
        senderRole: WorkerInternalMessageSender.WORKER,
        senderUserId: workerId,
        body,
      },
      include: { sender: { select: { id: true, name: true, role: true } } },
    });

    return { ok: true, message: this.serializeMessage(msg) };
  }

  async markMessagesReadWorker(workerId: string) {
    await this.portalWorker.requireActiveWorker(workerId);
    await this.prisma.workerInternalMessage.updateMany({
      where: {
        workerId,
        senderRole: WorkerInternalMessageSender.ADMIN,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async markMessagesReadAdmin(workerId: string) {
    await this.getWorkerOrThrow(workerId);
    await this.prisma.workerInternalMessage.updateMany({
      where: {
        workerId,
        senderRole: WorkerInternalMessageSender.WORKER,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  private async resolveBulkRecipients(filter: SendWorkerBulkMessageDto['filter']) {
    const where: {
      role: UserRole;
      portalWorkerStatus?: PortalWorkerStatus;
      workerProfile?: { isActive: boolean };
      OR?: Array<{ brokerRegionLabel?: { contains: string; mode: 'insensitive' }; city?: { contains: string; mode: 'insensitive' } }>;
    } = {
      role: UserRole.PORTAL_WORKER,
    };

    if (filter.approvedOnly !== false) {
      where.portalWorkerStatus = PortalWorkerStatus.APPROVED;
    } else if (filter.activeOnly) {
      where.portalWorkerStatus = PortalWorkerStatus.APPROVED;
    }

    if (filter.activeOnly) {
      where.workerProfile = { isActive: true };
    }

    if (filter.region?.trim() || filter.district?.trim()) {
      const or: Array<{ brokerRegionLabel?: { contains: string; mode: 'insensitive' }; city?: { contains: string; mode: 'insensitive' } }> = [];
      if (filter.region?.trim()) {
        or.push({ brokerRegionLabel: { contains: filter.region.trim(), mode: 'insensitive' } });
      }
      if (filter.district?.trim()) {
        or.push({ city: { contains: filter.district.trim(), mode: 'insensitive' } });
      }
      if (or.length) where.OR = or;
    }

    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        portalWorkerStatus: true,
      },
    });

    const eligible: typeof users = [];
    for (const u of users) {
      if (await this.workerBlocksCommunications(u.id)) continue;
      eligible.push(u);
    }
    return eligible;
  }

  async listBulkTemplates() {
    const rows = await this.prisma.workerBulkMessage.findMany({
      where: { isTemplate: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        templateName: true,
        body: true,
        campaignName: true,
        createdAt: true,
      },
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        templateName: r.templateName ?? r.campaignName,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async saveBulkTemplate(adminId: string, dto: SaveWorkerBulkTemplateDto) {
    const row = await this.prisma.workerBulkMessage.create({
      data: {
        campaignName: dto.templateName.trim(),
        templateName: dto.templateName.trim(),
        body: dto.body.trim(),
        isTemplate: true,
        createdById: adminId,
      },
    });
    return { ok: true, template: { id: row.id, templateName: row.templateName, body: row.body } };
  }

  async listBulkHistory() {
    const rows = await this.prisma.workerBulkMessage.findMany({
      where: { isTemplate: false, sentAt: { not: null } },
      orderBy: { sentAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        campaignName: r.campaignName,
        recipientCount: r.recipientCount,
        emailsSent: r.emailsSent,
        emailErrors: r.emailErrors,
        sentAt: r.sentAt?.toISOString() ?? null,
        filter: r.filterJson,
        admin: { id: r.createdBy.id, name: r.createdBy.name, email: r.createdBy.email },
      })),
    };
  }

  async sendBulkMessage(adminId: string, dto: SendWorkerBulkMessageDto) {
    const body = dto.body.trim();
    if (!body) throw new BadRequestException('Zpráva je prázdná.');
    const subject = dto.subject?.trim() || dto.campaignName.trim();
    const chatBody = subject ? `Předmět: ${subject}\n\n${body}` : body;

    const recipients = await this.resolveBulkRecipients(dto.filter);
    if (!recipients.length) {
      throw new BadRequestException('Žádní příjemci neodpovídají filtru.');
    }

    const bulk = await this.prisma.workerBulkMessage.create({
      data: {
        campaignName: dto.campaignName.trim(),
        subject,
        body,
        filterJson: dto.filter as unknown as object,
        isTemplate: false,
        templateName: dto.saveAsTemplate ? dto.templateName?.trim() || dto.campaignName.trim() : null,
        createdById: adminId,
        sentAt: new Date(),
        recipientCount: recipients.length,
      },
    });

    if (dto.saveAsTemplate) {
      await this.prisma.workerBulkMessage.create({
        data: {
          campaignName: dto.templateName?.trim() || dto.campaignName.trim(),
          templateName: dto.templateName?.trim() || dto.campaignName.trim(),
          body,
          isTemplate: true,
          createdById: adminId,
        },
      });
    }

    let emailsSent = 0;
    let emailErrors = 0;

    for (const worker of recipients) {
      const msg = await this.prisma.workerInternalMessage.create({
        data: {
          workerId: worker.id,
          senderRole: WorkerInternalMessageSender.ADMIN,
          senderUserId: adminId,
          body: chatBody,
          bulkMessageId: bulk.id,
        },
      });

      await this.prisma.workerBulkMessageRecipient.create({
        data: {
          bulkMessageId: bulk.id,
          workerId: worker.id,
          internalMessageId: msg.id,
        },
      });

      if (!worker.email?.trim()) {
        emailErrors += 1;
        await this.prisma.workerBulkMessageRecipient.updateMany({
          where: { bulkMessageId: bulk.id, workerId: worker.id },
          data: { emailError: 'Chybí e-mail' },
        });
        continue;
      }

      try {
        await this.emails.sendWorkerBulkMessageNotificationEmail({
          to: worker.email.trim(),
          workerName: worker.name || 'pracovníku',
          messageUrl: this.frontendUrl('/pracovnik/zpravy'),
          workerId: worker.id,
          bulkMessageId: bulk.id,
        });
        emailsSent += 1;
        await this.prisma.workerBulkMessageRecipient.updateMany({
          where: { bulkMessageId: bulk.id, workerId: worker.id },
          data: { emailSent: true },
        });
      } catch (e) {
        emailErrors += 1;
        await this.prisma.workerBulkMessageRecipient.updateMany({
          where: { bulkMessageId: bulk.id, workerId: worker.id },
          data: { emailError: e instanceof Error ? e.message : 'Chyba odeslání' },
        });
      }
    }

    await this.prisma.workerBulkMessage.update({
      where: { id: bulk.id },
      data: { emailsSent, emailErrors },
    });

    return {
      ok: true,
      bulkMessageId: bulk.id,
      recipientCount: recipients.length,
      emailsSent,
      emailErrors,
    };
  }

  async getProfileReminderAdmin(workerId: string) {
    await this.getWorkerOrThrow(workerId);
    const user = await this.prisma.user.findUnique({
      where: { id: workerId },
      select: {
        emailVerified: true,
        phone: true,
        whatsappPhone: true,
        avatar: true,
        firstName: true,
        lastName: true,
        name: true,
        city: true,
        brokerRegionLabel: true,
        termsAccepted: true,
      },
    });
    if (!user) throw new NotFoundException('Pracovník nenalezen.');

    const settings = await this.prisma.workerProfileReminderSettings.findUnique({
      where: { userId: workerId },
    });
    const assessment = assessWorkerProfileCompleteness(user);

    return {
      enabled: settings?.enabled ?? false,
      lastReminderSentAt: settings?.lastReminderSentAt?.toISOString() ?? null,
      remindersSentCount: settings?.remindersSentCount ?? 0,
      profileComplete: assessment.complete,
      missing: assessment.missing,
    };
  }

  async updateProfileReminderAdmin(workerId: string, dto: UpdateWorkerProfileReminderDto) {
    await this.getWorkerOrThrow(workerId);
    const row = await this.prisma.workerProfileReminderSettings.upsert({
      where: { userId: workerId },
      create: { userId: workerId, enabled: dto.enabled },
      update: { enabled: dto.enabled },
    });
    return {
      ok: true,
      enabled: row.enabled,
      lastReminderSentAt: row.lastReminderSentAt?.toISOString() ?? null,
      remindersSentCount: row.remindersSentCount,
    };
  }

  async getProfileCompletionWorker(workerId: string) {
    await this.portalWorker.requireActiveWorker(workerId);
    const user = await this.prisma.user.findUnique({
      where: { id: workerId },
      select: {
        emailVerified: true,
        phone: true,
        whatsappPhone: true,
        avatar: true,
        firstName: true,
        lastName: true,
        name: true,
        city: true,
        brokerRegionLabel: true,
        termsAccepted: true,
      },
    });
    if (!user) throw new NotFoundException('Uživatel nenalezen.');
    return assessWorkerProfileCompleteness(user);
  }

  async processDailyProfileReminders() {
    const settings = await this.prisma.workerProfileReminderSettings.findMany({
      where: { enabled: true },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            portalWorkerStatus: true,
            emailVerified: true,
            phone: true,
            whatsappPhone: true,
            avatar: true,
            firstName: true,
            lastName: true,
            city: true,
            brokerRegionLabel: true,
            termsAccepted: true,
            workerProfile: { select: { isActive: true } },
          },
        },
      },
    });

    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    let sent = 0;

    for (const s of settings) {
      const u = s.user;
      if (u.role !== UserRole.PORTAL_WORKER) continue;
      if (u.portalWorkerStatus !== PortalWorkerStatus.APPROVED) continue;
      if (u.workerProfile && !u.workerProfile.isActive) continue;
      if (await this.workerBlocksCommunications(u.id)) continue;

      const assessment = assessWorkerProfileCompleteness(u);
      if (assessment.complete) continue;

      if (s.lastReminderSentAt && now - s.lastReminderSentAt.getTime() < dayMs) continue;

      if (!u.email?.trim()) continue;

      try {
        await this.emails.sendWorkerProfileCompletionReminderEmail({
          to: u.email.trim(),
          workerName: u.name || 'pracovníku',
          profileUrl: this.frontendUrl('/profil/pracovnik'),
          workerId: u.id,
        });
        await this.prisma.workerProfileReminderSettings.update({
          where: { userId: u.id },
          data: {
            lastReminderSentAt: new Date(),
            remindersSentCount: { increment: 1 },
          },
        });
        sent += 1;
      } catch (e) {
        this.logger.warn(`Profile reminder failed for ${u.id}: ${e instanceof Error ? e.message : e}`);
      }
    }

    return { sent };
  }

  async getCooperationCancelAdmin(workerId: string) {
    await this.getWorkerOrThrow(workerId);
    const row = await this.prisma.workerCooperationCancelRequest.findUnique({
      where: { workerId },
    });
    return {
      request: row
        ? {
            id: row.id,
            status: row.status,
            reason: row.reason,
            requestedAt: row.requestedAt.toISOString(),
            resolvedAt: row.resolvedAt?.toISOString() ?? null,
          }
        : null,
      portalWorkerStatus: (
        await this.prisma.user.findUnique({
          where: { id: workerId },
          select: { portalWorkerStatus: true },
        })
      )?.portalWorkerStatus,
    };
  }

  async listPendingCooperationCancels() {
    const rows = await this.prisma.workerCooperationCancelRequest.findMany({
      where: { status: WorkerCooperationCancelStatus.PENDING },
      orderBy: { requestedAt: 'desc' },
      include: {
        worker: { select: { id: true, name: true, email: true, portalWorkerStatus: true } },
      },
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        workerId: r.workerId,
        workerName: r.worker.name,
        workerEmail: r.worker.email,
        reason: r.reason,
        requestedAt: r.requestedAt.toISOString(),
      })),
    };
  }

  async requestCooperationCancelWorker(workerId: string, dto: WorkerCooperationCancelDto) {
    await this.portalWorker.requireActiveWorker(workerId);

    const existing = await this.prisma.workerCooperationCancelRequest.findUnique({
      where: { workerId },
    });
    if (existing?.status === WorkerCooperationCancelStatus.PENDING) {
      throw new BadRequestException('Žádost o ukončení spolupráce již čeká na vyřízení.');
    }

    const row = await this.prisma.workerCooperationCancelRequest.upsert({
      where: { workerId },
      create: {
        workerId,
        reason: dto.reason?.trim() || null,
        status: WorkerCooperationCancelStatus.PENDING,
        requestedAt: new Date(),
        resolvedAt: null,
        resolvedById: null,
      },
      update: {
        reason: dto.reason?.trim() || null,
        status: WorkerCooperationCancelStatus.PENDING,
        requestedAt: new Date(),
        resolvedAt: null,
        resolvedById: null,
      },
    });

    await this.prisma.user.update({
      where: { id: workerId },
      data: { portalWorkerStatus: PortalWorkerStatus.COOPERATION_CANCEL_REQUESTED },
    });

    const worker = await this.prisma.user.findUnique({
      where: { id: workerId },
      select: { email: true, name: true },
    });
    if (worker?.email?.trim()) {
      try {
        await this.emails.sendWorkerCooperationCancelConfirmationEmail({
          to: worker.email.trim(),
          workerName: worker.name || 'pracovníku',
          workerId,
        });
      } catch {
        /* non-blocking */
      }
    }

    return {
      ok: true,
      request: {
        id: row.id,
        status: row.status,
        reason: row.reason,
        requestedAt: row.requestedAt.toISOString(),
      },
    };
  }

  async confirmCooperationCancelAdmin(adminId: string, workerId: string) {
    await this.getWorkerOrThrow(workerId);
    const row = await this.prisma.workerCooperationCancelRequest.findUnique({
      where: { workerId },
    });
    if (!row || row.status !== WorkerCooperationCancelStatus.PENDING) {
      throw new BadRequestException('Žádná čekající žádost o ukončení spolupráce.');
    }

    await this.prisma.workerCooperationCancelRequest.update({
      where: { workerId },
      data: {
        status: WorkerCooperationCancelStatus.CONFIRMED,
        resolvedAt: new Date(),
        resolvedById: adminId,
      },
    });

    await this.prisma.user.update({
      where: { id: workerId },
      data: {
        portalWorkerStatus: PortalWorkerStatus.SUSPENDED,
      },
    });

    await this.prisma.workerProfile.upsert({
      where: { userId: workerId },
      create: { userId: workerId, isActive: false },
      update: { isActive: false },
    });

    return { ok: true };
  }

  async restoreCooperationAdmin(adminId: string, workerId: string) {
    await this.getWorkerOrThrow(workerId);
    const row = await this.prisma.workerCooperationCancelRequest.findUnique({
      where: { workerId },
    });
    if (!row) throw new BadRequestException('Žádná žádost o ukončení spolupráce.');

    await this.prisma.workerCooperationCancelRequest.update({
      where: { workerId },
      data: {
        status: WorkerCooperationCancelStatus.RESTORED,
        resolvedAt: new Date(),
        resolvedById: adminId,
      },
    });

    await this.prisma.user.update({
      where: { id: workerId },
      data: { portalWorkerStatus: PortalWorkerStatus.APPROVED },
    });

    await this.prisma.workerProfile.upsert({
      where: { userId: workerId },
      create: { userId: workerId, isActive: true },
      update: { isActive: true },
    });

    return { ok: true };
  }

  async getCooperationCancelWorker(workerId: string) {
    const row = await this.prisma.workerCooperationCancelRequest.findUnique({
      where: { workerId },
    });
    return {
      request: row
        ? {
            status: row.status,
            reason: row.reason,
            requestedAt: row.requestedAt.toISOString(),
          }
        : null,
    };
  }

  private async ensureWorkerGuide(workerId: string) {
    let guide = await this.prisma.workerWorkGuide.findFirst({
      where: { workerId, isTemplate: false },
      include: { steps: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!guide) {
      guide = await this.prisma.workerWorkGuide.create({
        data: {
          workerId,
          enabled: false,
          isTemplate: false,
          steps: {
            create: DEFAULT_WORK_GUIDE_STEPS.map((s, i) => ({
              sortOrder: i,
              title: s.title,
              body: s.body,
            })),
          },
        },
        include: { steps: { orderBy: { sortOrder: 'asc' } } },
      });
    }
    return guide;
  }

  private serializeGuide(guide: {
    id: string;
    enabled: boolean;
    templateName: string | null;
    steps: Array<{ id: string; sortOrder: number; title: string; body: string }>;
  }) {
    return {
      id: guide.id,
      enabled: guide.enabled,
      templateName: guide.templateName,
      steps: guide.steps.map((s) => ({
        id: s.id,
        sortOrder: s.sortOrder,
        title: s.title,
        body: s.body,
      })),
    };
  }

  async getWorkGuideAdmin(workerId: string) {
    await this.getWorkerOrThrow(workerId);
    const guide = await this.ensureWorkerGuide(workerId);
    const templates = await this.prisma.workerWorkGuide.findMany({
      where: { isTemplate: true },
      include: { steps: { orderBy: { sortOrder: 'asc' } } },
    });
    return {
      guide: this.serializeGuide(guide),
      templates: templates.map((t) => ({
        id: t.id,
        templateName: t.templateName,
        steps: t.steps.map((s) => ({ id: s.id, sortOrder: s.sortOrder, title: s.title, body: s.body })),
      })),
    };
  }

  async updateWorkGuideAdmin(workerId: string, dto: UpdateWorkerWorkGuideDto) {
    await this.getWorkerOrThrow(workerId);
    const guide = await this.ensureWorkerGuide(workerId);

    await this.prisma.workerWorkGuideStep.deleteMany({ where: { guideId: guide.id } });
    await this.prisma.workerWorkGuide.update({
      where: { id: guide.id },
      data: {
        enabled: dto.enabled,
        steps: {
          create: dto.steps.map((s, i) => ({
            sortOrder: s.sortOrder ?? i,
            title: s.title?.trim() || `Krok ${i + 1}`,
            body: s.body.trim(),
          })),
        },
      },
    });

    if (dto.saveAsTemplate && dto.templateName?.trim()) {
      await this.prisma.workerWorkGuide.create({
        data: {
          isTemplate: true,
          templateName: dto.templateName.trim(),
          enabled: false,
          steps: {
            create: dto.steps.map((s, i) => ({
              sortOrder: s.sortOrder ?? i,
              title: s.title?.trim() || `Krok ${i + 1}`,
              body: s.body.trim(),
            })),
          },
        },
      });
    }

    return this.getWorkGuideAdmin(workerId);
  }

  async applyWorkGuideTemplateAdmin(workerId: string, dto: ApplyWorkerWorkGuideTemplateDto) {
    const template = await this.prisma.workerWorkGuide.findFirst({
      where: { id: dto.templateId, isTemplate: true },
      include: { steps: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!template) throw new NotFoundException('Šablona nenalezena.');

    return this.updateWorkGuideAdmin(workerId, {
      enabled: true,
      steps: template.steps.map((s) => ({
        id: s.id,
        sortOrder: s.sortOrder,
        title: s.title,
        body: s.body,
      })),
    });
  }

  async getWorkGuideWorker(workerId: string) {
    await this.portalWorker.requireActiveWorker(workerId);
    const guide = await this.ensureWorkerGuide(workerId);
    if (!guide.enabled) return { enabled: false, steps: [] as Array<{ sortOrder: number; title: string; body: string }> };
    return {
      enabled: true,
      steps: guide.steps.map((s) => ({
        sortOrder: s.sortOrder,
        title: s.title,
        body: s.body,
      })),
    };
  }

  private serializeRecruitmentTarget(
    r: {
      id: string;
      slug: string;
      targetType: WorkerRecruitmentTargetType | null;
      name: string;
      description: string;
      workerNote: string;
      isActive: boolean;
      sortOrder: number;
      isCustom: boolean;
      scenario: { title: string; stepsJson: unknown } | null;
    },
  ) {
    const label =
      r.name?.trim() ||
      (r.targetType ? RECRUITMENT_TARGET_LABELS[r.targetType] : r.slug);
    return {
      id: r.id,
      slug: r.slug,
      targetType: r.targetType,
      label,
      name: label,
      description: r.description,
      workerNote: r.workerNote,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
      isCustom: r.isCustom,
      title: r.scenario?.title ?? label,
      steps: Array.isArray(r.scenario?.stepsJson)
        ? (r.scenario!.stepsJson as string[])
        : r.targetType
          ? DEFAULT_RECRUITMENT_SCENARIOS[r.targetType]
          : [],
    };
  }

  private async ensureRecruitmentTargets() {
    for (let i = 0; i < RECRUITMENT_TARGET_ORDER.length; i++) {
      const targetType = RECRUITMENT_TARGET_ORDER[i];
      const slug = targetType.toLowerCase();
      const existing = await this.prisma.workerRecruitmentTarget.findFirst({
        where: { OR: [{ targetType }, { slug }] },
        include: { scenario: true },
      });
      if (!existing) {
        await this.prisma.workerRecruitmentTarget.create({
          data: {
            targetType,
            slug,
            name: RECRUITMENT_TARGET_LABELS[targetType],
            isActive: false,
            sortOrder: i,
            isCustom: false,
            scenario: {
              create: {
                title: RECRUITMENT_TARGET_LABELS[targetType],
                stepsJson: DEFAULT_RECRUITMENT_SCENARIOS[targetType],
              },
            },
          },
        });
      } else if (!existing.name?.trim()) {
        await this.prisma.workerRecruitmentTarget.update({
          where: { id: existing.id },
          data: {
            name: RECRUITMENT_TARGET_LABELS[targetType],
            slug: existing.slug || slug,
            targetType: existing.targetType ?? targetType,
          },
        });
      }
    }
  }

  async listRecruitmentTargetsAdmin() {
    await this.ensureRecruitmentTargets();
    const rows = await this.prisma.workerRecruitmentTarget.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { scenario: true },
    });
    return { items: rows.map((r) => this.serializeRecruitmentTarget(r)) };
  }

  async createRecruitmentTargetAdmin(dto: CreateRecruitmentTargetDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Název cíle je povinný.');
    const slug = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const row = await this.prisma.workerRecruitmentTarget.create({
      data: {
        slug,
        name,
        description: dto.description?.trim() ?? '',
        workerNote: dto.workerNote?.trim() ?? '',
        isActive: dto.isActive ?? false,
        sortOrder: dto.sortOrder ?? 100,
        isCustom: true,
        scenario: {
          create: {
            title: name,
            stepsJson: dto.steps ?? [],
          },
        },
      },
      include: { scenario: true },
    });
    return { ok: true, item: this.serializeRecruitmentTarget(row) };
  }

  async updateRecruitmentTargetAdmin(id: string, dto: UpdateRecruitmentTargetDto) {
    await this.ensureRecruitmentTargets();
    const target = await this.prisma.workerRecruitmentTarget.findUnique({
      where: { id },
      include: { scenario: true },
    });
    if (!target) throw new NotFoundException('Náborový cíl nenalezen.');

    await this.prisma.workerRecruitmentTarget.update({
      where: { id },
      data: {
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
        ...(dto.workerNote !== undefined ? { workerNote: dto.workerNote.trim() } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });

    if (dto.steps || dto.title) {
      const title =
        dto.title?.trim() ||
        dto.name?.trim() ||
        target.name ||
        (target.targetType ? RECRUITMENT_TARGET_LABELS[target.targetType] : target.slug);
      await this.prisma.workerRecruitmentScenario.upsert({
        where: { targetId: target.id },
        create: {
          targetId: target.id,
          title,
          stepsJson: dto.steps ?? [],
        },
        update: {
          title,
          ...(dto.steps ? { stepsJson: dto.steps } : {}),
        },
      });
    }

    return this.listRecruitmentTargetsAdmin();
  }

  async deleteRecruitmentTargetAdmin(id: string) {
    const target = await this.prisma.workerRecruitmentTarget.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Náborový cíl nenalezen.');
    if (!target.isCustom) {
      throw new BadRequestException('Výchozí náborové cíle nelze smazat.');
    }
    await this.prisma.workerRecruitmentTarget.delete({ where: { id } });
    return { ok: true };
  }

  async sendRecruitmentTargetToWorkers(
    adminId: string,
    targetId: string,
    dto: SendRecruitmentTargetDto,
  ) {
    const workerIds = [...new Set(dto.workerIds.map((id) => id.trim()).filter(Boolean))];
    if (!workerIds.length) throw new BadRequestException('Vyberte alespoň jednoho pracovníka.');

    const target = await this.prisma.workerRecruitmentTarget.findUnique({
      where: { id: targetId },
      include: { scenario: true },
    });
    if (!target) throw new NotFoundException('Náborový cíl nenalezen.');

    const serialized = this.serializeRecruitmentTarget(target);
    let emailsSent = 0;
    let emailErrors = 0;

    for (const workerId of workerIds) {
      const worker = await this.getWorkerOrThrow(workerId);

      await this.prisma.workerRecruitmentAssignment.upsert({
        where: { targetId_workerId: { targetId, workerId } },
        create: { targetId, workerId, assignedByAdminId: adminId },
        update: { assignedByAdminId: adminId, assignedAt: new Date() },
      });

      const internalBody = [
        `Náborový cíl: ${serialized.name}`,
        serialized.description ? `Popis: ${serialized.description}` : '',
        serialized.workerNote ? `Poznámka: ${serialized.workerNote}` : '',
        serialized.steps.length ? `Scénář:\n${serialized.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      await this.prisma.workerInternalMessage.create({
        data: {
          workerId,
          senderRole: WorkerInternalMessageSender.ADMIN,
          senderUserId: adminId,
          body: internalBody,
        },
      });

      if (worker.email?.trim() && !(await this.workerBlocksCommunications(workerId))) {
        try {
          await this.emails.sendWorkerRecruitmentTargetEmail({
            to: worker.email.trim(),
            workerName: worker.name || 'pracovníku',
            targetName: serialized.name,
            workerId,
            targetId,
          });
          emailsSent += 1;
        } catch (e) {
          emailErrors += 1;
          this.logger.warn(
            `Recruitment target email failed for ${workerId}: ${e instanceof Error ? e.message : e}`,
          );
        }
      }
    }

    await this.prisma.workerRecruitmentDelivery.create({
      data: {
        targetId,
        sentByAdminId: adminId,
        recipientCount: workerIds.length,
        emailsSent,
        emailErrors,
      },
    });

    return { ok: true, recipientCount: workerIds.length, emailsSent, emailErrors };
  }

  async listRecruitmentTargetsWorker(workerId: string) {
    await this.ensureRecruitmentTargets();

    const assignments = await this.prisma.workerRecruitmentAssignment.findMany({
      where: { workerId },
      orderBy: { assignedAt: 'desc' },
      include: { target: { include: { scenario: true } } },
    });

    const assignedItems = assignments.map((a) => this.serializeRecruitmentTarget(a.target));

    const activeGlobals = await this.prisma.workerRecruitmentTarget.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { scenario: true },
    });

    const globalItems = activeGlobals.map((r) => this.serializeRecruitmentTarget(r));
    const seen = new Set<string>();
    const items = [...assignedItems, ...globalItems].filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    return { items };
  }
}
