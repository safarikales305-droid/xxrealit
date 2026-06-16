import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { isCommunicationRole } from './communication.constants';
import type { CreateCrmContactDto } from './dto/create-crm-contact.dto';
import type { UpdateCrmContactDto } from './dto/update-crm-contact.dto';

@Injectable()
export class CrmContactsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertAccess(role: UserRole) {
    if (!isCommunicationRole(role)) {
      throw new ForbiddenException('CRM kontakty jsou dostupné jen pro profesionální účty.');
    }
  }

  async list(
    ownerUserId: string,
    role: UserRole,
    filters: { listingId?: string; search?: string; tag?: string },
  ) {
    this.assertAccess(role);
    const where: Record<string, unknown> = { ownerUserId };
    if (filters.listingId) where.listingId = filters.listingId;
    if (filters.tag) where.tags = { has: filters.tag };
    if (filters.search?.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.crmContact.findMany({
      where,
      orderBy: [{ lastContactAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        listing: { select: { id: true, title: true, city: true } },
      },
    });

    return rows.map((r) => this.toRow(r));
  }

  async create(ownerUserId: string, role: UserRole, dto: CreateCrmContactDto) {
    this.assertAccess(role);
    const row = await this.prisma.crmContact.create({
      data: {
        ownerUserId,
        name: dto.name.trim(),
        phone: dto.phone?.trim() ?? '',
        email: dto.email?.trim() ?? '',
        source: dto.source?.trim() || 'manual',
        listingId: dto.listingId ?? null,
        contactLeadId: dto.contactLeadId ?? null,
        notes: dto.notes?.trim() || null,
        tags: dto.tags ?? [],
        reminderAt: dto.reminderAt ? new Date(dto.reminderAt) : null,
      },
      include: { listing: { select: { id: true, title: true, city: true } } },
    });
    return this.toRow(row);
  }

  async update(ownerUserId: string, role: UserRole, id: string, dto: UpdateCrmContactDto) {
    this.assertAccess(role);
    const existing = await this.prisma.crmContact.findFirst({
      where: { id, ownerUserId },
    });
    if (!existing) throw new NotFoundException('Kontakt nenalezen.');

    const row = await this.prisma.crmContact.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
        ...(dto.email !== undefined ? { email: dto.email.trim() } : {}),
        ...(dto.source !== undefined ? { source: dto.source.trim() } : {}),
        ...(dto.listingId !== undefined ? { listingId: dto.listingId } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        ...(dto.reminderAt !== undefined
          ? { reminderAt: dto.reminderAt ? new Date(dto.reminderAt) : null }
          : {}),
        ...(dto.lastContactAt !== undefined
          ? { lastContactAt: dto.lastContactAt ? new Date(dto.lastContactAt) : null }
          : {}),
      },
      include: { listing: { select: { id: true, title: true, city: true } } },
    });
    return this.toRow(row);
  }

  async remove(ownerUserId: string, role: UserRole, id: string) {
    this.assertAccess(role);
    const existing = await this.prisma.crmContact.findFirst({
      where: { id, ownerUserId },
    });
    if (!existing) throw new NotFoundException('Kontakt nenalezen.');
    await this.prisma.crmContact.delete({ where: { id } });
    return { ok: true };
  }

  async syncFromLeads(ownerUserId: string, role: UserRole) {
    this.assertAccess(role);
    const leads = await this.prisma.contactLead.findMany({
      where: { ownerUserId },
      orderBy: { createdAt: 'desc' },
    });
    let imported = 0;
    for (const lead of leads) {
      const exists = await this.prisma.crmContact.findFirst({
        where: { ownerUserId, contactLeadId: lead.id },
      });
      if (exists) continue;
      await this.prisma.crmContact.create({
        data: {
          ownerUserId,
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          source: lead.sourceType === 'TIP' ? 'tip_lead' : 'listing_lead',
          listingId: lead.listingId,
          contactLeadId: lead.id,
          lastContactAt: lead.createdAt,
        },
      });
      imported += 1;
    }
    return { imported, total: leads.length };
  }

  async exportCsv(ownerUserId: string, role: UserRole) {
    this.assertAccess(role);
    const rows = await this.prisma.crmContact.findMany({
      where: { ownerUserId },
      orderBy: { createdAt: 'desc' },
      include: { listing: { select: { title: true } } },
    });
    const header = 'Jméno;Telefon;Email;Zdroj;Inzerát;Štítky;Poznámky;Vytvořeno;Poslední komunikace';
    const lines = rows.map((r) =>
      [
        r.name,
        r.phone,
        r.email,
        r.source,
        r.listing?.title ?? '',
        r.tags.join('|'),
        (r.notes ?? '').replace(/[\n\r;]/g, ' '),
        r.createdAt.toISOString(),
        r.lastContactAt?.toISOString() ?? '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(';'),
    );
    return { filename: 'kontakty-xxrealit.csv', content: [header, ...lines].join('\n') };
  }

  async countForUser(ownerUserId: string) {
    return this.prisma.crmContact.count({ where: { ownerUserId } });
  }

  async countAll() {
    return this.prisma.crmContact.count();
  }

  private toRow(
    r: {
      id: string;
      name: string;
      phone: string;
      email: string;
      source: string;
      listingId: string | null;
      contactLeadId: string | null;
      notes: string | null;
      tags: string[];
      reminderAt: Date | null;
      lastContactAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      listing?: { id: string; title: string; city: string | null } | null;
    },
  ) {
    return {
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      source: r.source,
      listingId: r.listingId,
      contactLeadId: r.contactLeadId,
      notes: r.notes,
      tags: r.tags,
      reminderAt: r.reminderAt?.toISOString() ?? null,
      lastContactAt: r.lastContactAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      listing: r.listing ?? null,
    };
  }
}
