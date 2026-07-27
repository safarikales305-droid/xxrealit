import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AiSalesPartnerType,
  AiSalesProspectStatus,
  AiSalesVerificationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AiSalesSuppressionService } from './ai-sales-suppression.service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class AiSalesProspectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly suppression: AiSalesSuppressionService,
  ) {}

  async list(filters?: {
    status?: AiSalesProspectStatus;
    partnerType?: AiSalesPartnerType;
    q?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: Prisma.AiSalesProspectWhereInput = {
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.partnerType ? { partnerType: filters.partnerType } : {}),
      ...(filters?.q
        ? {
            OR: [
              { companyName: { contains: filters.q, mode: 'insensitive' } },
              { email: { contains: filters.q, mode: 'insensitive' } },
              { city: { contains: filters.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.aiSalesProspect.findMany({
      where,
      orderBy: [{ fitScore: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(100, filters?.limit ?? 50),
      skip: filters?.offset ?? 0,
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        publicContacts: {
          select: {
            id: true,
            type: true,
            value: true,
            isPrimary: true,
            isSelectedForOutreach: true,
            verificationStatus: true,
          },
        },
        _count: { select: { messages: true, leads: true, publicContacts: true } },
      },
    });
  }

  async getById(id: string) {
    const row = await this.prisma.aiSalesProspect.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 20 },
        leads: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!row) throw new NotFoundException('Kontakt nenalezen.');
    return row;
  }

  async create(
    data: {
      partnerType: AiSalesPartnerType;
      companyName: string;
      contactName?: string;
      position?: string;
      email?: string;
      phone?: string;
      website?: string;
      city?: string;
      region?: string;
      serviceArea?: string;
      specialization?: string;
      companySize?: string;
      source?: string;
      sourceUrl?: string;
      sourceNote?: string;
      publicInfo?: string;
      notes?: string;
      status?: AiSalesProspectStatus;
      verificationStatus?: AiSalesVerificationStatus;
    },
    userId?: string,
  ) {
    if (data.email && !EMAIL_RE.test(data.email)) {
      throw new BadRequestException('Neplatný e-mail.');
    }

    await this.assertNoDuplicate({
      email: typeof data.email === 'string' ? data.email : undefined,
      companyName: data.companyName,
      website: typeof data.website === 'string' ? data.website : undefined,
    });

    if (data.email) {
      const sup = await this.suppression.isSuppressed(data.email);
      if (sup.suppressed) {
        throw new ConflictException(`E-mail je v seznamu zákazu kontaktování: ${sup.reason}`);
      }
    }

    return this.prisma.aiSalesProspect.create({
      data: {
        partnerType: data.partnerType,
        companyName: data.companyName,
        contactName: data.contactName,
        position: data.position,
        email: data.email?.toLowerCase(),
        phone: data.phone,
        website: data.website,
        city: data.city,
        region: data.region,
        serviceArea: data.serviceArea,
        specialization: data.specialization,
        companySize: data.companySize,
        source: data.source ?? 'MANUAL',
        sourceUrl: data.sourceUrl,
        sourceNote: data.sourceNote,
        publicInfo: data.publicInfo,
        notes: data.notes,
        createdById: userId,
        status: data.status ?? AiSalesProspectStatus.NEW,
        verificationStatus: data.verificationStatus ?? AiSalesVerificationStatus.UNVERIFIED,
      },
    });
  }

  async update(id: string, data: Prisma.AiSalesProspectUpdateInput) {
    await this.getById(id);
    if (typeof data.email === 'string' && data.email && !EMAIL_RE.test(data.email)) {
      throw new BadRequestException('Neplatný e-mail.');
    }
    return this.prisma.aiSalesProspect.update({ where: { id }, data });
  }

  async approve(id: string) {
    return this.prisma.aiSalesProspect.update({
      where: { id },
      data: { status: AiSalesProspectStatus.APPROVED },
    });
  }

  async reject(id: string, reason?: string) {
    return this.prisma.aiSalesProspect.update({
      where: { id },
      data: {
        status: AiSalesProspectStatus.REJECTED,
        notes: reason,
      },
    });
  }

  async markDoNotContact(id: string, reason?: string, userId?: string) {
    const prospect = await this.getById(id);
    if (prospect.email) {
      await this.suppression.addSuppression({
        email: prospect.email,
        reason: reason ?? 'MANUAL_DO_NOT_CONTACT',
        source: 'ADMIN',
      });
    }
    return this.prisma.aiSalesProspect.update({
      where: { id },
      data: {
        doNotContact: true,
        doNotContactReason: reason ?? 'MANUAL',
        status: AiSalesProspectStatus.DO_NOT_CONTACT,
      },
    });
  }

  async importPreview(rows: Array<Record<string, string>>) {
    const results = {
      total: rows.length,
      valid: [] as Array<Record<string, unknown>>,
      invalid: [] as Array<{ row: number; errors: string[] }>,
      duplicates: [] as Array<{ row: number; reason: string }>,
      suppressed: [] as Array<{ row: number; email: string }>,
    };

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const errors: string[] = [];
      const companyName = (r.firma ?? r.company ?? r.companyName ?? '').trim();
      const email = (r.email ?? r['e-mail'] ?? '').trim().toLowerCase();
      const partnerType = (r.typ ?? r.partnerType ?? 'OTHER').trim().toUpperCase();

      if (!companyName) errors.push('Chybí název firmy.');
      if (email && !EMAIL_RE.test(email)) errors.push('Neplatný e-mail.');

      if (errors.length) {
        results.invalid.push({ row: i + 1, errors });
        continue;
      }

      if (email) {
        const sup = await this.suppression.isSuppressed(email);
        if (sup.suppressed) {
          results.suppressed.push({ row: i + 1, email });
          continue;
        }
        const dup = await this.prisma.aiSalesProspect.findFirst({ where: { email } });
        if (dup) {
          results.duplicates.push({ row: i + 1, reason: 'Stejný e-mail již existuje.' });
          continue;
        }
      }

      const dupCompany = await this.prisma.aiSalesProspect.findFirst({
        where: { companyName: { equals: companyName, mode: 'insensitive' } },
      });
      if (dupCompany) {
        results.duplicates.push({ row: i + 1, reason: 'Firma již existuje.' });
        continue;
      }

      results.valid.push({
        row: i + 1,
        partnerType,
        companyName,
        contactName: (r.jmeno ?? r.name ?? r.contactName ?? '').trim() || null,
        email: email || null,
        phone: (r.telefon ?? r.phone ?? '').trim() || null,
        website: (r.web ?? r.website ?? '').trim() || null,
        city: (r.mesto ?? r.city ?? '').trim() || null,
        region: (r.kraj ?? r.region ?? '').trim() || null,
        source: (r.zdroj ?? r.source ?? 'CSV_IMPORT').trim(),
        sourceNote: (r.poznamka ?? r.note ?? '').trim() || null,
      });
    }

    return results;
  }

  async importValid(
    rows: Array<Record<string, unknown>>,
    userId?: string,
  ) {
    let imported = 0;
    for (const r of rows) {
      try {
        await this.create(
          {
            partnerType: (r.partnerType as AiSalesPartnerType) ?? AiSalesPartnerType.OTHER,
            companyName: String(r.companyName),
            contactName: r.contactName ? String(r.contactName) : undefined,
            email: r.email ? String(r.email) : undefined,
            phone: r.phone ? String(r.phone) : undefined,
            website: r.website ? String(r.website) : undefined,
            city: r.city ? String(r.city) : undefined,
            region: r.region ? String(r.region) : undefined,
            source: r.source ? String(r.source) : 'CSV_IMPORT',
            sourceNote: r.sourceNote ? String(r.sourceNote) : undefined,
          },
          userId,
        );
        imported++;
      } catch {
        // skip row on conflict
      }
    }
    return { imported, total: rows.length };
  }

  private async assertNoDuplicate(input: {
    email?: string;
    companyName: string;
    website?: string;
  }) {
    if (input.email) {
      const byEmail = await this.prisma.aiSalesProspect.findFirst({
        where: { email: input.email.toLowerCase() },
      });
      if (byEmail) {
        throw new ConflictException('Kontakt se stejným e-mailem již existuje.');
      }
    }

    const byCompany = await this.prisma.aiSalesProspect.findFirst({
      where: { companyName: { equals: input.companyName, mode: 'insensitive' } },
    });
    if (byCompany) {
      throw new ConflictException('Kontakt se stejným názvem firmy již existuje.');
    }

    if (input.website) {
      const byWeb = await this.prisma.aiSalesProspect.findFirst({
        where: { website: input.website },
      });
      if (byWeb) {
        throw new ConflictException('Kontakt se stejným webem již existuje.');
      }
    }
  }
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(/[;,]/).map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const cols = line.split(/[;,]/).map((c) => c.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    return row;
  });
}

export { parseCsv, EMAIL_RE };
