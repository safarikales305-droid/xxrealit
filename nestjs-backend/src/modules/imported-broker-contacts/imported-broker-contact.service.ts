import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

function normEmail(v: string | null | undefined): string | null {
  const t = (v ?? '').trim().toLowerCase();
  if (!t || !t.includes('@')) return null;
  return t.slice(0, 120);
}

function normPhone(v: string | null | undefined): string | null {
  const raw = (v ?? '').trim();
  if (!raw) return null;
  const d = raw.replace(/[\s().-]/g, '');
  if (d.replace(/\D/g, '').length < 9) return null;
  return raw.slice(0, 40);
}

function meaningfulName(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  if (t.length < 2) return null;
  if (/^reality\.cz import$/i.test(t)) return null;
  return t.slice(0, 200);
}

export type ListImportedBrokerContactsQuery = {
  search?: string;
  portal?: string;
  hasEmail?: boolean;
  hasPhone?: boolean;
  profileCreated?: boolean;
  outreachStatus?: string;
  sort?: 'lastSeen_desc' | 'lastSeen_asc' | 'listings_desc' | 'listings_asc';
  skip?: number;
  take?: number;
};

@Injectable()
export class ImportedBrokerContactService {
  private readonly logger = new Logger(ImportedBrokerContactService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Po uložení importovaného inzerátu — párování podle e-mailu, pak telefonu, jinak nový neúplný záznam.
   * Nikdy nevyhodí výjimku ven (import musí doběhnout).
   */
  async syncFromImportedProperty(propertyId: string): Promise<void> {
    try {
      await this.syncFromImportedPropertyInner(propertyId);
    } catch (e) {
      this.logger.warn(
        `syncFromImportedProperty failed propertyId=${propertyId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  private async syncFromImportedPropertyInner(propertyId: string): Promise<void> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) return;
    if (!property.importSource || !property.importExternalId) return;

    const email = normEmail(property.contactEmail);
    const phone = normPhone(property.contactPhone);
    const name = meaningfulName(property.contactName) ?? '';
    const listingUrl = property.importSourceUrl?.trim() || null;
    const portal =
      (property.sourcePortalKey ?? '').trim() ||
      (property.importSource ? String(property.importSource) : '') ||
      null;
    const portalLabel = (property.sourcePortalLabel ?? '').trim() || null;
    const city = (property.city ?? '').trim() || null;
    const company =
      portalLabel && !name.toLowerCase().includes(portalLabel.toLowerCase())
        ? portalLabel.slice(0, 200)
        : '';

    const parsedLog = {
      propertyId,
      email: Boolean(email),
      phone: Boolean(phone),
      nameLen: name.length,
      listingUrl: Boolean(listingUrl),
    };
    this.logger.log(`[broker-contact] contact parsed ${JSON.stringify(parsedLog)}`);

    if (!email && !phone && !(meaningfulName(property.contactName) && listingUrl)) {
      this.logger.log(
        `[broker-contact] skip propertyId=${propertyId} (no email/phone and no name+url)`,
      );
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const existingLink = await tx.importedBrokerContactListing.findFirst({
        where: { propertyId },
        include: { contact: true },
      });

      let contact =
        existingLink?.contact ??
        (email
          ? await tx.importedBrokerContact.findFirst({ where: { email } })
          : null) ??
        (phone ? await tx.importedBrokerContact.findFirst({ where: { phone } }) : null);

      const isNew = !contact;
      const now = new Date();

      if (!contact) {
        if (!email && !phone && !(meaningfulName(property.contactName) && listingUrl)) {
          return;
        }
        contact = await tx.importedBrokerContact.create({
          data: {
            fullName: name || 'Neznámý kontakt',
            companyName: company,
            email,
            phone,
            website: null,
            sourcePortal: portal,
            sourceUrl: listingUrl,
            city,
            status: !email && !phone ? 'INCOMPLETE' : 'ACTIVE',
            firstSeenAt: now,
            lastSeenAt: now,
            listingCount: 0,
          },
        });
        this.logger.log(`[broker-contact] created new broker contact id=${contact.id}`);
      } else {
        await tx.importedBrokerContact.update({
          where: { id: contact.id },
          data: {
            fullName: contact.fullName?.trim() ? contact.fullName : name || contact.fullName,
            companyName: contact.companyName?.trim()
              ? contact.companyName
              : company || contact.companyName,
            email: contact.email ?? email,
            phone: contact.phone ?? phone,
            sourcePortal: contact.sourcePortal ?? portal,
            sourceUrl: listingUrl ?? contact.sourceUrl,
            city: contact.city ?? city,
            lastSeenAt: now,
            status:
              contact.status === 'INCOMPLETE' && (email || phone) ? 'ACTIVE' : contact.status,
          },
        });
        this.logger.log(`[broker-contact] updated existing broker contact id=${contact.id}`);
      }

      await tx.importedBrokerContactListing.upsert({
        where: {
          contactId_propertyId: {
            contactId: contact.id,
            propertyId,
          },
        },
        create: {
          contactId: contact.id,
          propertyId,
          sourceUrl: listingUrl,
        },
        update: { sourceUrl: listingUrl ?? undefined },
      });

      const cnt = await tx.importedBrokerContactListing.count({
        where: { contactId: contact.id },
      });
      await tx.importedBrokerContact.update({
        where: { id: contact.id },
        data: { listingCount: cnt, lastSeenAt: now },
      });

      if (!isNew) {
        this.logger.log(`[broker-contact] linked propertyId=${propertyId} to contact=${contact.id}`);
      }
    });
  }

  async list(q: ListImportedBrokerContactsQuery) {
    const take = Math.min(100, Math.max(1, q.take ?? 40));
    const skip = Math.max(0, q.skip ?? 0);
    const where: Prisma.ImportedBrokerContactWhereInput = {};

    if (q.portal?.trim()) {
      where.sourcePortal = { contains: q.portal.trim(), mode: 'insensitive' };
    }
    if (q.hasEmail === true) where.email = { not: null };
    if (q.hasEmail === false) where.email = null;
    if (q.hasPhone === true) where.phone = { not: null };
    if (q.hasPhone === false) where.phone = null;
    if (q.profileCreated === true) where.profileCreated = true;
    if (q.profileCreated === false) where.profileCreated = false;
    if (q.outreachStatus?.trim()) {
      where.outreachStatus = q.outreachStatus.trim();
    }

    const s = q.search?.trim();
    if (s) {
      where.OR = [
        { fullName: { contains: s, mode: 'insensitive' } },
        { companyName: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s, mode: 'insensitive' } },
        { city: { contains: s, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.ImportedBrokerContactOrderByWithRelationInput[] =
      q.sort === 'lastSeen_asc'
        ? [{ lastSeenAt: 'asc' }]
        : q.sort === 'listings_asc'
          ? [{ listingCount: 'asc' }]
          : q.sort === 'listings_desc'
            ? [{ listingCount: 'desc' }]
            : [{ lastSeenAt: 'desc' }];

    const [items, total] = await this.prisma.$transaction([
      this.prisma.importedBrokerContact.findMany({
        where,
        orderBy,
        skip,
        take,
      }),
      this.prisma.importedBrokerContact.count({ where }),
    ]);

    return { items, total, skip, take };
  }

  async getOne(id: string) {
    const row = await this.prisma.importedBrokerContact.findUnique({
      where: { id },
      include: {
        listings: {
          orderBy: { createdAt: 'desc' },
          include: {
            property: {
              select: {
                id: true,
                title: true,
                city: true,
                price: true,
                importSourceUrl: true,
                importExternalId: true,
                importSource: true,
                approved: true,
                deletedAt: true,
              },
            },
          },
        },
      },
    });
    if (!row) throw new NotFoundException(`Broker contact "${id}" not found`);
    return row;
  }

  async patch(
    id: string,
    body: {
      notes?: string | null;
      outreachStatus?: string | null;
      outreachNote?: string | null;
      status?: string | null;
      profileCreated?: boolean;
      invitedAt?: string | null;
      fullName?: string | null;
      companyName?: string | null;
      website?: string | null;
    },
  ) {
    const data: Prisma.ImportedBrokerContactUpdateInput = {};
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.outreachStatus !== undefined && body.outreachStatus != null) {
      data.outreachStatus = body.outreachStatus.trim().slice(0, 64);
    }
    if (body.outreachNote !== undefined) data.outreachNote = body.outreachNote;
    if (body.status !== undefined && body.status != null) {
      data.status = body.status.trim().slice(0, 32);
    }
    if (body.profileCreated !== undefined) data.profileCreated = body.profileCreated;
    if (body.invitedAt !== undefined) {
      data.invitedAt = body.invitedAt ? new Date(body.invitedAt) : null;
    }
    if (body.fullName !== undefined && body.fullName != null) {
      data.fullName = body.fullName.trim().slice(0, 200);
    }
    if (body.companyName !== undefined && body.companyName != null) {
      data.companyName = body.companyName.trim().slice(0, 200);
    }
    if (body.website !== undefined) data.website = body.website?.trim() || null;

    try {
      return await this.prisma.importedBrokerContact.update({
        where: { id },
        data,
      });
    } catch {
      throw new NotFoundException(`Broker contact "${id}" not found`);
    }
  }

  async bulkUpdate(
    ids: string[],
    patch: {
      outreachStatus?: string;
      status?: string;
      profileCreated?: boolean;
    },
  ) {
    const data: Prisma.ImportedBrokerContactUpdateManyMutationInput = {};
    if (patch.outreachStatus != null) data.outreachStatus = patch.outreachStatus;
    if (patch.status != null) data.status = patch.status;
    if (patch.profileCreated !== undefined) data.profileCreated = patch.profileCreated;

    const res = await this.prisma.importedBrokerContact.updateMany({
      where: { id: { in: ids } },
      data,
    });
    return { updated: res.count };
  }

  toCsvRow(c: {
    fullName: string;
    companyName: string;
    email: string | null;
    phone: string | null;
    sourcePortal: string | null;
    listingCount: number;
    status: string;
    profileCreated: boolean;
    outreachStatus: string;
    lastSeenAt: Date;
    sourceUrl: string | null;
    city: string | null;
    notes: string | null;
  }): string {
    const esc = (v: string | null | undefined) => {
      const t = (v ?? '').replace(/"/g, '""');
      return `"${t}"`;
    };
    return [
      esc(c.fullName),
      esc(c.companyName),
      esc(c.email),
      esc(c.phone),
      esc(c.sourcePortal),
      c.listingCount,
      esc(c.status),
      c.profileCreated ? '1' : '0',
      esc(c.outreachStatus),
      esc(c.lastSeenAt.toISOString()),
      esc(c.sourceUrl),
      esc(c.city),
      esc(c.notes),
    ].join(',');
  }

  csvHeader(): string {
    return [
      'fullName',
      'companyName',
      'email',
      'phone',
      'sourcePortal',
      'listingCount',
      'status',
      'profileCreated',
      'outreachStatus',
      'lastSeenAt',
      'sourceUrl',
      'city',
      'notes',
    ].join(',');
  }

  async listForExport(q: ListImportedBrokerContactsQuery) {
    const take = 10_000;
    const { items } = await this.list({ ...q, skip: 0, take });
    return items;
  }
}
