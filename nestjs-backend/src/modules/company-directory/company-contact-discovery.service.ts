import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  CompanyContactDiscoveryEntryState,
  CompanyContactSourceType,
  CompanyContactStatus,
  CompanyDirectoryCategory,
  CompanyContactDiscoveryStatus,
  CompanyProviderJobStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CompanyAuditService } from './company-audit.service';
import {
  COMPANY_CONTACT_DISCOVERY_ENABLED,
  CONTACT_DISCOVERY_BATCH_SIZE,
  CONTACT_DISCOVERY_CONCURRENCY,
  CONTACT_DISCOVERY_DELAY_MS,
  ARES_WORKER_TICK_MS,
} from './company-directory.constants';
import { computeJobProgress } from './company-job-progress.util';

const PREFERRED_PREFIXES = ['info@', 'kontakt@', 'office@', 'obchod@', 'recepce@'];
const BLOCKED_REQUEUE: CompanyContactDiscoveryEntryState[] = [
  'QUEUED',
  'SEARCHING',
  'FOUND',
  'REVIEW_REQUIRED',
  'VERIFIED',
];

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
    void this.recoverStaleJobs();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** HTTP: zařadí firmu do fronty, neprovádí research synchronně. */
  async enqueueDiscover(companyId: string, options?: { force?: boolean }) {
    if (!COMPANY_CONTACT_DISCOVERY_ENABLED) {
      throw new BadRequestException('Contact discovery je vypnuté.');
    }

    const company = await this.prisma.companyDirectoryEntry.findUnique({ where: { id: companyId } });
    if (!company) throw new BadRequestException('Firma nenalezena.');

    if (
      !options?.force &&
      BLOCKED_REQUEUE.includes(company.contactDiscoveryState)
    ) {
      return { queued: false, state: company.contactDiscoveryState, reason: 'already_active_or_found' };
    }

    const batch = await this.prisma.companyContactDiscoveryBatch.create({
      data: {
        label: `Jednotlivě: ${company.name}`,
        companyIds: [companyId],
        totalExpected: 1,
        queued: 1,
        batchSize: 1,
        delayMs: CONTACT_DISCOVERY_DELAY_MS,
        status: CompanyProviderJobStatus.PENDING,
      },
    });

    await this.prisma.companyContactDiscoveryJob.create({
      data: {
        companyId,
        batchId: batch.id,
        website: company.website,
        status: CompanyContactDiscoveryStatus.PENDING,
      },
    });

    await this.prisma.companyDirectoryEntry.update({
      where: { id: companyId },
      data: { contactDiscoveryState: 'QUEUED' },
    });

    return { queued: true, state: 'QUEUED' as const, batchId: batch.id };
  }

  async discoverForCompany(companyId: string) {
    return this.enqueueDiscover(companyId);
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
    const activeJob = await this.prisma.companyContactDiscoveryJob.findFirst({
      where: {
        companyId,
        status: { in: [CompanyContactDiscoveryStatus.PENDING, CompanyContactDiscoveryStatus.RUNNING] },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      companyId,
      state: company.contactDiscoveryState,
      verifiedBusinessEmail: company.verifiedBusinessEmail,
      activeJobId: activeJob?.id ?? null,
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
    await this.prisma.companyDirectoryEntry.update({
      where: { id: contact.companyId },
      data: { contactDiscoveryState: 'NOT_FOUND' },
    });
    await this.audit.log({
      companyId: contact.companyId,
      action: 'CONTACT_DISCOVERY',
      message: `Admin odmítl kontakt ${contact.email}`,
      actorUserId: adminUserId,
    });
    return contact;
  }

  async startBatch(input: {
    companyIds?: string[];
    limit?: number;
    label?: string;
    filter?: {
      category?: CompanyDirectoryCategory;
      region?: string;
      city?: string;
      q?: string;
    };
    force?: boolean;
  }) {
    if (!COMPANY_CONTACT_DISCOVERY_ENABLED) {
      throw new BadRequestException('Contact discovery je vypnuté.');
    }

    let companyIds = input.companyIds ?? [];
    if (companyIds.length === 0 && input.filter) {
      const where: Prisma.CompanyDirectoryEntryWhereInput = { publicProfile: true };
      if (input.filter.category) where.categories = { has: input.filter.category };
      if (input.filter.region?.trim()) where.region = { contains: input.filter.region.trim(), mode: 'insensitive' };
      if (input.filter.city?.trim()) where.city = { contains: input.filter.city.trim(), mode: 'insensitive' };
      if (input.filter.q?.trim()) {
        where.OR = [
          { name: { contains: input.filter.q.trim(), mode: 'insensitive' } },
          { ico: { contains: input.filter.q.trim() } },
        ];
      }
      if (!input.force) {
        where.contactDiscoveryState = { notIn: BLOCKED_REQUEUE };
      }
      const rows = await this.prisma.companyDirectoryEntry.findMany({
        where,
        take: Math.min(input.limit ?? 500, 2000),
        select: { id: true },
        orderBy: { updatedAt: 'desc' },
      });
      companyIds = rows.map((r) => r.id);
    }

    if (companyIds.length === 0) {
      throw new BadRequestException('Žádné firmy k dohledání kontaktu.');
    }

    const batch = await this.prisma.companyContactDiscoveryBatch.create({
      data: {
        label: input.label ?? `Bulk ${companyIds.length} firem`,
        companyIds,
        totalExpected: companyIds.length,
        queued: companyIds.length,
        batchSize: CONTACT_DISCOVERY_BATCH_SIZE,
        delayMs: CONTACT_DISCOVERY_DELAY_MS,
        filterJson: input.filter ? (input.filter as Prisma.InputJsonValue) : undefined,
        status: CompanyProviderJobStatus.PENDING,
      },
    });

    await this.prisma.companyContactDiscoveryJob.createMany({
      data: companyIds.map((companyId) => ({
        companyId,
        batchId: batch.id,
        status: CompanyContactDiscoveryStatus.PENDING,
      })),
    });

    await this.prisma.companyDirectoryEntry.updateMany({
      where: { id: { in: companyIds } },
      data: { contactDiscoveryState: 'QUEUED' },
    });

    return this.serializeBatch(batch);
  }

  async getBatch(batchId: string) {
    const batch = await this.prisma.companyContactDiscoveryBatch.findUnique({
      where: { id: batchId },
      include: {
        jobs: {
          orderBy: { createdAt: 'asc' },
          take: 200,
          include: { company: { select: { id: true, name: true, ico: true } } },
        },
      },
    });
    if (!batch) throw new NotFoundException('Batch nenalezen.');
    return this.serializeBatch(batch, batch.jobs);
  }

  async listBatches() {
    const rows = await this.prisma.companyContactDiscoveryBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map((b) => this.serializeBatch(b));
  }

  async pauseBatch(batchId: string) {
    return this.prisma.companyContactDiscoveryBatch.update({
      where: { id: batchId },
      data: { status: CompanyProviderJobStatus.PAUSED },
    });
  }

  async resumeBatch(batchId: string) {
    return this.prisma.companyContactDiscoveryBatch.update({
      where: { id: batchId },
      data: { status: CompanyProviderJobStatus.PENDING, error: null },
    });
  }

  async stopBatch(batchId: string) {
    return this.prisma.companyContactDiscoveryBatch.update({
      where: { id: batchId },
      data: {
        status: CompanyProviderJobStatus.PAUSED,
        error: 'Zastaveno administrátorem.',
        finishedAt: new Date(),
      },
    });
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
      await this.processBatchSlice(batch.id);
    } finally {
      this.processing = false;
    }
  }

  private async processBatchSlice(batchId: string) {
    const batch = await this.prisma.companyContactDiscoveryBatch.findUnique({ where: { id: batchId } });
    if (!batch) return;

    const pendingJobs = await this.prisma.companyContactDiscoveryJob.findMany({
      where: {
        batchId,
        status: CompanyContactDiscoveryStatus.PENDING,
      },
      orderBy: { createdAt: 'asc' },
      take: CONTACT_DISCOVERY_CONCURRENCY,
    });

    if (pendingJobs.length === 0) {
      const remaining = await this.prisma.companyContactDiscoveryJob.count({
        where: { batchId, status: CompanyContactDiscoveryStatus.RUNNING },
      });
      if (remaining === 0) {
        await this.prisma.companyContactDiscoveryBatch.update({
          where: { id: batchId },
          data: { status: CompanyProviderJobStatus.COMPLETED, finishedAt: new Date() },
        });
      }
      return;
    }

    await this.prisma.companyContactDiscoveryBatch.update({
      where: { id: batchId },
      data: {
        status: CompanyProviderJobStatus.RUNNING,
        startedAt: batch.startedAt ?? new Date(),
        lastActivityAt: new Date(),
      },
    });

    let processed = batch.processed;
    let found = batch.found;
    let notFound = batch.notFound;
    let needsReview = batch.needsReview;
    let failed = batch.failed;
    let queued = batch.queued;

    for (const job of pendingJobs) {
      if (!job.companyId) continue;
      const company = await this.prisma.companyDirectoryEntry.findUnique({
        where: { id: job.companyId },
      });
      if (!company) continue;

      await this.prisma.companyContactDiscoveryJob.update({
        where: { id: job.id },
        data: {
          status: CompanyContactDiscoveryStatus.RUNNING,
          attempts: { increment: 1 },
          startedAt: new Date(),
          website: company.website,
        },
      });
      await this.prisma.companyDirectoryEntry.update({
        where: { id: company.id },
        data: { contactDiscoveryState: 'SEARCHING' },
      });
      await this.prisma.companyContactDiscoveryBatch.update({
        where: { id: batchId },
        data: { currentCompanyName: company.name, queued: Math.max(0, queued - 1) },
      });
      queued = Math.max(0, queued - 1);

      try {
        const result = await this.runDiscoveryForCompany(company.id, company.website);
        processed += 1;
        if (result.found) {
          if (result.status === CompanyContactStatus.REVIEW_REQUIRED) needsReview += 1;
          else found += 1;
        } else {
          notFound += 1;
        }
        await this.prisma.companyContactDiscoveryJob.update({
          where: { id: job.id },
          data: {
            status: CompanyContactDiscoveryStatus.COMPLETED,
            email: result.email ?? null,
            sourceUrl: result.sourceUrl ?? null,
            confidence: result.confidence ?? null,
            finishedAt: new Date(),
          },
        });
      } catch (err) {
        failed += 1;
        processed += 1;
        const message = err instanceof Error ? err.message.slice(0, 500) : 'Chyba discovery';
        await this.prisma.companyContactDiscoveryJob.update({
          where: { id: job.id },
          data: {
            status: CompanyContactDiscoveryStatus.FAILED,
            error: message,
            finishedAt: new Date(),
          },
        });
        await this.prisma.companyDirectoryEntry.update({
          where: { id: company.id },
          data: { contactDiscoveryState: 'FAILED' },
        });
      }

      await new Promise((r) => setTimeout(r, batch.delayMs ?? CONTACT_DISCOVERY_DELAY_MS));
    }

    const done =
      processed >= (batch.totalExpected ?? batch.companyIds.length) &&
      pendingJobs.length < CONTACT_DISCOVERY_CONCURRENCY;

    await this.prisma.companyContactDiscoveryBatch.update({
      where: { id: batchId },
      data: {
        processed,
        found,
        notFound,
        needsReview,
        failed,
        queued,
        lastActivityAt: new Date(),
        status: done ? CompanyProviderJobStatus.COMPLETED : CompanyProviderJobStatus.PENDING,
        finishedAt: done ? new Date() : null,
      },
    });
  }

  private async runDiscoveryForCompany(companyId: string, website: string | null | undefined) {
    if (!website?.trim()) {
      await this.prisma.companyDirectoryEntry.update({
        where: { id: companyId },
        data: { contactDiscoveryState: 'NOT_FOUND' },
      });
      return { found: false, status: null, email: null, sourceUrl: null, confidence: null };
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
      return { found: false, status: null, email: null, sourceUrl: null, confidence: null };
    }

    const best = result.emails[0];
    const status =
      best.confidence >= 0.9
        ? CompanyContactStatus.FOUND_HIGH_CONFIDENCE
        : best.confidence >= 0.7
          ? CompanyContactStatus.FOUND_MEDIUM_CONFIDENCE
          : CompanyContactStatus.REVIEW_REQUIRED;

    const discoveryState: CompanyContactDiscoveryEntryState =
      status === CompanyContactStatus.REVIEW_REQUIRED ? 'REVIEW_REQUIRED' : 'FOUND';

    await this.prisma.companyContact.create({
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

    return {
      found: true,
      status,
      email: best.email,
      sourceUrl: best.sourceUrl,
      confidence: best.confidence,
    };
  }

  private serializeBatch(
    batch: {
      id: string;
      label?: string | null;
      status: CompanyProviderJobStatus;
      processed: number;
      found: number;
      notFound: number;
      needsReview: number;
      failed: number;
      queued: number;
      totalExpected: number | null;
      currentCompanyName?: string | null;
      startedAt: Date | null;
      finishedAt: Date | null;
      error: string | null;
      createdAt: Date;
    },
    jobs?: Array<{
      id: string;
      companyId: string | null;
      status: CompanyContactDiscoveryStatus;
      email: string | null;
      sourceUrl: string | null;
      confidence: number | null;
      error: string | null;
      company?: { id: string; name: string; ico: string } | null;
    }>,
  ) {
    const progress = computeJobProgress(batch.processed, batch.totalExpected, batch.startedAt);
    const isComplete = batch.status === CompanyProviderJobStatus.COMPLETED;
    return {
      ...batch,
      progress,
      progressPercent: isComplete ? progress.percentage : Math.min(99, progress.percentage),
      progressLabel: progress.label,
      items: jobs?.map((j) => ({
        id: j.id,
        companyId: j.companyId,
        companyName: j.company?.name ?? null,
        ico: j.company?.ico ?? null,
        status: j.status,
        email: j.email,
        sourceUrl: j.sourceUrl,
        confidence: j.confidence,
        error: j.error,
      })),
    };
  }

  private async recoverStaleJobs() {
    const stale = await this.prisma.companyContactDiscoveryJob.findMany({
      where: { status: CompanyContactDiscoveryStatus.RUNNING },
    });
    for (const job of stale) {
      await this.prisma.companyContactDiscoveryJob.update({
        where: { id: job.id },
        data: { status: CompanyContactDiscoveryStatus.PENDING },
      });
      if (job.companyId) {
        await this.prisma.companyDirectoryEntry.update({
          where: { id: job.companyId },
          data: { contactDiscoveryState: 'QUEUED' },
        });
      }
    }
  }

  private async fetchEmailsFromWebsite(website: string) {
    const base = website.startsWith('http') ? website : `https://${website}`;
    const urls = [base, `${base.replace(/\/$/, '')}/kontakt`, `${base.replace(/\/$/, '')}/contact`];
    const emails: Array<{ email: string; sourceUrl: string; confidence: number }> = [];
    let phone: string | undefined;
    const resolvedWebsite = base;

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
            confidence: scoreEmail(email, resolvedWebsite),
          });
        }
      } catch {
        /* ignore */
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

function scoreEmail(email: string, website: string): number {
  const lower = email.toLowerCase();
  let score = 0.6;
  if (PREFERRED_PREFIXES.some((p) => lower.startsWith(p))) score = 0.95;
  else if (lower.startsWith('mail@')) score = 0.85;
  else if (/^[a-z]+\.[a-z]+@/.test(lower)) score = 0.45;

  try {
    const domain = new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace(/^www\./, '');
    const emailDomain = lower.split('@')[1];
    if (emailDomain && (emailDomain === domain || emailDomain.endsWith(`.${domain}`))) {
      score = Math.min(1, score + 0.05);
    } else {
      score = Math.max(0.3, score - 0.2);
    }
  } catch {
    /* ignore */
  }
  return score;
}

function extractPhone(html: string): string | undefined {
  const match = html.match(/(?:\+420\s?)?(?:\d{3}\s?){3}/);
  return match?.[0]?.trim();
}
