import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  CompanyContactSourceType,
  CompanyContactStatus,
  CompanyProviderJobStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CompanyAuditService } from './company-audit.service';
import {
  COMPANY_CONTACT_DISCOVERY_ENABLED,
  CONTACT_DISCOVERY_BATCH_SIZE,
  CONTACT_DISCOVERY_DELAY_MS,
  ARES_WORKER_TICK_MS,
} from './company-directory.constants';
import { computeJobProgress } from './company-job-progress.util';

const PREFERRED_PREFIXES = ['info@', 'kontakt@', 'office@', 'obchod@', 'recepce@'];

@Injectable()
export class CompanyContactDiscoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CompanyContactDiscoveryService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: CompanyAuditService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), ARES_WORKER_TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async discoverForCompany(companyId: string) {
    if (!COMPANY_CONTACT_DISCOVERY_ENABLED) {
      throw new BadRequestException('Contact discovery je vypnuté.');
    }

    const company = await this.prisma.companyDirectoryEntry.findUnique({ where: { id: companyId } });
    if (!company) throw new BadRequestException('Firma nenalezena.');

    await this.prisma.companyDirectoryEntry.update({
      where: { id: companyId },
      data: { contactDiscoveryState: 'SEARCHING' },
    });

    const website = company.website?.trim();
    if (!website) {
      await this.prisma.companyDirectoryEntry.update({
        where: { id: companyId },
        data: { contactDiscoveryState: 'NOT_FOUND' },
      });
      return { found: false, reason: 'Firma nemá web.', state: 'NOT_FOUND' };
    }

    const result = await this.fetchEmailsFromWebsite(website);
    if (result.emails.length === 0) {
      await this.prisma.companyDirectoryEntry.update({
        where: { id: companyId },
        data: { contactDiscoveryState: 'NOT_FOUND' },
      });
      await this.audit.log({
        companyId,
        action: 'CONTACT_DISCOVERY',
        message: 'Kontakt nenalezen na webu',
      });
      return { found: false, state: 'NOT_FOUND' };
    }

    const best = result.emails[0];
    const status =
      best.confidence >= 0.9
        ? CompanyContactStatus.FOUND_HIGH_CONFIDENCE
        : best.confidence >= 0.7
          ? CompanyContactStatus.FOUND_MEDIUM_CONFIDENCE
          : CompanyContactStatus.REVIEW_REQUIRED;

    const discoveryState =
      status === CompanyContactStatus.REVIEW_REQUIRED ? 'REVIEW_REQUIRED' : 'FOUND';

    const contact = await this.prisma.companyContact.create({
      data: {
        companyId,
        email: best.email,
        phone: result.phone,
        website: result.website,
        sourceUrl: best.sourceUrl,
        sourceType: CompanyContactSourceType.OFFICIAL_WEBSITE,
        confidence: best.confidence,
        status,
      },
    });

    await this.prisma.companyDirectoryEntry.update({
      where: { id: companyId },
      data: { contactDiscoveryState: discoveryState },
    });

    await this.audit.log({
      companyId,
      action: 'CONTACT_DISCOVERY',
      message: `Nalezen email ${best.email} (${Math.round(best.confidence * 100)}%)`,
    });

