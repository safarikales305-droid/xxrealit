import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { normalizeToE164 } from '../whatsapp/whatsapp-phone.util';
import type { RealitniEsoParsedContact } from './directory-import.types';

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

function normNormalizedPhone(v: string | null | undefined): string | null {
  const raw = normPhone(v);
  if (!raw) return null;
  return normalizeToE164(raw);
}

function meaningfulName(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  if (t.length < 2) return null;
  if (/^reality\.cz import$/i.test(t)) return null;
  return t.slice(0, 200);
}

/** Formát z importu: „makléř · kancelář“. */
function splitImportedContactDisplay(contactName: string): { person: string; companyFromField: string } {
  const t = (contactName ?? '').trim();
  const sep = ' · ';
  const i = t.indexOf(sep);
  if (i === -1) return { person: t, companyFromField: '' };
  return { person: t.slice(0, i).trim(), companyFromField: t.slice(i + sep.length).trim() };
}

export type ListImportedBrokerContactsQuery = {
  search?: string;
  portal?: string;
  hasEmail?: boolean;
  hasPhone?: boolean;
  profileCreated?: boolean;
  outreachStatus?: string;
  contactStatus?: string;
  sort?: 'lastSeen_desc' | 'lastSeen_asc' | 'listings_desc' | 'listings_asc';
  skip?: number;
  take?: number;
};

export type DirectoryImportUpsertResult = {
  action: 'created' | 'updated' | 'duplicate';
  id: string;
};

