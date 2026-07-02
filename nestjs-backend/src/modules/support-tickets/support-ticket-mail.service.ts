import { Injectable, Logger } from '@nestjs/common';
import {
  SupportMessageAuthorType,
  SupportTicketEmailDeliveryStatus,
  type SupportEmailMailbox,
  type SupportTicket,
} from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../database/prisma.service';
import { SupportEmailMailboxService } from './support-email-mailbox.service';

type MailboxRow = SupportEmailMailbox;

@Injectable()
export class SupportTicketMailService {
  private readonly logger = new Logger(SupportTicketMailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailboxes: SupportEmailMailboxService,
  ) {}

  private renderTemplate(
    template: string,
    vars: Record<string, string>,
  ): string {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? '');
  }

  private emailDomain(mailbox: MailboxRow): string {
    const at = mailbox.email.indexOf('@');
    return at > 0 ? mailbox.email.slice(at + 1) : 'support.local';
  }

  buildMessageId(ticketId: string, messageId: string, mailbox: MailboxRow): string {
    return `<ticket-${ticketId}-msg-${messageId}@${this.emailDomain(mailbox)}>`;
  }

  replySubject(ticket: Pick<SupportTicket, 'publicId' | 'subject'>): string {
    const base = ticket.subject.replace(/^(Re:\s*)+/i, '').trim();
    return `Re: [Ticket #${ticket.publicId}] ${base}`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private bodyToHtml(body: string): string {
    return this.escapeHtml(body).replace(/\n/g, '<br/>');
  }

  private async collectThreadHeaders(ticketId: string): Promise<{
    inReplyTo: string | null;
    references: string;
  }> {
    const prior = await this.prisma.supportTicketMessage.findMany({
      where: {
        ticketId,
        emailMessageId: { not: null },
        isInternalNote: false,
      },
      orderBy: { createdAt: 'asc' },
      select: { emailMessageId: true },
    });
    const ids = prior
      .map((m) => m.emailMessageId)
      .filter((id): id is string => Boolean(id));
    const inReplyTo = ids.length ? ids[ids.length - 1] : null;
    return { inReplyTo, references: ids.join(' ') };
  }

  private createTransport(mailbox: MailboxRow) {
    const password = this.mailboxes.decryptSmtpPassword(mailbox);
    return nodemailer.createTransport({
      host: mailbox.smtpHost,
      port: mailbox.smtpPort,
      secure: mailbox.smtpSecure,
      auth: {
        user: mailbox.smtpUser,
        pass: password,
      },
    });
  }

  async sendStaffReply(params: {
    ticket: SupportTicket;
    messageId: string;
    body: string;
    mailbox: MailboxRow;
    staffName?: string | null;
  }): Promise<{ emailMessageId: string; smtpMessageId: string | null }> {
    const { ticket, messageId, body, mailbox, staffName } = params;
    const emailMessageId = this.buildMessageId(ticket.id, messageId, mailbox);
    const { inReplyTo, references } = await this.collectThreadHeaders(ticket.id);

    const signatureHtml = mailbox.signatureHtml?.trim()
      ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;color:#4b5563">${mailbox.signatureHtml}</div>`
      : mailbox.signatureText?.trim()
        ? `<p style="margin-top:24px;color:#4b5563;white-space:pre-wrap">${this.escapeHtml(mailbox.signatureText)}</p>`
        : '';

    const html = `
      <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.5">
        ${this.bodyToHtml(body)}
        ${signatureHtml}
      </div>
    `.trim();

    const textBody = [body, mailbox.signatureText?.trim()].filter(Boolean).join('\n\n');

    const replyTo = mailbox.replyToEmail?.trim() || mailbox.email;
    const fromName = mailbox.label.trim() || mailbox.email;

    const transport = this.createTransport(mailbox);
    const info = await transport.sendMail({
      from: `"${fromName}" <${mailbox.email}>`,
      to: ticket.email,
      replyTo,
      subject: this.replySubject(ticket),
      text: textBody,
      html,
      messageId: emailMessageId,
      inReplyTo: inReplyTo ?? undefined,
      references: references || undefined,
      headers: {
        'X-Support-Ticket-Id': ticket.id,
        'X-Support-Ticket-Public-Id': ticket.publicId,
      },
    });

    this.logger.log(
      `[support-mail] staff reply ticket=${ticket.publicId} to=${ticket.email} messageId=${emailMessageId}`,
    );

    return {
      emailMessageId,
      smtpMessageId: info.messageId ?? null,
    };
  }

  async sendAutoReply(ticket: SupportTicket, mailbox: MailboxRow) {
    if (!mailbox.autoReplyEnabled) return;

    const vars = {
      publicId: ticket.publicId,
      subject: ticket.subject,
      firstName: ticket.firstName,
    };

    const subject = this.renderTemplate(
      mailbox.autoReplySubject ?? `Potvrzení přijetí dotazu [Ticket #${ticket.publicId}]`,
      vars,
    );
    const html = this.renderTemplate(mailbox.autoReplyHtml ?? '', vars);
    const text = mailbox.autoReplyText
      ? this.renderTemplate(mailbox.autoReplyText, vars)
      : undefined;

    const transport = this.createTransport(mailbox);
    await transport.sendMail({
      from: `"${mailbox.label}" <${mailbox.email}>`,
      to: ticket.email,
      replyTo: mailbox.replyToEmail?.trim() || mailbox.email,
      subject,
      html: html || undefined,
      text,
      headers: {
        'X-Support-Ticket-Id': ticket.id,
        'X-Support-Ticket-Public-Id': ticket.publicId,
      },
    });

    this.logger.log(`[support-mail] auto-reply ticket=${ticket.publicId}`);
  }

  async sendAdminNotification(params: {
    ticket: SupportTicket;
    preview: string;
    mailbox?: MailboxRow | null;
  }) {
    const settings = await this.mailboxes.ensureSettings();
    const notifyTo = settings.adminNotifyEmail?.trim();
    if (!notifyTo) return;

    const mailbox = params.mailbox ?? (await this.mailboxes.getDefaultMailbox());
    if (!mailbox) return;

    const transport = this.createTransport(mailbox);
    await transport.sendMail({
      from: `"${mailbox.label}" <${mailbox.email}>`,
      to: notifyTo,
      subject: `[Podpora] Nová odpověď zákazníka — ${params.ticket.publicId}`,
      text: `Ticket: ${params.ticket.publicId}\nPředmět: ${params.ticket.subject}\nZákazník: ${params.ticket.email}\n\n${params.preview}`,
      html: `<p>Nová odpověď zákazníka v ticketu <strong>${params.ticket.publicId}</strong>.</p><p>${this.bodyToHtml(params.preview)}</p>`,
    });
  }

  async markMessageDelivery(
    messageId: string,
    data: {
      emailMessageId?: string;
      emailInReplyTo?: string | null;
      emailReferences?: string | null;
      smtpMessageId?: string | null;
      status: SupportTicketEmailDeliveryStatus;
      mailboxId?: string;
    },
  ) {
    const now = new Date();
    await this.prisma.supportTicketMessage.update({
      where: { id: messageId },
      data: {
        emailMessageId: data.emailMessageId,
        emailInReplyTo: data.emailInReplyTo ?? undefined,
        emailReferences: data.emailReferences ?? undefined,
        smtpMessageId: data.smtpMessageId ?? undefined,
        emailDeliveryStatus: data.status,
        mailboxId: data.mailboxId,
        emailSentAt:
          data.status === SupportTicketEmailDeliveryStatus.SENT ||
          data.status === SupportTicketEmailDeliveryStatus.DELIVERED
            ? now
            : undefined,
        emailDeliveredAt:
          data.status === SupportTicketEmailDeliveryStatus.DELIVERED ? now : undefined,
      },
    });
  }

  async createSystemMessage(ticketId: string, body: string) {
    return this.prisma.supportTicketMessage.create({
      data: {
        ticketId,
        authorType: SupportMessageAuthorType.SYSTEM,
        body,
        source: 'system',
        emailDeliveryStatus: SupportTicketEmailDeliveryStatus.SENT,
      },
    });
  }
}