    return { found: true, contact, state: discoveryState };
  }

  async getContactDetail(companyId: string) {
    const company = await this.prisma.companyDirectoryEntry.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        website: true,
        verifiedBusinessEmail: true,
        contactDiscoveryState: true,
      },
    });
    if (!company) throw new BadRequestException('Firma nenalezena.');

    const contacts = await this.prisma.companyContact.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const latest = contacts[0] ?? null;
    return {
      companyId,
      state: company.contactDiscoveryState,
      verifiedBusinessEmail: company.verifiedBusinessEmail,
      latestContact: latest
        ? {
            id: latest.id,
            email: latest.email,
            phone: latest.phone,
            website: latest.website,
            sourceUrl: latest.sourceUrl,
            sourceType: latest.sourceType,
            confidence: latest.confidence,
            status: latest.status,
            discoveredAt: latest.discoveredAt.toISOString(),
            verifiedAt: latest.verifiedAt?.toISOString() ?? null,
          }
        : null,
      contacts,
    };
  }

  async confirmContact(contactId: string, adminUserId?: string) {
    const contact = await this.prisma.companyContact.update({
      where: { id: contactId },
      data: {
        status: CompanyContactStatus.VERIFIED,
        verifiedAt: new Date(),
      },
    });

    await this.prisma.companyDirectoryEntry.update({
      where: { id: contact.companyId },
      data: { verifiedBusinessEmail: contact.email, contactDiscoveryState: 'VERIFIED' },
    });

    await this.audit.log({
      companyId: contact.companyId,
      action: 'CONTACT_DISCOVERY',
      message: `Admin potvrdil kontakt ${contact.email}`,
      actorUserId: adminUserId,
    });

    return contact;
  }

  async rejectContact(contactId: string, adminUserId?: string) {
    const contact = await this.prisma.companyContact.update({
      where: { id: contactId },
      data: { status: CompanyContactStatus.REJECTED },
    });
    await this.audit.log({
      companyId: contact.companyId,
      action: 'CONTACT_DISCOVERY',
      message: `Admin odmítl kontakt ${contact.email}`,
      actorUserId: adminUserId,
    });
    return contact;
  }

  async startBatch(input: { companyIds?: string[]; limit?: number }) {
    if (!COMPANY_CONTACT_DISCOVERY_ENABLED) {
      throw new BadRequestException('Contact discovery je vypnuté.');
    }

    let companyIds = input.companyIds ?? [];
    if (companyIds.length === 0) {
      const rows = await this.prisma.companyDirectoryEntry.findMany({
        where: { verifiedBusinessEmail: null, website: { not: null } },
        take: Math.min(input.limit ?? 1, 5),
        select: { id: true },
      });
      companyIds = rows.map((r) => r.id);
    }

    return this.prisma.companyContactDiscoveryBatch.create({
      data: {
        companyIds,
        totalExpected: companyIds.length,
        batchSize: CONTACT_DISCOVERY_BATCH_SIZE,
        delayMs: CONTACT_DISCOVERY_DELAY_MS,
        status: CompanyProviderJobStatus.PENDING,
      },
    });
  }

  async listBatches() {
    const rows = await this.prisma.companyContactDiscoveryBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map((b) => ({
      ...b,
      progress: computeJobProgress(b.processed, b.totalExpected, b.startedAt),
    }));
  }

  private async tick() {
    if (this.processing || !COMPANY_CONTACT_DISCOVERY_ENABLED) return;
    const batch = await this.prisma.companyContactDiscoveryBatch.findFirst({
      where: {
        status: { in: [CompanyProviderJobStatus.PENDING, CompanyProviderJobStatus.RUNNING] },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!batch) return;

    this.processing = true;
    try {
      const batchSize = batch.batchSize ?? CONTACT_DISCOVERY_BATCH_SIZE;
      const delayMs = batch.delayMs ?? CONTACT_DISCOVERY_DELAY_MS;
      const slice = batch.companyIds.slice(batch.lastCursor, batch.lastCursor + batchSize);

      if (slice.length === 0) {
        await this.prisma.companyContactDiscoveryBatch.update({
          where: { id: batch.id },
          data: { status: CompanyProviderJobStatus.COMPLETED, finishedAt: new Date() },
        });
        return;
      }

      let processed = batch.processed;
      let found = batch.found;
      let notFound = batch.notFound;
      let needsReview = batch.needsReview;
      let failed = batch.failed;

      for (const companyId of slice) {
        try {
          const result = await this.discoverForCompany(companyId);
          processed += 1;
          if (result.found) {
            if (result.contact?.status === CompanyContactStatus.REVIEW_REQUIRED) needsReview += 1;
            else found += 1;
          } else {
            notFound += 1;
          }
        } catch {
          failed += 1;
          processed += 1;
        }
        await new Promise((r) => setTimeout(r, delayMs));
      }

      const next = batch.lastCursor + slice.length;
      const done = next >= batch.companyIds.length;

      await this.prisma.companyContactDiscoveryBatch.update({
        where: { id: batch.id },
        data: {
          processed,
          found,
          notFound,
          needsReview,
          failed,
          lastCursor: next,
          lastActivityAt: new Date(),
          status: done ? CompanyProviderJobStatus.COMPLETED : CompanyProviderJobStatus.PENDING,
          finishedAt: done ? new Date() : null,
          startedAt: batch.startedAt ?? new Date(),
        },
      });
    } finally {
      this.processing = false;
    }
  }

  private async fetchEmailsFromWebsite(website: string) {
    const base = website.startsWith('http') ? website : `https://${website}`;
    const urls = [base, `${base.replace(/\/$/, '')}/kontakt`, `${base.replace(/\/$/, '')}/contact`];
    const emails: Array<{ email: string; sourceUrl: string; confidence: number }> = [];
    let phone: string | undefined;
    let resolvedWebsite = base;

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'XXREALIT-ContactDiscovery/1.0' },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) continue;
        const html = await res.text();
        const found = extractEmails(html);
        if (!phone) phone = extractPhone(html);
        for (const email of found) {
          emails.push({
            email,
            sourceUrl: url,
            confidence: scoreEmail(email),
          });
        }
      } catch {
        /* ignore fetch errors */
      }
    }

    emails.sort((a, b) => b.confidence - a.confidence);
    const unique = new Map<string, (typeof emails)[number]>();
    for (const row of emails) {
      if (!unique.has(row.email)) unique.set(row.email, row);
    }

    return { emails: [...unique.values()], phone, website: resolvedWebsite };
  }
}

function extractEmails(html: string): string[] {
  const matches = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  return [...new Set(matches.map((e) => e.toLowerCase()))].filter(
    (e) => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.includes('example.com'),
  );
}

function scoreEmail(email: string): number {
  const lower = email.toLowerCase();
  if (PREFERRED_PREFIXES.some((p) => lower.startsWith(p))) return 0.95;
  if (lower.startsWith('mail@')) return 0.85;
  if (/^[a-z]+\.[a-z]+@/.test(lower)) return 0.45;
  return 0.6;
}

function extractPhone(html: string): string | undefined {
  const match = html.match(/(?:\+420\s?)?(?:\d{3}\s?){3}/);
  return match?.[0]?.trim();
}
