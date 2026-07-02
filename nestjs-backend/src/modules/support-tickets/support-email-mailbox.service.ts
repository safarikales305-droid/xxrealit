import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type {
  CreateSupportEmailMailboxDto,
  UpdateSupportEmailMailboxDto,
  UpdateSupportEmailSettingsDto,
} from './dto/support-email.dto';
import { SupportCredentialEncryptionService } from './support-credential-encryption.service';

const DEFAULT_AUTO_REPLY_SUBJECT = 'Potvrzení přijetí dotazu [Ticket #{{publicId}}]';
const DEFAULT_AUTO_REPLY_HTML = `
<p>Dobrý den {{firstName}},</p>
<p>děkujeme za váš dotaz <strong>{{subject}}</strong>. Váš ticket má číslo <strong>{{publicId}}</strong>.</p>
<p>Odpovíme vám co nejdříve. Na tento e-mail můžete odpovědět — zpráva se automaticky připojí k ticketu.</p>
<p>S pozdravem<br/>Tým podpory</p>
`.trim();

@Injectable()
export class SupportEmailMailboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: SupportCredentialEncryptionService,
  ) {}

  private serializeMailbox(row: {
    id: string;
    label: string;
    email: string;
    replyToEmail: string | null;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    imapHost: string | null;
    imapPort: number | null;
    imapSecure: boolean;
    imapUser: string | null;
    signatureHtml: string;
    signatureText: string;
    autoReplyEnabled: boolean;
    autoReplySubject: string | null;
    autoReplyHtml: string | null;
    autoReplyText: string | null;
    isDefault: boolean;
    active: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      label: row.label,
      email: row.email,
      replyToEmail: row.replyToEmail,
      smtpHost: row.smtpHost,
      smtpPort: row.smtpPort,
      smtpSecure: row.smtpSecure,
      smtpUser: row.smtpUser,
      hasSmtpPassword: true,
      imapHost: row.imapHost,
      imapPort: row.imapPort,
      imapSecure: row.imapSecure,
      imapUser: row.imapUser,
      hasImapPassword: Boolean(row.imapUser),
      signatureHtml: row.signatureHtml,
      signatureText: row.signatureText,
      autoReplyEnabled: row.autoReplyEnabled,
      autoReplySubject: row.autoReplySubject,
      autoReplyHtml: row.autoReplyHtml,
      autoReplyText: row.autoReplyText,
      isDefault: row.isDefault,
      active: row.active,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async ensureSettings() {
    return this.prisma.supportEmailSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });
  }

  async getSettings() {
    const row = await this.ensureSettings();
    return {
      adminNotifyEmail: row.adminNotifyEmail,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updateSettings(dto: UpdateSupportEmailSettingsDto) {
    const row = await this.prisma.supportEmailSettings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        adminNotifyEmail: dto.adminNotifyEmail ?? null,
      },
      update: {
        adminNotifyEmail: dto.adminNotifyEmail ?? null,
      },
    });
    return {
      adminNotifyEmail: row.adminNotifyEmail,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listMailboxes() {
    const rows = await this.prisma.supportEmailMailbox.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => this.serializeMailbox(r));
  }

  async listActiveForReply() {
    const rows = await this.prisma.supportEmailMailbox.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      email: r.email,
      replyToEmail: r.replyToEmail,
      isDefault: r.isDefault,
    }));
  }

  async getMailboxById(id: string) {
    const row = await this.prisma.supportEmailMailbox.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Schránka nenalezena');
    return row;
  }

  async getDefaultMailbox() {
    const preferred = await this.prisma.supportEmailMailbox.findFirst({
      where: { active: true, isDefault: true },
      orderBy: { sortOrder: 'asc' },
    });
    if (preferred) return preferred;
    return this.prisma.supportEmailMailbox.findFirst({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  decryptSmtpPassword(row: { smtpPasswordEncrypted: string }): string {
    return this.crypto.decrypt(row.smtpPasswordEncrypted);
  }

  decryptImapPassword(row: { imapPasswordEncrypted: string | null }): string | null {
    if (!row.imapPasswordEncrypted) return null;
    return this.crypto.decrypt(row.imapPasswordEncrypted);
  }

  async createMailbox(dto: CreateSupportEmailMailboxDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.supportEmailMailbox.findUnique({ where: { email } });
    if (existing) throw new BadRequestException('E-mail schránky už existuje');

    if (dto.isDefault) {
      await this.prisma.supportEmailMailbox.updateMany({ data: { isDefault: false } });
    }

    const row = await this.prisma.supportEmailMailbox.create({
      data: {
        label: dto.label.trim(),
        email,
        replyToEmail: dto.replyToEmail?.trim().toLowerCase() || null,
        smtpHost: dto.smtpHost.trim(),
        smtpPort: dto.smtpPort,
        smtpSecure: dto.smtpSecure,
        smtpUser: dto.smtpUser.trim(),
        smtpPasswordEncrypted: this.crypto.encrypt(dto.smtpPassword),
        imapHost: dto.imapHost?.trim() || null,
        imapPort: dto.imapPort ?? null,
        imapSecure: dto.imapSecure ?? true,
        imapUser: dto.imapUser?.trim() || null,
        imapPasswordEncrypted: dto.imapPassword
          ? this.crypto.encrypt(dto.imapPassword)
          : null,
        signatureHtml: dto.signatureHtml ?? '',
        signatureText: dto.signatureText ?? '',
        autoReplyEnabled: dto.autoReplyEnabled ?? false,
        autoReplySubject: dto.autoReplySubject ?? DEFAULT_AUTO_REPLY_SUBJECT,
        autoReplyHtml: dto.autoReplyHtml ?? DEFAULT_AUTO_REPLY_HTML,
        autoReplyText: dto.autoReplyText ?? null,
        isDefault: dto.isDefault ?? false,
        active: dto.active ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    if (!(await this.prisma.supportEmailMailbox.count({ where: { isDefault: true } }))) {
      await this.prisma.supportEmailMailbox.update({
        where: { id: row.id },
        data: { isDefault: true },
      });
      row.isDefault = true;
    }

    return this.serializeMailbox(row);
  }

  async updateMailbox(id: string, dto: UpdateSupportEmailMailboxDto) {
    const current = await this.getMailboxById(id);
    const data: Prisma.SupportEmailMailboxUpdateInput = {};

    if (dto.label !== undefined) data.label = dto.label.trim();
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      if (email !== current.email) {
        const clash = await this.prisma.supportEmailMailbox.findUnique({ where: { email } });
        if (clash) throw new BadRequestException('E-mail schránky už existuje');
      }
      data.email = email;
    }
    if (dto.replyToEmail !== undefined) {
      data.replyToEmail = dto.replyToEmail?.trim().toLowerCase() || null;
    }
    if (dto.smtpHost !== undefined) data.smtpHost = dto.smtpHost.trim();
    if (dto.smtpPort !== undefined) data.smtpPort = dto.smtpPort;
    if (dto.smtpSecure !== undefined) data.smtpSecure = dto.smtpSecure;
    if (dto.smtpUser !== undefined) data.smtpUser = dto.smtpUser.trim();
    if (dto.smtpPassword) {
      data.smtpPasswordEncrypted = this.crypto.encrypt(dto.smtpPassword);
    }
    if (dto.imapHost !== undefined) data.imapHost = dto.imapHost?.trim() || null;
    if (dto.imapPort !== undefined) data.imapPort = dto.imapPort;
    if (dto.imapSecure !== undefined) data.imapSecure = dto.imapSecure;
    if (dto.imapUser !== undefined) data.imapUser = dto.imapUser?.trim() || null;
    if (dto.imapPassword) {
      data.imapPasswordEncrypted = this.crypto.encrypt(dto.imapPassword);
    }
    if (dto.signatureHtml !== undefined) data.signatureHtml = dto.signatureHtml;
    if (dto.signatureText !== undefined) data.signatureText = dto.signatureText;
    if (dto.autoReplyEnabled !== undefined) data.autoReplyEnabled = dto.autoReplyEnabled;
    if (dto.autoReplySubject !== undefined) data.autoReplySubject = dto.autoReplySubject;
    if (dto.autoReplyHtml !== undefined) data.autoReplyHtml = dto.autoReplyHtml;
    if (dto.autoReplyText !== undefined) data.autoReplyText = dto.autoReplyText;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    if (dto.isDefault === true) {
      await this.prisma.supportEmailMailbox.updateMany({ data: { isDefault: false } });
      data.isDefault = true;
    } else if (dto.isDefault === false && current.isDefault) {
      data.isDefault = false;
    }

    const row = await this.prisma.supportEmailMailbox.update({ where: { id }, data });

    if (!row.isDefault) {
      const hasDefault = await this.prisma.supportEmailMailbox.count({
        where: { isDefault: true, active: true },
      });
      if (!hasDefault) {
        await this.prisma.supportEmailMailbox.update({
          where: { id: row.id },
          data: { isDefault: true },
        });
        row.isDefault = true;
      }
    }

    return this.serializeMailbox(row);
  }

  async deleteMailbox(id: string) {
    const row = await this.getMailboxById(id);
    const count = await this.prisma.supportEmailMailbox.count();
    if (count <= 1) {
      throw new BadRequestException('Nelze smazat poslední schránku');
    }
    await this.prisma.supportEmailMailbox.delete({ where: { id } });
    if (row.isDefault) {
      const next = await this.prisma.supportEmailMailbox.findFirst({
        orderBy: { sortOrder: 'asc' },
      });
      if (next) {
        await this.prisma.supportEmailMailbox.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
    return { ok: true };
  }
}
