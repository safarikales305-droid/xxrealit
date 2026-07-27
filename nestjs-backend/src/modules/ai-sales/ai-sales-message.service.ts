import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AiSalesContactType,
  AiSalesMessageRecipientStatus,
  AiSalesMessageStatus,
  AiSalesProspectStatus,
  AiSalesReplyClassification,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { EmailsService } from '../emails/emails.service';
import { OpenAiService } from '../openai/openai.service';
import { buildOptOutFooter } from './ai-sales.constants';
import { AI_SALES_PROMPT_FEATURES } from './ai-sales.constants';
import { AiSalesPromptResolverService } from './ai-sales-prompt-resolver.service';
import { AiSalesProspectService } from './ai-sales-prospect.service';
import { AiSalesSettingsService } from './ai-sales-settings.service';
import { AiSalesMessageTemplateService } from './ai-sales-message-template.service';
import { AiSalesSuppressionService } from './ai-sales-suppression.service';
import { EMAIL_RE } from './ai-sales-prospect.service';
import { AiSalesAdminException, buildSalesAdminError } from './ai-sales-errors.util';
import { EmailSettingsService } from '../emails/email-settings.service';

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
    private readonly template: AiSalesMessageTemplateService,
    private readonly emailSettings: EmailSettingsService,
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
        versions: { orderBy: { version: 'desc' }, take: 20 },
        recipients: { orderBy: { createdAt: 'asc' }, include: { contact: true } },
      },
    });
    if (!row) throw new NotFoundException('Zpráva nenalezena.');

    if (!row.htmlContent?.trim()) {
      const footer = await this.emailSettings.getFooterContactEmail();
      const html = this.template.renderFromMessage(row, footer);
      const updated = await this.prisma.aiSalesMessage.update({
        where: { id },
        data: { htmlContent: html },
      });
      return { ...row, htmlContent: html, updatedAt: updated.updatedAt };
    }

    return row;
  }

  async getPreview(id: string) {
    const msg = await this.getById(id);
    const recipients = msg.recipients ?? (await this.listRecipients(id));
    const selected = recipients.filter((r) => r.selected);
    const salesSender = await this.emailSettings.getSalesSender();
    const replyTo = await this.emailSettings.resolveReplyTo({
      messageReplyTo: msg.replyToEmail,
      moduleReplyTo: (await this.settings.getOrCreate()).replyToEmail,
    });
    const footer = await this.emailSettings.getFooterContactEmail();
  return {
      messageId: msg.id,
      status: msg.status,
      subject: msg.subject,
      preheader: msg.preheader,
      from: salesSender.email,
      fromName: salesSender.name,
      fromFormatted: this.emailSettings.formatFrom(salesSender),
      replyTo,
      footerContactEmail: footer,
      to: selected.map((r) => r.email).join(', ') || msg.prospect.primaryEmail || msg.prospect.email || '—',
      html: msg.htmlContent ?? this.template.renderFromMessage(msg, footer),
      plainText: msg.plainText ?? msg.content,
      previewUrl: `/admin/marketing/ai-sales?tab=message&messageId=${msg.id}`,
      partial: msg.analysisIncomplete,
      recipients: selected,
    };
  }

  async deleteMessage(id: string) {
    const msg = await this.getById(id);
    if (msg.status === AiSalesMessageStatus.SENT) {
      throw new BadRequestException('Odeslanou zprávu nelze smazat.');
    }
    await this.prisma.aiSalesMessage.delete({ where: { id } });
    return { success: true };
  }

  async updateContent(
    id: string,
    data: {
      subject?: string;
      content?: string;
      preheader?: string;
      greeting?: string;
      intro?: string;
      benefitsJson?: unknown;
      ctaText?: string;
      ctaUrl?: string;
      closing?: string;
      signature?: string;
      plainText?: string;
      htmlContent?: string;
      replyToEmail?: string;
    },
    userId?: string,
  ) {
    const msg = await this.getById(id);
    if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(msg.status)) {
      throw new BadRequestException('Tuto zprávu již nelze upravit.');
    }

    const updated = await this.prisma.aiSalesMessage.update({
      where: { id },
      data: {
        subject: data.subject ?? msg.subject,
        content: data.content ?? data.plainText ?? msg.content,
        plainText: data.plainText ?? data.content ?? msg.plainText ?? msg.content,
        preheader: data.preheader ?? msg.preheader,
        greeting: data.greeting ?? msg.greeting,
        intro: data.intro ?? msg.intro,
        benefitsJson: (data.benefitsJson ?? msg.benefitsJson) as never,
        ctaText: data.ctaText ?? msg.ctaText,
        ctaUrl: data.ctaUrl ?? msg.ctaUrl,
        closing: data.closing ?? msg.closing,
        signature: data.signature ?? msg.signature,
        htmlContent: data.htmlContent ?? msg.htmlContent,
        replyToEmail: data.replyToEmail ?? msg.replyToEmail,
      },
    });

    const nextVersion = (msg.versions?.[0]?.version ?? 0) + 1;
    await this.prisma.aiSalesMessageVersion.create({
      data: {
        messageId: id,
        version: nextVersion,
        contentJson: updated as never,
        changeSource: 'HUMAN',
        changeDescription: 'Ruční úprava',
        createdById: userId,
      },
    });

    return updated;
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
    }).then(async (updated) => {
      await this.prisma.aiSalesMessageRecipient.updateMany({
        where: { messageId: id, selected: true },
        data: { approved: true, status: AiSalesMessageRecipientStatus.APPROVED },
      });
      return updated;
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

    if (msg.prospect.doNotContact) {
      throw new ForbiddenException('Kontakt je v DO_NOT_CONTACT — odeslání zakázáno.');
    }

    await this.assertSendLimits(msg.messageType, msg.prospectId);

    if (!this.isWithinSendWindow(settings)) {
      throw new BadRequestException('Odesílání je povoleno pouze v nastaveném časovém okně.');
    }

    const recipients = await this.prisma.aiSalesMessageRecipient.findMany({
      where: {
        messageId: id,
        selected: true,
        approved: true,
        status: { in: [AiSalesMessageRecipientStatus.SELECTED, AiSalesMessageRecipientStatus.APPROVED] },
      },
    });

    if (recipients.length > 0) {
      return this.sendToRecipients(id, msg, recipients, settings, userId);
    }

    const fallbackEmail = msg.prospect.primaryEmail ?? msg.prospect.email;
    if (!fallbackEmail || !EMAIL_RE.test(fallbackEmail)) {
      throw new AiSalesAdminException(
        buildSalesAdminError(
          'MISSING_EMAIL',
          'Vyberte alespoň jednoho schváleného příjemce s platným e-mailem.',
          400,
          'send',
        ),
      );
    }

    const sup = await this.suppression.isSuppressed(fallbackEmail);
    if (sup.suppressed) {
      throw new ForbiddenException(`E-mail je v seznamu zákazu: ${sup.reason}`);
    }

    return this.sendSingleEmail(id, msg, fallbackEmail, settings, userId);
  }

  private async buildOutboundEmailHeaders(msg: {
    replyToEmail?: string | null;
  }) {
    const aiSettings = await this.settings.getOrCreate();
    const salesSender = await this.emailSettings.getSalesSender();
    const replyTo = await this.emailSettings.resolveReplyTo({
      messageReplyTo: msg.replyToEmail,
      moduleReplyTo: aiSettings.replyToEmail,
    });
    return {
      from: this.emailSettings.formatFrom(salesSender),
      replyTo,
      senderName: salesSender.name,
      senderEmail: salesSender.email,
    };
  }

  private async appendOptOutFooter(content: string): Promise<string> {
    if (content.includes('NEZÁJEM')) return content;
    const footer = await this.emailSettings.getFooterContactEmail();
    return `${content}${buildOptOutFooter(footer)}`;
  }

  private async sendToRecipients(
    id: string,
    msg: Awaited<ReturnType<AiSalesMessageService['getById']>>,
    recipients: Array<{ id: string; email: string; contactId: string | null }>,
    settings: Awaited<ReturnType<AiSalesSettingsService['getOrCreate']>>,
    userId?: string,
  ) {
    const contentWithOptOut = await this.appendOptOutFooter(msg.content);
    const html =
      msg.htmlContent ?? `<p>${contentWithOptOut.replace(/\n/g, '<br/>')}</p>`;
    const headers = await this.buildOutboundEmailHeaders(msg);

    if (settings.testModeEnabled) {
      await this.prisma.aiSalesMessageRecipient.updateMany({
        where: { messageId: id, id: { in: recipients.map((r) => r.id) } },
        data: { status: AiSalesMessageRecipientStatus.SENT, sentAt: new Date() },
      });
      const updated = await this.prisma.aiSalesMessage.update({
        where: { id },
        data: { status: AiSalesMessageStatus.SENT, sentAt: new Date(), isTest: true, htmlContent: html },
      });
      await this.prisma.aiSalesProspect.update({
        where: { id: msg.prospectId },
        data: { status: AiSalesProspectStatus.WAITING_REPLY, lastContactAt: new Date() },
      });
      return { message: updated, testMode: true, sent: false, recipients: recipients.length };
    }

    const sentResults: Array<{ recipientId: string; email: string; providerMessageId?: string }> = [];
    const failures: Array<{ email: string; error: string }> = [];

    for (const recipient of recipients) {
      const sup = await this.suppression.isSuppressed(recipient.email);
      if (sup.suppressed) {
        failures.push({ email: recipient.email, error: sup.reason ?? 'SUPPRESSED' });
        await this.prisma.aiSalesMessageRecipient.update({
          where: { id: recipient.id },
          data: {
            status: AiSalesMessageRecipientStatus.FAILED,
            errorCode: 'SUPPRESSED',
            errorMessage: sup.reason,
          },
        });
        continue;
      }

      try {
        const sendResult = await this.emails.sendRawEmail({
          type: 'ai_sales_outreach',
          to: recipient.email,
          subject: msg.subject ?? 'Spolupráce s XXREALIT',
          html,
          text: contentWithOptOut,
          from: headers.from,
          replyTo: headers.replyTo,
          senderName: headers.senderName,
          senderEmail: headers.senderEmail,
          metadata: {
            aiSalesMessageId: msg.id,
            prospectId: msg.prospectId,
            campaignId: msg.campaignId,
            approvedById: userId,
            recipientId: recipient.id,
          },
        });

        await this.prisma.aiSalesMessageRecipient.update({
          where: { id: recipient.id },
          data: {
            status: AiSalesMessageRecipientStatus.SENT,
            sentAt: new Date(),
            providerMessageId: sendResult.providerMessageId,
          },
        });
        sentResults.push({
          recipientId: recipient.id,
          email: recipient.email,
          providerMessageId: sendResult.providerMessageId,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        failures.push({ email: recipient.email, error: errorMessage });
        await this.prisma.aiSalesMessageRecipient.update({
          where: { id: recipient.id },
          data: {
            status: AiSalesMessageRecipientStatus.FAILED,
            errorCode: 'SEND_FAILED',
            errorMessage,
          },
        });
      }
    }

    if (sentResults.length === 0) {
      throw new BadRequestException(
        failures.map((f) => `${f.email}: ${f.error}`).join(' · ') || 'Odeslání selhalo.',
      );
    }

    const updated = await this.prisma.aiSalesMessage.update({
      where: { id },
      data: {
        status: AiSalesMessageStatus.SENT,
        sentAt: new Date(),
        providerMessageId: sentResults[0]?.providerMessageId,
        htmlContent: html,
      },
    });

    await this.prisma.aiSalesProspect.update({
      where: { id: msg.prospectId },
      data: { status: AiSalesProspectStatus.WAITING_REPLY, lastContactAt: new Date() },
    });

    return { message: updated, testMode: false, sent: true, sentResults, failures };
  }

  private async sendSingleEmail(
    id: string,
    msg: Awaited<ReturnType<AiSalesMessageService['getById']>>,
    to: string,
    settings: Awaited<ReturnType<AiSalesSettingsService['getOrCreate']>>,
    userId?: string,
  ) {
    const contentWithOptOut = await this.appendOptOutFooter(msg.content);
    const html =
      msg.htmlContent ?? `<p>${contentWithOptOut.replace(/\n/g, '<br/>')}</p>`;
    const headers = await this.buildOutboundEmailHeaders(msg);

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
          status: AiSalesProspectStatus.WAITING_REPLY,
          lastContactAt: new Date(),
        },
      });
      return { message: updated, testMode: true, sent: false };
    }

    const sendResult = await this.emails.sendRawEmail({
      type: 'ai_sales_outreach',
      to,
      subject: msg.subject ?? 'Spolupráce s XXREALIT',
      html,
      text: contentWithOptOut,
      from: headers.from,
      replyTo: headers.replyTo,
      senderName: headers.senderName,
      senderEmail: headers.senderEmail,
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
        status: AiSalesProspectStatus.WAITING_REPLY,
        lastContactAt: new Date(),
      },
    });

    return { message: updated, testMode: false, sent: true };
  }

  async seedRecipientsForMessage(messageId: string, prospectId: string) {
    const emailContacts = await this.prisma.aiSalesPublicContact.findMany({
      where: { prospectId, type: AiSalesContactType.EMAIL },
      orderBy: [{ isPrimary: 'desc' }, { isSelectedForOutreach: 'desc' }, { confidence: 'desc' }],
    });

    const existing = await this.prisma.aiSalesMessageRecipient.count({ where: { messageId } });
    if (existing > 0) return this.listRecipients(messageId);

    const defaults = this.pickDefaultRecipients(emailContacts);
    const rows = emailContacts.map((c) => {
      const email = c.normalizedValue ?? c.value;
      return {
        messageId,
        contactId: c.id,
        email,
        selected: defaults.has(c.id),
        approved: false,
        status: AiSalesMessageRecipientStatus.SELECTED,
      };
    });

    if (rows.length === 0 && emailContacts.length === 0) {
      const prospect = await this.prisma.aiSalesProspect.findUnique({ where: { id: prospectId } });
      const email = prospect?.primaryEmail ?? prospect?.email;
      if (email && EMAIL_RE.test(email)) {
        await this.prisma.aiSalesMessageRecipient.create({
          data: {
            messageId,
            email,
            selected: true,
            approved: false,
            status: AiSalesMessageRecipientStatus.SELECTED,
          },
        });
      }
    } else if (rows.length > 0) {
      await this.prisma.aiSalesMessageRecipient.createMany({ data: rows });
    }

    return this.listRecipients(messageId);
  }

  private pickDefaultRecipients(
    contacts: Array<{ id: string; isPrimary: boolean; isSelectedForOutreach: boolean; label: string | null; value: string }>,
  ): Set<string> {
    const selected = new Set<string>();
    const primary = contacts.find((c) => c.isPrimary) ?? contacts.find((c) => c.isSelectedForOutreach);
    if (primary) selected.add(primary.id);

    const branch = contacts.find(
      (c) =>
        c.id !== primary?.id &&
        (c.isSelectedForOutreach || /poboč|pobock|branch|office/i.test(c.label ?? '')),
    );
    if (branch) selected.add(branch.id);

    return selected;
  }

  async listRecipients(messageId: string) {
    return this.prisma.aiSalesMessageRecipient.findMany({
      where: { messageId },
      orderBy: { createdAt: 'asc' },
      include: {
        contact: {
          select: {
            id: true,
            value: true,
            label: true,
            contactPersonName: true,
            isPrimary: true,
            verificationStatus: true,
          },
        },
      },
    });
  }

  async updateRecipients(
    messageId: string,
    updates: Array<{ id: string; selected?: boolean; approved?: boolean }>,
  ) {
    for (const row of updates) {
      await this.prisma.aiSalesMessageRecipient.update({
        where: { id: row.id },
        data: {
          ...(row.selected !== undefined ? { selected: row.selected } : {}),
          ...(row.approved !== undefined ? { approved: row.approved } : {}),
        },
      });
    }
    return this.listRecipients(messageId);
  }

  async selectAllRecipients(messageId: string, mode: 'all' | 'primary' | 'general' | 'none') {
    const recipients = await this.listRecipients(messageId);
    for (const r of recipients) {
      let selected = false;
      if (mode === 'all') selected = true;
      else if (mode === 'none') selected = false;
      else if (mode === 'primary') selected = Boolean(r.contact?.isPrimary);
      else if (mode === 'general') {
        const label = r.contact?.label ?? '';
        selected = !/makléř|makler|osobn/i.test(label);
      }
      await this.prisma.aiSalesMessageRecipient.update({
        where: { id: r.id },
        data: { selected },
      });
    }
    return this.listRecipients(messageId);
  }

  async sendTest(id: string, testEmail: string, userId?: string) {
    const msg = await this.getById(id);
    if (!EMAIL_RE.test(testEmail)) {
      throw new BadRequestException('Neplatná testovací e-mailová adresa.');
    }

    const subject = `[TEST] ${msg.subject ?? 'Návrh nabídky XXREALIT'}`;
    const footer = await this.emailSettings.getFooterContactEmail();
    const html =
      msg.htmlContent ??
      this.template.renderFromMessage(msg, footer);
    const text = msg.plainText ?? msg.content;
    const headers = await this.buildOutboundEmailHeaders(msg);

    await this.emails.sendRawEmail({
      type: 'ai_sales_outreach_test',
      to: testEmail,
      subject,
      html,
      text,
      from: headers.from,
      replyTo: headers.replyTo,
      senderName: headers.senderName,
      senderEmail: headers.senderEmail,
      metadata: {
        aiSalesMessageId: msg.id,
        prospectId: msg.prospectId,
        test: true,
        sentById: userId,
      },
    });

    await this.prisma.aiSalesPartnerMemory.create({
      data: {
        prospectId: msg.prospectId,
        memoryType: 'TEST_EMAIL',
        content: `Testovací e-mail odeslán na ${testEmail}`,
        source: 'MESSAGE_TEST',
        sourceId: msg.id,
        createdById: userId,
      },
    });

    return { success: true, testEmail, messageId: msg.id, status: msg.status, replyTo: headers.replyTo };
  }

  async listVersions(messageId: string) {
    return this.prisma.aiSalesMessageVersion.findMany({
      where: { messageId },
      orderBy: { version: 'desc' },
    });
  }

  async restoreVersion(messageId: string, versionId: string, userId?: string) {
    const version = await this.prisma.aiSalesMessageVersion.findFirst({
      where: { id: versionId, messageId },
    });
    if (!version) throw new NotFoundException('Verze nenalezena.');

    const snapshot = version.contentJson as Record<string, unknown>;
    const updated = await this.prisma.aiSalesMessage.update({
      where: { id: messageId },
      data: {
        subject: snapshot.subject as string | undefined,
        content: snapshot.content as string | undefined,
        plainText: snapshot.plainText as string | undefined,
        preheader: snapshot.preheader as string | undefined,
        greeting: snapshot.greeting as string | undefined,
        intro: snapshot.intro as string | undefined,
        benefitsJson: snapshot.benefitsJson as never,
        ctaText: snapshot.ctaText as string | undefined,
        ctaUrl: snapshot.ctaUrl as string | undefined,
        closing: snapshot.closing as string | undefined,
        signature: snapshot.signature as string | undefined,
        htmlContent: snapshot.htmlContent as string | undefined,
      },
    });

    const nextVersion =
      (await this.prisma.aiSalesMessageVersion.count({ where: { messageId } })) + 1;
    await this.prisma.aiSalesMessageVersion.create({
      data: {
        messageId,
        version: nextVersion,
        contentJson: updated as never,
        changeSource: 'HUMAN',
        changeDescription: `Obnoveno z verze ${version.version}`,
        createdById: userId,
      },
    });

    return updated;
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

    await this.prisma.aiSalesMessage.update({
      where: { id: messageId },
      data: { repliedAt: new Date(), status: AiSalesMessageStatus.REPLIED },
    });

    const prospectStatus = this.mapReplyToProspectStatus(parsed.classification);
    await this.prisma.aiSalesProspect.update({
      where: { id: msg.prospectId },
      data: { status: prospectStatus, lastContactAt: new Date() },
    });

    await this.prisma.aiSalesPartnerMemory.create({
      data: {
        prospectId: msg.prospectId,
        memoryType: 'REPLY',
        content: `Odpověď: ${parsed.summary ?? replyText.slice(0, 500)}`,
        source: 'REPLY',
        sourceId: analysis.id,
        createdById: userId,
      },
    });

    if (parsed.recommendedAction) {
      await this.prisma.aiSalesPartnerMemory.create({
        data: {
          prospectId: msg.prospectId,
          memoryType: 'NEXT_STEP',
          content: parsed.recommendedAction,
          source: 'REPLY',
          sourceId: analysis.id,
          createdById: userId,
        },
      });
    }

    if (
      parsed.setDoNotContact ||
      parsed.classification === AiSalesReplyClassification.UNSUBSCRIBE ||
      parsed.classification === AiSalesReplyClassification.NOT_INTERESTED
    ) {
      await this.prospects.markDoNotContact(msg.prospectId, 'REPLY_OPT_OUT');
    }

    return { analysis, usage: result };
  }

  private mapReplyToProspectStatus(classification?: AiSalesReplyClassification): AiSalesProspectStatus {
    switch (classification) {
      case AiSalesReplyClassification.INTERESTED:
      case AiSalesReplyClassification.WANTS_CALL:
      case AiSalesReplyClassification.WANTS_MEETING:
      case AiSalesReplyClassification.REQUEST_MORE_INFO:
        return AiSalesProspectStatus.IN_NEGOTIATION;
      case AiSalesReplyClassification.NOT_INTERESTED:
      case AiSalesReplyClassification.UNSUBSCRIBE:
        return AiSalesProspectStatus.NOT_INTERESTED;
      case AiSalesReplyClassification.NOT_NOW:
        return AiSalesProspectStatus.FOLLOW_UP;
      default:
        return AiSalesProspectStatus.REPLIED;
    }
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
