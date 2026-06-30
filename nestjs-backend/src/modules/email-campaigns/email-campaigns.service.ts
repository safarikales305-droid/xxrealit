import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailCampaignRecipientSource,
  EmailCampaignRecipientStatus,
  EmailCampaignStatus,
  EmailLogStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { EmailsService } from '../emails/emails.service';
import {
  ImportedBrokerContactService,
  type ListImportedBrokerContactsQuery,
} from '../imported-broker-contacts/imported-broker-contact.service';
import {
  buildRecipientVariables,
  renderCampaignContent,
  splitFirstName,
} from './email-campaign-variable.util';
import { DEFAULT_SEQUENCE_STEPS, listCampaignTemplates } from './email-campaign-templates';

export type AudienceConfig = {
  mode: 'selected_ids' | 'filtered' | 'all_imported' | 'portal_roles';
  selectedContactIds?: string[];
  filter?: ListImportedBrokerContactsQuery;
  portalRoles?: UserRole[];
};

type ResolvedRecipient = {
  email: string;
  fullName: string;
  firstName: string;
  company: string;
  phone: string;
  role: string;
  source: EmailCampaignRecipientSource;
  sourceId: string | null;
};

const PORTAL_ROLE_LABELS: Record<string, string> = {
  AGENT: 'Makléř',
  AGENCY: 'Realitní kancelář',
  COMPANY: 'Stavební firma',
  INVESTOR: 'Investor',
  FINANCIAL_ADVISOR: 'Finanční poradce',
  PORTAL_WORKER: 'Pracovník portálu',
  TIPSTER: 'Tipař',
  USER: 'Běžný uživatel',
  PROPERTY_SEEKER: 'Hledám nemovitost',
};

@Injectable()
export class EmailCampaignsService {
  private readonly log = new Logger(EmailCampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailsService,
    private readonly importedBrokers: ImportedBrokerContactService,
    private readonly config: ConfigService,
  ) {}

  getTemplates() {
    return listCampaignTemplates();
  }