@Injectable()
export class ImportedBrokerContactService {
  private readonly logger = new Logger(ImportedBrokerContactService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Po uložení importovaného inzerátu — párování podle e-mailu, pak telefonu, jinak nový neúplný záznam.
   * Nikdy nevyhodí výjimku ven (import musí doběhnout).
   */
  async syncFromImportedProperty(
    propertyId: string,
  ): Promise<'created' | 'updated' | 'skipped'> {
    try {
      return await this.syncFromImportedPropertyInner(propertyId);
    } catch (e) {
      this.logger.warn(
        `syncFromImportedProperty failed propertyId=${propertyId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return 'skipped';
    }
  }

  private async syncFromImportedPropertyInner(
    propertyId: string,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) return 'skipped';
    if (!property.importSource || !property.importExternalId) return 'skipped';

    const email = normEmail(property.contactEmail);
    const phone = normPhone(property.contactPhone);
    const { person, companyFromField } = splitImportedContactDisplay(property.contactName ?? '');
    const name = meaningfulName(person) ?? '';
    const listingUrl = property.importSourceUrl?.trim() || null;
    const portal =
      (property.sourcePortalKey ?? '').trim() ||
      (property.importSource ? String(property.importSource) : '') ||
      null;
    const portalLabel = (property.sourcePortalLabel ?? '').trim() || null;
    const city = (property.city ?? '').trim() || null;
    const companyFromPortal =
      portalLabel && !name.toLowerCase().includes(portalLabel.toLowerCase())
        ? portalLabel.slice(0, 200)
        : '';
    const company = (companyFromField || companyFromPortal).slice(0, 200);

    const parsedLog = {
      propertyId,
      email: Boolean(email),
      phone: Boolean(phone),
      nameLen: name.length,
      companyLen: company.length,
      listingUrl: Boolean(listingUrl),
    };
    this.logger.log(`[broker-contact] contact parsed ${JSON.stringify(parsedLog)}`);

    const hasNameAndUrl = name.length >= 2 && Boolean(listingUrl);
    const hasNameCompanyUrl = name.length >= 2 && company.length >= 2 && Boolean(listingUrl);
    if (!email && !phone && !hasNameAndUrl && !hasNameCompanyUrl) {
      this.logger.log(
        `[broker-contact] skip propertyId=${propertyId} (no email/phone and no name+url)`,
      );
      return 'skipped';
    }

    let outcome: 'created' | 'updated' = 'updated';
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
        outcome = 'created';
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
    return outcome;
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
    if (q.contactStatus?.trim()) {
      where.contactStatus = q.contactStatus.trim();
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

  async delete(id: string) {
    try {
      await this.prisma.importedBrokerContact.delete({ where: { id } });
      return { deleted: true };
    } catch {
      throw new NotFoundException(`Broker contact "${id}" not found`);
    }
  }

  async upsertFromDirectoryImport(
    parsed: RealitniEsoParsedContact,
    sourcePortal: string,
  ): Promise<DirectoryImportUpsertResult> {
    const now = new Date();
    const email = normEmail(parsed.email);
    const phone = normPhone(parsed.phone);
    const normalizedPhone = parsed.normalizedPhone ?? normNormalizedPhone(phone);
    const sourceUrl = parsed.sourceUrl?.trim().slice(0, 500) || null;
    const companyName = (parsed.companyName ?? '').trim().slice(0, 200) || 'Neznámá RK';

    const existing =
      (email ? await this.prisma.importedBrokerContact.findFirst({ where: { email } }) : null) ??
      (normalizedPhone
        ? await this.prisma.importedBrokerContact.findFirst({ where: { normalizedPhone } })
        : null) ??
      (sourceUrl
        ? await this.prisma.importedBrokerContact.findFirst({ where: { sourceUrl } })
        : null);

    const data = {
      fullName: companyName,
      companyName,
      email,
      phone,
      normalizedPhone,
      website: parsed.website?.trim().slice(0, 300) || null,
      address: parsed.address?.trim().slice(0, 300) || null,
      city: parsed.city?.trim().slice(0, 120) || null,
      sourcePortal: sourcePortal.trim().slice(0, 64) || 'realitnieso.cz',
      sourceUrl,
      lastSeenAt: now,
      lastCheckedAt: now,
      importedAt: now,
      listingCount: parsed.listingCount ?? 0,
      status: !email && !phone ? 'INCOMPLETE' : 'ACTIVE',
    };

    if (!existing) {
      const created = await this.prisma.importedBrokerContact.create({
        data: {
          ...data,
          contactStatus: 'NEW',
          firstSeenAt: now,
        },
      });
      return { action: 'created', id: created.id };
    }

    const isDuplicate =
      Boolean(email && existing.email === email) ||
      Boolean(normalizedPhone && existing.normalizedPhone === normalizedPhone) ||
      Boolean(sourceUrl && existing.sourceUrl === sourceUrl);

    const updated = await this.prisma.importedBrokerContact.update({
      where: { id: existing.id },
      data: {
        fullName: existing.fullName?.trim() ? existing.fullName : data.fullName,
        companyName: data.companyName || existing.companyName,
        email: email ?? existing.email,
        phone: phone ?? existing.phone,
        normalizedPhone: normalizedPhone ?? existing.normalizedPhone,
        website: data.website ?? existing.website,
        address: data.address ?? existing.address,
        city: data.city ?? existing.city,
        sourcePortal: existing.sourcePortal ?? data.sourcePortal,
        sourceUrl: sourceUrl ?? existing.sourceUrl,
        lastSeenAt: now,
        lastCheckedAt: now,
        importedAt: existing.importedAt ?? now,
        listingCount: Math.max(existing.listingCount, data.listingCount),
        status:
          existing.status === 'INCOMPLETE' && (email || phone) ? 'ACTIVE' : existing.status,
      },
    });

    return { action: isDuplicate ? 'updated' : 'updated', id: updated.id };
  }

  async listWhatsAppEligible(
    q: ListImportedBrokerContactsQuery & {
      mode: 'selected_ids' | 'filtered' | 'all_imported';
      selectedContactIds?: string[];
    },
  ) {
    const blocked = ['INVALID', 'BLOCKED', 'UNSUBSCRIBED'];
    const where: Prisma.ImportedBrokerContactWhereInput = {
      normalizedPhone: { not: null },
      contactStatus: { notIn: blocked },
    };

    if (q.mode === 'selected_ids' && q.selectedContactIds?.length) {
      where.id = { in: [...new Set(q.selectedContactIds)] };
    } else if (q.mode === 'filtered') {
      const listWhere = this.buildListWhere(q);
      Object.assign(where, listWhere);
      where.normalizedPhone = { not: null };
      where.contactStatus = { notIn: blocked };
    }

    const rows = await this.prisma.importedBrokerContact.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        companyName: true,
        normalizedPhone: true,
        contactStatus: true,
      },
      take: 5000,
    });
    return rows.filter((r) => r.normalizedPhone && isValidWaPhone(r.normalizedPhone));
  }

  private buildListWhere(q: ListImportedBrokerContactsQuery): Prisma.ImportedBrokerContactWhereInput {
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
    if (q.outreachStatus?.trim()) where.outreachStatus = q.outreachStatus.trim();
    if (q.contactStatus?.trim()) where.contactStatus = q.contactStatus.trim();
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
    return where;
  }

  async patch(
    id: string,
    body: {
      notes?: string | null;
      outreachStatus?: string | null;
      outreachNote?: string | null;
      status?: string | null;
      contactStatus?: string | null;
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
    if (body.contactStatus !== undefined && body.contactStatus != null) {
      data.contactStatus = body.contactStatus.trim().slice(0, 32);
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
      contactStatus?: string;
      profileCreated?: boolean;
    },
  ) {
    const data: Prisma.ImportedBrokerContactUpdateManyMutationInput = {};
    if (patch.outreachStatus != null) data.outreachStatus = patch.outreachStatus;
    if (patch.status != null) data.status = patch.status;
    if (patch.contactStatus != null) data.contactStatus = patch.contactStatus;
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
    normalizedPhone: string | null;
    sourcePortal: string | null;
    listingCount: number;
    status: string;
    contactStatus: string;
    profileCreated: boolean;
    outreachStatus: string;
    lastSeenAt: Date;
    sourceUrl: string | null;
    city: string | null;
    address: string | null;
    website: string | null;
    importedAt: Date | null;
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
      esc(c.normalizedPhone),
      esc(c.sourcePortal),
      c.listingCount,
      esc(c.status),
      esc(c.contactStatus),
      c.profileCreated ? '1' : '0',
      esc(c.outreachStatus),
      esc(c.lastSeenAt.toISOString()),
      esc(c.sourceUrl),
      esc(c.city),
      esc(c.address),
      esc(c.website),
      esc(c.importedAt?.toISOString() ?? null),
      esc(c.notes),
    ].join(',');
  }

  csvHeader(): string {
    return [
      'fullName',
      'companyName',
      'email',
      'phone',
      'normalizedPhone',
      'sourcePortal',
      'listingCount',
      'status',
      'contactStatus',
      'profileCreated',
      'outreachStatus',
      'lastSeenAt',
      'sourceUrl',
      'city',
      'address',
      'website',
      'importedAt',
      'notes',
    ].join(',');
  }

  async listForExport(q: ListImportedBrokerContactsQuery) {
    const take = 10_000;
    const { items } = await this.list({ ...q, skip: 0, take });
    return items;
  }
}

function isValidWaPhone(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone.trim());
}
