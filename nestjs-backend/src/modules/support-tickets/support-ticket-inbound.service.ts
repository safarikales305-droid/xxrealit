import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SupportMessageAuthorType,
  SupportTicketEmailDeliveryStatus,
  SupportTicketStatus,
  type SupportEmailMailbox,
} from '@prisma/client';
import { ImapFlow } from 'imapflow';
import { simpleParser, type Attachment } from 'mailparser';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { PrismaService } from '../../database/prisma.service';
import { ensureUploadsPathExists } from '../../lib/uploads-path';
import { SupportEmailMailboxService } from './support-email-mailbox.service';
import { SupportTicketMailService } from './support-ticket-mail.service';

@Injectable()
export class SupportTicketInboundService {
  private readonly logger = new Logger(SupportTicketInboundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailboxes: SupportEmailMailboxService,
    private readonly mail: SupportTicketMailService,
    private readonly config: ConfigService,
  ) {}

  webhookSecret(): string | null {
    return this.config.get<string>('SUPPORT_INBOUND_WEBHOOK_SECRET')?.trim() || null;
  }

  private extractMessageIds(value: string | null | undefined): string[] {
    if (!value) return [];
    const matches = value.match(/<[^>]+>/g);
    return matches ?? [];
  }

  private parsePublicIdFromSubject(subject: string | undefined): string | null {
    if (!subject) return null;
    const m = subject.match(/\[Ticket\s*#(SP-\d{4}-\d{6})\]/i);
    return m?.[1] ?? null;
  }

  private async findTicketForInbound(params: {
    inReplyTo?: string | null;
    references?: string | null;
    subject?: string | null;
    fromEmail?: string | null;
  }) {
    const candidateIds = [
      ...this.extractMessageIds(params.inReplyTo),
      ...this.extractMessageIds(params.references),
    ];

    for (const messageId of candidateIds) {
      const msg = await this.prisma.supportTicketMessage.findFirst({
        where: { emailMessageId: messageId },
        select: { ticketId: true },
      });
      if (msg) {
        const ticket = await this.prisma.supportTicket.findUnique({
          where: { id: msg.ticketId },
        });
        if (ticket) return ticket;
      }
    }

    const publicId = this.parsePublicIdFromSubject(params.subject ?? undefined);
    if (publicId) {
      const ticket = await this.prisma.supportTicket.findUnique({ where: { publicId } });
      if (ticket) return ticket;
    }

    const from = params.fromEmail?.trim().toLowerCase();
    if (from) {
      return this.prisma.supportTicket.findFirst({
        where: {
          email: from,
          status: { not: SupportTicketStatus.CLOSED },
        },
        orderBy: { lastMessageAt: 'desc' },
      });
    }

    return null;
  }

  private async saveAttachment(messageId: string, att: Attachment) {
    const root = ensureUploadsPathExists();
    const dir = join(root, 'support-attachments', messageId);
    await mkdir(dir, { recursive: true });
    const safeName = (att.filename || 'attachment')
      .replace(/[^\w.\-() ]+/g, '_')
      .slice(0, 180);
    const storagePath = join(dir, safeName);
    const content = att.content;
    if (Buffer.isBuffer(content)) {
      await pipeline(Readable.from(content), createWriteStream(storagePath));
    } else if (content) {
      await pipeline(content as NodeJS.ReadableStream, createWriteStream(storagePath));
    }
    const relative = `/uploads/support-attachments/${messageId}/${safeName}`;
    await this.prisma.supportTicketAttachment.create({
      data: {
        messageId,
        fileName: safeName,
        mimeType: att.contentType || 'application/octet-stream',
        sizeBytes: att.size ?? 0,
        storagePath: relative,
      },
    });
  }

  async processInboundMime(rawMime: string, mailbox?: SupportEmailMailbox | null) {
    const parsed = await simpleParser(rawMime);
    const emailMessageId = parsed.messageId?.trim();
    if (!emailMessageId) {
      this.logger.warn('[support-inbound] missing Message-ID, skipping');
      return { processed: false, reason: 'missing_message_id' };
    }

    const existing = await this.prisma.supportTicketMessage.findFirst({
      where: { emailMessageId },
      select: { id: true },
    });
    if (existing) {
      return { processed: false, reason: 'duplicate' };
    }

    const fromAddress = parsed.from?.value?.[0]?.address?.trim().toLowerCase();
    const bodyText =
      parsed.text?.trim() ||
      (parsed.html ? parsed.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '');
    if (!bodyText) {
      return { processed: false, reason: 'empty_body' };
    }

    const ticket = await this.findTicketForInbound({
      inReplyTo: parsed.inReplyTo ?? null,
      references: Array.isArray(parsed.references)
        ? parsed.references.join(' ')
        : (parsed.references as string | null),
      subject: parsed.subject ?? null,
      fromEmail: fromAddress,
    });

    if (!ticket) {
      this.logger.warn(
        `[support-inbound] ticket not found from=${fromAddress} subject=${parsed.subject ?? ''}`,
      );
      return { processed: false, reason: 'ticket_not_found' };
    }

    if (ticket.status === SupportTicketStatus.CLOSED) {
      return { processed: false, reason: 'ticket_closed' };
    }

    const now = new Date();
    const references = Array.isArray(parsed.references)
      ? parsed.references.join(' ')
      : (parsed.references as string | null);

    const message = await this.prisma.supportTicketMessage.create({
      data: {
        ticketId: ticket.id,
        authorType: SupportMessageAuthorType.CUSTOMER,
        authorUserId: ticket.userId,
        body: bodyText,
        source: 'email',
        emailMessageId,
        emailInReplyTo: parsed.inReplyTo ?? null,
        emailReferences: references,
        emailDeliveryStatus: SupportTicketEmailDeliveryStatus.RECEIVED,
        emailDeliveredAt: now,
        mailboxId: mailbox?.id,
      },
    });

    if (parsed.attachments?.length) {
      for (const att of parsed.attachments) {
        if (!att.content) continue;
        try {
          await this.saveAttachment(message.id, att);
        } catch (err) {
          this.logger.warn(
            `[support-inbound] attachment save failed message=${message.id}: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    }

    await this.prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        lastMessageAt: now,
        status: SupportTicketStatus.WAITING_REPLY,
      },
    });

    void this.mail
      .sendAdminNotification({
        ticket,
        preview: bodyText.slice(0, 500),
        mailbox,
      })
      .catch((err) =>
        this.logger.warn(
          `[support-inbound] admin notify failed: ${err instanceof Error ? err.message : err}`,
        ),
      );

    this.logger.log(
      `[support-inbound] added customer reply ticket=${ticket.publicId} messageId=${emailMessageId}`,
    );

    return { processed: true, ticketId: ticket.id, messageId: message.id };
  }

  async pollMailbox(mailbox: SupportEmailMailbox) {
    if (!mailbox.imapHost || !mailbox.imapPort) return { fetched: 0 };

    const imapPassword = this.mailboxes.decryptImapPassword(mailbox);
    if (!imapPassword) return { fetched: 0 };

    const client = new ImapFlow({
      host: mailbox.imapHost,
      port: mailbox.imapPort,
      secure: mailbox.imapSecure,
      auth: {
        user: mailbox.imapUser || mailbox.smtpUser,
        pass: imapPassword,
      },
      logger: false,
    });

    let fetched = 0;
    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        const unseen = await client.search({ seen: false });
        if (unseen) {
          for (const uid of unseen) {
            const msg = await client.fetchOne(uid, { source: true });
            if (msg === false || !msg.source) continue;
            const raw = msg.source.toString();
            const result = await this.processInboundMime(raw, mailbox);
            if (result.processed) fetched += 1;
            await client.messageFlagsAdd(uid, ['\\Seen']);
          }
        }
      } finally {
        lock.release();
      }
    } catch (err) {
      this.logger.warn(
        `[support-inbound] IMAP poll failed mailbox=${mailbox.email}: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      try {
        await client.logout();
      } catch {
        /* ignore */
      }
    }

    return { fetched };
  }

  async pollAllMailboxes() {
    const rows = await this.prisma.supportEmailMailbox.findMany({
      where: { active: true, imapHost: { not: null } },
      orderBy: { sortOrder: 'asc' },
    });
    let total = 0;
    for (const mailbox of rows) {
      const { fetched } = await this.pollMailbox(mailbox);
      total += fetched;
    }
    return { fetched: total };
  }
}