  async list() {
    const rows = await this.prisma.emailCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { recipients: true, steps: true, campaignLogs: true } },
      },
    });
    return rows.map((r) => this.serializeCampaignSummary(r));
  }

  async getOne(id: string) {
    const row = await this.prisma.emailCampaign.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
        recipients: { orderBy: { createdAt: 'desc' }, take: 200 },
        _count: { select: { recipients: true, campaignLogs: true } },
      },
    });
    if (!row) throw new NotFoundException('Kampaň nenalezena.');
    return this.serializeCampaignDetail(row);
  }

  async create(
    dto: {
      title: string;
      type?: string;
      senderName?: string;
      minDaysBetweenSends?: number;
      audience?: AudienceConfig;
      templateKey?: string;
      steps?: Array<{
        stepOrder: number;
        name?: string;
        subject: string;
        htmlContent: string;
        textContent?: string;
        delayDays?: number;
        delayHours?: number;
        isActive?: boolean;
      }>;
    },
    createdById?: string,
  ) {
    const title = dto.title?.trim();
    if (!title) throw new BadRequestException('Název kampaně je povinný.');

    const template = dto.templateKey
      ? listCampaignTemplates().find((t) => t.key === dto.templateKey)
      : null;
    const stepsInput =
      dto.steps?.length
        ? dto.steps
        : template
          ? [...template.steps]
          : [...DEFAULT_SEQUENCE_STEPS];

    const first = stepsInput[0];
    const campaign = await this.prisma.emailCampaign.create({
      data: {
        type: dto.type?.trim() || 'broker_outreach',
        title,
        subject: first?.subject ?? '',
        htmlContent: first?.htmlContent ?? '',
        textContent: first?.textContent ?? '',
        templateKey: dto.templateKey ?? null,
        senderName: dto.senderName?.trim() || 'Tým XXrealit',
        minDaysBetweenSends: Math.max(0, dto.minDaysBetweenSends ?? 7),
        audienceJson: dto.audience
          ? (JSON.parse(JSON.stringify(dto.audience)) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        createdById: createdById ?? null,
        status: EmailCampaignStatus.draft,
        steps: {
          create: stepsInput.map((s, idx) => ({
            stepOrder: s.stepOrder ?? idx,
            name: s.name?.trim() || `Krok ${idx + 1}`,
            subject: s.subject,
            htmlContent: s.htmlContent,
            textContent: s.textContent ?? '',
            delayDays: s.delayDays ?? 0,
            delayHours: s.delayHours ?? 0,
            isActive: (s as { isActive?: boolean }).isActive !== false,
          })),
        },
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    return this.serializeCampaignDetail(campaign);
  }

  async update(
    id: string,
    dto: {
      title?: string;
      senderName?: string;
      minDaysBetweenSends?: number;
      audience?: AudienceConfig;
      status?: EmailCampaignStatus;
      steps?: Array<{
        id?: string;
        stepOrder: number;
        name?: string;
        subject: string;
        htmlContent: string;
        textContent?: string;
        delayDays?: number;
        delayHours?: number;
        isActive?: boolean;
      }>;
    },
  ) {
    const existing = await this.prisma.emailCampaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Kampaň nenalezena.');
    if (
      existing.status === EmailCampaignStatus.running &&
      dto.steps
    ) {
      throw new BadRequestException('Běžící kampaň nelze měnit — nejdříve pozastavte.');
    }

    const data: Prisma.EmailCampaignUpdateInput = { updatedAt: new Date() };
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.senderName !== undefined) data.senderName = dto.senderName.trim();
    if (dto.minDaysBetweenSends !== undefined) {
      data.minDaysBetweenSends = Math.max(0, dto.minDaysBetweenSends);
    }
    if (dto.audience !== undefined) {
      data.audienceJson = JSON.parse(JSON.stringify(dto.audience)) as Prisma.InputJsonValue;
    }
    if (dto.status === EmailCampaignStatus.paused) {
      data.status = EmailCampaignStatus.paused;
      data.pausedAt = new Date();
    }

    await this.prisma.emailCampaign.update({ where: { id }, data });

    if (dto.steps) {
      await this.prisma.emailCampaignStep.deleteMany({ where: { campaignId: id } });
      await this.prisma.emailCampaignStep.createMany({
        data: dto.steps.map((s, idx) => ({
          campaignId: id,
          stepOrder: s.stepOrder ?? idx,
          name: s.name?.trim() || `Krok ${idx + 1}`,
          subject: s.subject,
          htmlContent: s.htmlContent,
          textContent: s.textContent ?? '',
          delayDays: s.delayDays ?? 0,
          delayHours: s.delayHours ?? 0,
          isActive: s.isActive !== false,
        })),
      });
      const first = dto.steps[0];
      if (first) {
        await this.prisma.emailCampaign.update({
          where: { id },
          data: { subject: first.subject, htmlContent: first.htmlContent, textContent: first.textContent ?? '' },
        });
      }
    }

    return this.getOne(id);
  }

  async countRecipients(audience: AudienceConfig, minDaysBetweenSends = 7) {
    const resolved = await this.resolveAudience(audience, minDaysBetweenSends);
    return {
      total: resolved.length,
      withEmail: resolved.length,
      deduped: resolved.length,
    };
  }

  async preview(
    campaignId: string,
    opts?: { stepOrder?: number; sampleRecipientId?: string; sampleEmail?: string },
  ) {
    const campaign = await this.prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!campaign) throw new NotFoundException('Kampaň nenalezena.');

    const step =
      campaign.steps.find((s) => s.stepOrder === (opts?.stepOrder ?? 0)) ??
      campaign.steps[0];
    if (!step) throw new BadRequestException('Kampaň nemá žádný krok.');

    const sample = await this.sampleRecipient(campaign.id, opts);
    const vars = buildRecipientVariables(
      { ...sample, senderName: campaign.senderName },
      this.config,
      campaign.id,
      sample.recipientId,
    );

    return {
      stepOrder: step.stepOrder,
      subject: renderCampaignContent(step.subject, vars),
      htmlContent: renderCampaignContent(step.htmlContent, vars),
      textContent: renderCampaignContent(step.textContent, vars),
      variables: vars,
    };
  }

  async testSend(campaignId: string, toEmail: string, stepOrder = 0) {
    const email = toEmail.trim().toLowerCase();
    if (!email.includes('@')) throw new BadRequestException('Neplatný e-mail.');

    const preview = await this.preview(campaignId, {
      stepOrder,
      sampleEmail: email,
    });

    await this.emails.sendRawEmail({
      type: 'email_campaign:test',
      to: email,
      subject: `[TEST] ${preview.subject}`,
      html: preview.htmlContent,
      text: preview.textContent,
      metadata: { campaignId, stepOrder, isTest: true },
    });

    return { ok: true, to: email };
  }

  async start(campaignId: string) {
    const campaign = await this.prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      include: { steps: { where: { isActive: true }, orderBy: { stepOrder: 'asc' } } },
    });
    if (!campaign) throw new NotFoundException('Kampaň nenalezena.');
    if (!campaign.steps.length) {
      throw new BadRequestException('Kampaň nemá aktivní kroky.');
    }
    if (
      campaign.status === EmailCampaignStatus.running ||
      campaign.status === EmailCampaignStatus.completed ||
      campaign.status === EmailCampaignStatus.sent
    ) {
      throw new BadRequestException('Kampaň již běží nebo je dokončená.');
    }

    const audience = this.parseAudience(campaign.audienceJson);
    const resolved = await this.resolveAudience(audience, campaign.minDaysBetweenSends);

    if (!resolved.length) {
      throw new BadRequestException('Žádní příjemci — zkontrolujte výběr publika.');
    }

    await this.prisma.emailCampaignRecipient.deleteMany({
      where: { campaignId, status: EmailCampaignRecipientStatus.pending },
    });

    const now = new Date();
    for (const r of resolved) {
      await this.prisma.emailCampaignRecipient.upsert({
        where: { campaignId_email: { campaignId, email: r.email } },
        create: {
          campaignId,
          email: r.email,
          fullName: r.fullName,
          firstName: r.firstName,
          company: r.company,
          phone: r.phone,
          role: r.role,
          source: r.source,
          sourceId: r.sourceId,
          status: EmailCampaignRecipientStatus.pending,
          lastCompletedStepOrder: -1,
          nextStepAt: now,
        },
        update: {
          fullName: r.fullName,
          firstName: r.firstName,
          company: r.company,
          phone: r.phone,
          role: r.role,
          status: EmailCampaignRecipientStatus.pending,
          lastCompletedStepOrder: -1,
          nextStepAt: now,
          errorMessage: null,
        },
      });
    }

    await this.prisma.emailCampaign.update({
      where: { id: campaignId },
      data: {
        status: EmailCampaignStatus.running,
        startedAt: now,
        pausedAt: null,
      },
    });

    const sent = await this.processDueRecipients(campaignId, 50);
    return { ok: true, recipients: resolved.length, processed: sent };
  }

  async pause(campaignId: string) {
    await this.prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: EmailCampaignStatus.paused, pausedAt: new Date() },
    });
    return { ok: true };
  }

  /** Cron / manuální zpracování fronty. */
  async processDueRecipients(campaignId?: string, limit = 30): Promise<number> {
    const now = new Date();
    const campaigns = await this.prisma.emailCampaign.findMany({
      where: {
        status: EmailCampaignStatus.running,
        ...(campaignId ? { id: campaignId } : {}),
      },
      select: { id: true },
    });

    let processed = 0;
    for (const c of campaigns) {
      const due = await this.prisma.emailCampaignRecipient.findMany({
        where: {
          campaignId: c.id,
          nextStepAt: { lte: now },
          status: {
            in: [
              EmailCampaignRecipientStatus.pending,
              EmailCampaignRecipientStatus.sent,
            ],
          },
        },
        take: limit,
        orderBy: { nextStepAt: 'asc' },
      });

      for (const recipient of due) {
        const ok = await this.sendNextStep(c.id, recipient.id);
        if (ok) processed += 1;
      }

      await this.maybeCompleteCampaign(c.id);
    }
    return processed;
  }

  private async sendNextStep(campaignId: string, recipientId: string): Promise<boolean> {
    const [campaign, recipient] = await Promise.all([
      this.prisma.emailCampaign.findUnique({
        where: { id: campaignId },
        include: { steps: { where: { isActive: true }, orderBy: { stepOrder: 'asc' } } },
      }),
      this.prisma.emailCampaignRecipient.findUnique({ where: { id: recipientId } }),
    ]);
    if (!campaign || !recipient) return false;
    if (campaign.status !== EmailCampaignStatus.running) return false;

    if (await this.isUnsubscribed(recipient.email)) {
      await this.prisma.emailCampaignRecipient.update({
        where: { id: recipientId },
        data: {
          status: EmailCampaignRecipientStatus.unsubscribed,
          unsubscribedAt: new Date(),
          nextStepAt: null,
        },
      });
      return false;
    }

    if (await this.isRegisteredRecipient(recipient)) {
      await this.prisma.emailCampaignRecipient.update({
        where: { id: recipientId },
        data: {
          status: EmailCampaignRecipientStatus.registered,
          registeredAt: new Date(),
          nextStepAt: null,
        },
      });
      return false;
    }

    const nextStep = campaign.steps.find(
      (s) => s.stepOrder > recipient.lastCompletedStepOrder,
    );
    if (!nextStep) {
      await this.prisma.emailCampaignRecipient.update({
        where: { id: recipientId },
        data: { status: EmailCampaignRecipientStatus.sent, nextStepAt: null },
      });
      return false;
    }

    const vars = buildRecipientVariables(
      {
        fullName: recipient.fullName,
        firstName: recipient.firstName,
        email: recipient.email,
        phone: recipient.phone,
        company: recipient.company,
        role: recipient.role,
        senderName: campaign.senderName,
      },
      this.config,
      campaign.id,
      recipient.id,
    );

    const subject = renderCampaignContent(nextStep.subject, vars);
    const html = renderCampaignContent(nextStep.htmlContent, vars);
    const text = renderCampaignContent(nextStep.textContent, vars);

    const log = await this.prisma.emailCampaignLog.create({
      data: {
        campaignId,
        recipientId,
        stepId: nextStep.id,
        stepOrder: nextStep.stepOrder,
        email: recipient.email,
        subject,
        status: EmailLogStatus.queued,
      },
    });

    try {
      await this.emails.sendRawEmail({
        type: 'email_campaign:step',
        to: recipient.email,
        subject,
        html,
        text,
        metadata: {
          campaignId,
          recipientId,
          stepId: nextStep.id,
          stepOrder: nextStep.stepOrder,
          campaignLogId: log.id,
        },
      });

      await this.prisma.emailCampaignLog.update({
        where: { id: log.id },
        data: { status: EmailLogStatus.sent, sentAt: new Date() },
      });

      const following = campaign.steps.find((s) => s.stepOrder > nextStep.stepOrder);
      const nextAt = following
        ? new Date(
            Date.now() +
              ((following.delayDays ?? 0) * 24 + (following.delayHours ?? 0)) *
                60 *
                60 *
                1000,
          )
        : null;

      await this.prisma.emailCampaignRecipient.update({
        where: { id: recipientId },
        data: {
          lastCompletedStepOrder: nextStep.stepOrder,
          lastSentAt: new Date(),
          status: following
            ? EmailCampaignRecipientStatus.sent
            : EmailCampaignRecipientStatus.sent,
          nextStepAt: nextAt,
        },
      });

      if (recipient.source === EmailCampaignRecipientSource.imported_broker && recipient.sourceId) {
        await this.prisma.importedBrokerContact.updateMany({
          where: { id: recipient.sourceId },
          data: { outreachStatus: 'emailed', invitedAt: new Date() },
        });
      }

      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.prisma.emailCampaignLog.update({
        where: { id: log.id },
        data: { status: EmailLogStatus.failed, errorMessage: msg },
      });
      await this.prisma.emailCampaignRecipient.update({
        where: { id: recipientId },
        data: {
          status: EmailCampaignRecipientStatus.failed,
          errorMessage: msg,
          nextStepAt: null,
        },
      });
      this.log.warn(`Campaign send failed ${campaignId}/${recipientId}: ${msg}`);
      return false;
    }
  }

  private async maybeCompleteCampaign(campaignId: string) {
    const pending = await this.prisma.emailCampaignRecipient.count({
      where: {
        campaignId,
        nextStepAt: { not: null },
        status: {
          in: [
            EmailCampaignRecipientStatus.pending,
            EmailCampaignRecipientStatus.sent,
          ],
        },
      },
    });
    if (pending > 0) return;

    const active = await this.prisma.emailCampaignRecipient.count({
      where: {
        campaignId,
        status: {
          in: [EmailCampaignRecipientStatus.pending, EmailCampaignRecipientStatus.sent],
        },
      },
    });
    if (active > 0) return;

    await this.prisma.emailCampaign.update({
      where: { id: campaignId },
      data: {
        status: EmailCampaignStatus.completed,
        completedAt: new Date(),
        sentAt: new Date(),
      },
    });
  }

  private parseAudience(json: Prisma.JsonValue | null): AudienceConfig {
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      return { mode: 'all_imported' };
    }
    const o = json as Record<string, unknown>;
    const mode = String(o.mode ?? 'all_imported') as AudienceConfig['mode'];
    return {
      mode,
      selectedContactIds: Array.isArray(o.selectedContactIds)
        ? o.selectedContactIds.map(String)
        : undefined,
      filter:
        o.filter && typeof o.filter === 'object' && !Array.isArray(o.filter)
          ? (o.filter as ListImportedBrokerContactsQuery)
          : undefined,
      portalRoles: Array.isArray(o.portalRoles)
        ? (o.portalRoles.map((r) => String(r).toUpperCase()) as UserRole[])
        : undefined,
    };
  }

  private async resolveAudience(
    audience: AudienceConfig,
    minDaysBetweenSends: number,
  ): Promise<ResolvedRecipient[]> {
    const rows: ResolvedRecipient[] = [];

    if (audience.mode === 'portal_roles' && audience.portalRoles?.length) {
      const users = await this.prisma.user.findMany({
        where: {
          role: { in: audience.portalRoles },
          emailVerified: true,
          accountLimited: false,
        },
        select: {
          id: true,
          email: true,
          name: true,
          firstName: true,
          phone: true,
          role: true,
          marketingConsentEmail: true,
        },
        take: 5000,
      });
      for (const u of users) {
        const email = u.email.trim().toLowerCase();
        if (!email.includes('@')) continue;
        if (u.marketingConsentEmail === false) continue;
        rows.push({
          email,
          fullName: u.name || `${u.firstName}`.trim(),
          firstName: u.firstName?.trim() || splitFirstName(u.name),
          company: '',
          phone: u.phone ?? '',
          role: PORTAL_ROLE_LABELS[u.role] ?? u.role,
          source: EmailCampaignRecipientSource.portal_user,
          sourceId: u.id,
        });
      }
    } else {
      let contacts: Array<{
        id: string;
        fullName: string;
        companyName: string;
        email: string | null;
        phone: string | null;
      }> = [];

      if (audience.mode === 'selected_ids' && audience.selectedContactIds?.length) {
        const ids = [...new Set(audience.selectedContactIds)];
        const found = await this.prisma.importedBrokerContact.findMany({
          where: { id: { in: ids } },
        });
        contacts = found.map((c) => ({
          id: c.id,
          fullName: c.fullName,
          companyName: c.companyName,
          email: c.email,
          phone: c.phone,
        }));
      } else if (audience.mode === 'filtered' && audience.filter) {
        const res = await this.importedBrokers.list({
          ...audience.filter,
          hasEmail: true,
          skip: 0,
          take: 5000,
        });
        contacts = res.items;
      } else {
        const res = await this.importedBrokers.list({
          hasEmail: true,
          skip: 0,
          take: 5000,
        });
        contacts = res.items;
      }

      for (const c of contacts) {
        const email = (c.email ?? '').trim().toLowerCase();
        if (!email.includes('@')) continue;
        rows.push({
          email,
          fullName: c.fullName || '',
          firstName: splitFirstName(c.fullName || ''),
          company: c.companyName || '',
          phone: c.phone || '',
          role: 'Makléř',
          source: EmailCampaignRecipientSource.imported_broker,
          sourceId: c.id,
        });
      }
    }

    const seen = new Set<string>();
    const deduped: ResolvedRecipient[] = [];
    for (const r of rows) {
      if (seen.has(r.email)) continue;
      if (await this.isUnsubscribed(r.email)) continue;
      if (minDaysBetweenSends > 0 && (await this.wasRecentlyEmailed(r.email, minDaysBetweenSends))) {
        continue;
      }
      seen.add(r.email);
      deduped.push(r);
    }
    return deduped;
  }

  private async isUnsubscribed(email: string): Promise<boolean> {
    const row = await this.prisma.emailMarketingUnsubscribe.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    return Boolean(row);
  }

  private async wasRecentlyEmailed(email: string, days: number): Promise<boolean> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const count = await this.prisma.emailCampaignLog.count({
      where: {
        email: email.trim().toLowerCase(),
        status: EmailLogStatus.sent,
        sentAt: { gte: since },
      },
    });
    return count > 0;
  }

  private async isRegisteredRecipient(
    recipient: { email: string; source: EmailCampaignRecipientSource; sourceId: string | null },
  ): Promise<boolean> {
    if (recipient.source === EmailCampaignRecipientSource.imported_broker && recipient.sourceId) {
      const c = await this.prisma.importedBrokerContact.findUnique({
        where: { id: recipient.sourceId },
        select: { profileCreated: true },
      });
      if (c?.profileCreated) return true;
    }
    const user = await this.prisma.user.findFirst({
      where: { email: recipient.email.trim().toLowerCase() },
      select: { id: true },
    });
    return Boolean(user);
  }

  private async sampleRecipient(
    campaignId: string,
    opts?: { sampleRecipientId?: string; sampleEmail?: string },
  ) {
    if (opts?.sampleRecipientId) {
      const r = await this.prisma.emailCampaignRecipient.findUnique({
        where: { id: opts.sampleRecipientId },
      });
      if (r) {
        return {
          recipientId: r.id,
          fullName: r.fullName,
          firstName: r.firstName,
          email: r.email,
          phone: r.phone,
          company: r.company,
          role: r.role,
        };
      }
    }
    const email = opts?.sampleEmail?.trim().toLowerCase() || 'makler@example.cz';
    return {
      recipientId: 'preview-sample',
      fullName: 'Jan Novák',
      firstName: 'Jan',
      email,
      phone: '+420123456789',
      company: 'RK Novák',
      role: 'Makléř',
    };
  }

  private serializeCampaignSummary(
    row: {
      id: string;
      title: string;
      type: string;
      status: EmailCampaignStatus;
      subject: string;
      createdAt: Date;
      scheduledAt: Date | null;
      startedAt: Date | null;
      completedAt: Date | null;
      sentAt: Date | null;
      _count: { recipients: number; steps: number; campaignLogs: number };
    },
  ) {
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      status: row.status,
      subject: row.subject,
      recipientCount: row._count.recipients,
      stepCount: row._count.steps,
      logCount: row._count.campaignLogs,
      createdAt: row.createdAt.toISOString(),
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      sentAt: row.sentAt?.toISOString() ?? null,
    };
  }

  private serializeCampaignDetail(
    row: {
      id: string;
      title: string;
      type: string;
      status: EmailCampaignStatus;
      subject: string;
      htmlContent: string;
      textContent: string;
      senderName: string;
      minDaysBetweenSends: number;
      templateKey: string | null;
      audienceJson: Prisma.JsonValue | null;
      createdAt: Date;
      updatedAt: Date;
      scheduledAt: Date | null;
      startedAt: Date | null;
      completedAt: Date | null;
      sentAt: Date | null;
      steps: Array<{
        id: string;
        stepOrder: number;
        name: string;
        subject: string;
        htmlContent: string;
        textContent: string;
        delayDays: number;
        delayHours: number;
        isActive: boolean;
      }>;
      recipients?: Array<{
        id: string;
        email: string;
        fullName: string;
        status: EmailCampaignRecipientStatus;
        lastCompletedStepOrder: number;
        nextStepAt: Date | null;
        lastSentAt: Date | null;
        errorMessage: string | null;
      }>;
      _count?: { recipients: number; campaignLogs: number; steps?: number };
    },
  ) {
    const count = {
      recipients: row._count?.recipients ?? row.recipients?.length ?? 0,
      steps: row._count?.steps ?? row.steps.length,
      campaignLogs: row._count?.campaignLogs ?? 0,
    };
    return {
      ...this.serializeCampaignSummary({
        ...row,
        _count: count,
      }),
      htmlContent: row.htmlContent,
      textContent: row.textContent,
      senderName: row.senderName,
      minDaysBetweenSends: row.minDaysBetweenSends,
      templateKey: row.templateKey,
      audience: this.parseAudience(row.audienceJson),
      updatedAt: row.updatedAt.toISOString(),
      steps: row.steps.map((s) => ({
        id: s.id,
        stepOrder: s.stepOrder,
        name: s.name,
        subject: s.subject,
        htmlContent: s.htmlContent,
        textContent: s.textContent,
        delayDays: s.delayDays,
        delayHours: s.delayHours,
        isActive: s.isActive,
      })),
      recipients: (row.recipients ?? []).map((r) => ({
        id: r.id,
        email: r.email,
        fullName: r.fullName,
        status: r.status,
        lastCompletedStepOrder: r.lastCompletedStepOrder,
        nextStepAt: r.nextStepAt?.toISOString() ?? null,
        lastSentAt: r.lastSentAt?.toISOString() ?? null,
        errorMessage: r.errorMessage,
      })),
    };
  }
}
