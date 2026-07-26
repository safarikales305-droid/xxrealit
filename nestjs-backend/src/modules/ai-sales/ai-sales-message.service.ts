import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AiSalesMessageStatus,
  AiSalesProspectStatus,
  AiSalesReplyClassification,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { EmailsService } from '../emails/emails.service';
import { OpenAiService } from '../openai/openai.service';
import { OPT_OUT_FOOTER } from './ai-sales.constants';
import { AI_SALES_PROMPT_FEATURES } from './ai-sales.constants';
import { AiSalesPromptResolverService } from './ai-sales-prompt-resolver.service';
import { AiSalesProspectService } from './ai-sales-prospect.service';
import { AiSalesSettingsService } from './ai-sales-settings.service';
import { AiSalesSuppressionService } from './ai-sales-suppression.service';
import { EMAIL_RE } from './ai-sales-prospect.service';

@Injectable()
export class AiSalesMessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prospects: AiSalesProspectService,
    private readonly settings: AiSalesSettingsService,
    private readonly suppression: AiSalesSuppressionService,
    private readonly emails: EmailsService,
    private readonly openai: OpenAiService,
    private readonly promptResolver: AiSalesPromptResolverService,
  ) {}

  async list(filters?: {
    status?: AiSalesMessageStatus;
    prospectId?: string;
    limit?: number;
  }) {
    return this.prisma.aiSalesMessage.findMany({
      where: {
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.prospectId ? { prospectId: filters.prospectId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, filters?.limit ?? 50),
      include: {
        prospect: {
          select: {
            id: true,
            companyName: true,
            partnerType: true,
            email: true,
            fitScore: true,
            source: true,
            doNotContact: true,
          },
        },
        replyAnalysis: true,
      },
    });
  }

  async getById(id: string) {
    const row = await this.prisma.aiSalesMessage.findUnique({
      where: { id },
      include: {
        prospect: true,
        replyAnalysis: true,
        campaign: true,
      },
    });
    if (!row) throw new NotFoundException('Zpráva nenalezena.');
    return row;
  }

  async updateContent(id: string, data: { subject?: string; content?: string }) {
    const msg = await this.getById(id);
    if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(msg.status)) {
      throw new BadRequestException('Tuto zprávu již nelze upravit.');
    }
    return this.prisma.aiSalesMessage.update({
      where: { id },
      data: {
        subject: data.subject ?? msg.subject,
        content: data.content ?? msg.content,
      },
    });
  }

  async approve(id: string, userId?: string) {
    const msg = await this.getById(id);
    if (msg.status !== 'PENDING_APPROVAL' && msg.status !== 'DRAFT') {
      throw new BadRequestException('Zprávu nelze schválit v aktuálním stavu.');
    }
    if (msg.prospect.doNotContact) {
      throw new ForbiddenException('Kontakt je v DO_NOT_CONTACT.');
    }

    const settings = await this.settings.getOrCreate();
    if (settings.requireManualApproval && !userId) {
      throw new ForbiddenException('Schválení vyžaduje administrátora.');
    }

    return this.prisma.aiSalesMessage.update({
      where: { id },
      data: {
        status: AiSalesMessageStatus.APPROVED,
        approvedById: userId,
        approvedAt: new Date(),
      },
    });
  }

  async reject(id: string, userId?: string) {
    return this.prisma.aiSalesMessage.update({
      where: { id },
      data: {
        status: AiSalesMessageStatus.REJECTED,
        approvedById: userId,
      },
    });
  }

  async schedule(id: string, scheduledAt: Date, userId?: string) {
    await this.approve(id, userId);
    return this.prisma.aiSalesMessage.update({
      where: { id },
      data: {
        status: AiSalesMessageStatus.SCHEDULED,
        scheduledAt,
      },
    });
  }

  async send(id: string, userId?: string) {
    const msg = await this.getById(id);
    const settings = await this.settings.getOrCreate();

    if (!settings.enabled) {
      throw new ForbiddenException('AI obchodník je vypnutý.');
    }

    if (msg.status !== AiSalesMessageStatus.APPROVED && msg.status !== AiSalesMessageStatus.SCHEDULED) {
      throw new BadRequestException(
        'E-mail lze odeslat pouze po schválení administrátorem. Aktuální stav: ' + msg.status,
      );
    }

    if (!msg.prospect.email || !EMAIL_RE.test(msg.prospect.email)) {
      throw new BadRequestException('Kontakt nemá ověřený platný e-mail.');
    }

    if (msg.prospect.doNotContact) {
      throw new ForbiddenException('Kontakt je v DO_NOT_CONTACT — odeslání zakázáno.');
    }

    const sup = await this.suppression.isSuppressed(msg.prospect.email);
    if (sup.suppressed) {
      throw new ForbiddenException(`E-mail je v seznamu zákazu: ${sup.reason}`);
    }

    await this.assertSendLimits(msg.messageType, msg.prospectId);

    if (!this.isWithinSendWindow(settings)) {
      throw new BadRequestException('Odesílání je povoleno pouze v nastaveném časovém okně.');
    }

    const contentWithOptOut = msg.content.includes('NEZÁJEM')
      ? msg.content
      : `${msg.content}${OPT_OUT_FOOTER}`;

    const html = `<p>${contentWithOptOut.replace(/\n/g, '<br/>')}</p>`;

    if (settings.testModeEnabled) {
      const updated = await this.prisma.aiSalesMessage.update({
        where: { id },
        data: {
          status: AiSalesMessageStatus.SENT,
          sentAt: new Date(),
          isTest: true,
          htmlContent: html,
        },
      });
      await this.prisma.aiSalesProspect.update({
        where: { id: msg.prospectId },
        data: {
          status: AiSalesProspectStatus.CONTACTED,
          lastContactAt: new Date(),
        },
      });
      return { message: updated, testMode: true, sent: false };
    }

    const sendResult = await this.emails.sendRawEmail({
      type: 'ai_sales_outreach',
      to: msg.prospect.email,
      subject: msg.subject ?? 'Spolupráce s XXREALIT',
      html,
      text: contentWithOptOut,
      metadata: {
        aiSalesMessageId: msg.id,
        prospectId: msg.prospectId,
        campaignId: msg.campaignId,
        approvedById: userId,
      },
    });

    const updated = await this.prisma.aiSalesMessage.update({
      where: { id },
      data: {
        status: AiSalesMessageStatus.SENT,
        sentAt: new Date(),
        providerMessageId: sendResult.providerMessageId,
        emailLogId: sendResult.logId,
        htmlContent: html,
      },
    });

    await this.prisma.aiSalesProspect.update({
      where: { id: msg.prospectId },
      data: {
        status: AiSalesProspectStatus.CONTACTED,
        lastContactAt: new Date(),
      },
    });

    return { message: updated, testMode: false, sent: true };
  }

  async classifyReply(messageId: string, replyText: string, userId?: string) {
    const msg = await this.getById(messageId);
    const prompt = await this.promptResolver.resolveActive(
      AI_SALES_PROMPT_FEATURES.REPLY_CLASSIFICATION,
      {},
    );

    const result = await this.openai.complete({
      feature: 'ai_sales',
      systemPrompt: prompt.systemPrompt,
      userPrompt: `Původní oslovení:\n${msg.content}\n\nOdpověď příjemce:\n${replyText}`,
      userId,
      jsonMode: true,
    });

    let parsed: {
      classification?: AiSalesReplyClassification;
      confidence?: number;
      summary?: string;
      recommendedAction?: string;
      setDoNotContact?: boolean;
    } = {};
    try {
      parsed = JSON.parse(result.text);
    } catch {
      parsed = { classification: AiSalesReplyClassification.UNKNOWN, summary: result.text };
    }

    const analysis = await this.prisma.aiSalesReplyAnalysis.upsert({
      where: { messageId },
      create: {
        messageId,
        classification: parsed.classification ?? AiSalesReplyClassification.UNKNOWN,
        confidence: parsed.confidence,
        summary: parsed.summary,
        recommendedAction: parsed.recommendedAction,
      },
      update: {
        classification: parsed.classification ?? AiSalesReplyClassification.UNKNOWN,
        confidence: parsed.confidence,
        summary: parsed.summary,
        recommendedAction: parsed.recommendedAction,
      },
    });

    if (
      parsed.setDoNotContact ||
      parsed.classification === AiSalesReplyClassification.UNSUBSCRIBE ||
      parsed.classification === AiSalesReplyClassification.NOT_INTERESTED
    ) {
      await this.prospects.markDoNotContact(msg.prospectId, 'REPLY_OPT_OUT');
    }

    return { analysis, usage: result };
  }

  private async assertSendLimits(messageType: string, prospectId: string) {
    const settings = await this.settings.getOrCreate();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const isFirst = messageType === 'FIRST_OUTREACH';

    const todayCount = await this.prisma.aiSalesMessage.count({
      where: {
        sentAt: { gte: dayStart },
        status: AiSalesMessageStatus.SENT,
        messageType: isFirst ? 'FIRST_OUTREACH' : { not: 'FIRST_OUTREACH' },
        isTest: false,
      },
    });

    const limit = isFirst ? settings.dailyFirstOutreachLimit : settings.dailyFollowUpLimit;
    if (todayCount >= limit) {
      throw new ForbiddenException(`Denní limit odeslání (${limit}) byl překročen.`);
    }

    if (isFirst) {
      const companyCount = await this.prisma.aiSalesMessage.count({
        where: {
          prospectId,
          messageType: 'FIRST_OUTREACH',
          status: AiSalesMessageStatus.SENT,
        },
      });
      if (companyCount >= settings.maxFirstOutreachPerCompany) {
        throw new ForbiddenException('Pro tuto firmu již bylo odesláno první oslovení.');
      }
    } else {
      const followUpCount = await this.prisma.aiSalesMessage.count({
        where: {
          prospectId,
          messageType: { not: 'FIRST_OUTREACH' },
          status: AiSalesMessageStatus.SENT,
        },
      });
      if (followUpCount >= settings.maxFollowUpsPerProspect) {
        throw new ForbiddenException('Byl překročen maximální počet follow-upů.');
      }
    }
  }

  private isWithinSendWindow(settings: {
    sendWindowStartHour: number;
    sendWindowEndHour: number;
    sendOnWeekends: boolean;
  }): boolean {
    const now = new Date();
    const day = now.getDay();
    if (!settings.sendOnWeekends && (day === 0 || day === 6)) return false;
    const hour = now.getHours();
    return hour >= settings.sendWindowStartHour && hour < settings.sendWindowEndHour;
  }
}
