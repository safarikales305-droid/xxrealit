import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
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
import { buildAdminCompanyExtendedWhere } from './company-directory.serializer';
import { CompanyContactDiscoveryPipelineService } from './company-contact-discovery-pipeline.service';

const STALE_SEARCHING_MS = 15 * 60 * 1000;
const BLOCKED_REQUEUE: CompanyContactDiscoveryEntryState[] = [
  'QUEUED',
  'SEARCHING',
  'FOUND',
  'REVIEW_REQUIRED',
  'VERIFIED',
];

const TERMINAL_CONTACT_STATUSES: CompanyContactStatus[] = [
  CompanyContactStatus.FOUND_HIGH_CONFIDENCE,
  CompanyContactStatus.FOUND_MEDIUM_CONFIDENCE,
  CompanyContactStatus.REVIEW_REQUIRED,
  CompanyContactStatus.VERIFIED,
];

export type ContactDiscoveryEnqueueResult = {
  jobId: string | null;
  itemId: string | null;
  companyId: string;
  status: CompanyContactDiscoveryEntryState | 'VERIFIED';
  email?: string | null;
  sourceUrl?: string | null;
  confidence?: number | null;
};

@Injectable()
export class CompanyContactDiscoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(CompanyContactDiscoveryService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private lastHeartbeatAt: Date | null = null;
  private readonly workerInstanceId = `contact-discovery-${process.pid}`;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: CompanyAuditService,
    private readonly pipeline: CompanyContactDiscoveryPipelineService,
  ) {}

  onModuleInit(): void {
    void this.bootstrapWorker();
    this.timer = setInterval(() => void this.tick(), ARES_WORKER_TICK_MS);
  }

  private async bootstrapWorker() {
    await this.recoverStaleJobs();
    const [waiting, active] = await Promise.all([
      this.prisma.companyContactDiscoveryJob.count({
        where: { status: CompanyContactDiscoveryStatus.PENDING },
      }),
      this.prisma.companyContactDiscoveryJob.count({
        where: { status: CompanyContactDiscoveryStatus.RUNNING },
      }),
    ]);
    this.log.log(
      JSON.stringify({
        event: 'CONTACT_DISCOVERY_WORKER_STARTED',
        mode: 'DB_QUEUE',
        pollIntervalMs: ARES_WORKER_TICK_MS,
        concurrency: CONTACT_DISCOVERY_CONCURRENCY,
        enabled: COMPANY_CONTACT_DISCOVERY_ENABLED,
        waitingCount: waiting,
        activeCount: active,
        workerInstanceId: this.workerInstanceId,
      }),
    );
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private assertDiscoveryEnabled(): void {
    if (!COMPANY_CONTACT_DISCOVERY_ENABLED) {
      throw new ServiceUnavailableException({
        code: 'CONTACT_DISCOVERY_PROVIDER_NOT_CONFIGURED',
        message: 'Provider pro dohledání kontaktů není nakonfigurován.',
      });
    }
  }

  /** HTTP: zařadí firmu do fronty, neprovádí research synchronně. */
  async enqueueDiscover(
    companyId: string,
    options?: { force?: boolean },
  ): Promise<ContactDiscoveryEnqueueResult> {
    this.assertDiscoveryEnabled();

    const company = await this.prisma.companyDirectoryEntry.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        ico: true,
        website: true,
        verifiedBusinessEmail: true,
        contactDiscoveryState: true,
      },
    });
    if (!company) {
      this.log.warn(
        JSON.stringify({
          event: 'CONTACT_DISCOVERY_REQUEST_REJECTED',
          route: 'POST /admin/company-directory/companies/:id/contact/discover',
          companyId,
          reason: 'COMPANY_NOT_FOUND',
          timestamp: new Date().toISOString(),
        }),
      );
      throw new NotFoundException({
        code: 'COMPANY_NOT_FOUND',
        message: 'Firma nenalezena.',
      });
    }

    this.log.log(
      JSON.stringify({
        event: 'CONTACT_DISCOVERY_REQUEST',
        companyId: company.id,
        companyIco: company.ico,
        companyName: company.name,
        force: options?.force ?? false,
        timestamp: new Date().toISOString(),
      }),
    );

    if (company.verifiedBusinessEmail && !options?.force) {
      return {
        jobId: null,
        itemId: null,
        companyId: company.id,
        status: 'VERIFIED',
        email: company.verifiedBusinessEmail,
      };
    }

    const latestContact = await this.prisma.companyContact.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
    if (
      !options?.force &&
      latestContact &&
      TERMINAL_CONTACT_STATUSES.includes(latestContact.status) &&
      latestContact.status !== CompanyContactStatus.VERIFIED
    ) {
      return {
        jobId: null,
        itemId: null,
        companyId: company.id,
        status:
          latestContact.status === CompanyContactStatus.REVIEW_REQUIRED
            ? 'REVIEW_REQUIRED'
            : 'FOUND',
        email: latestContact.email,
        sourceUrl: latestContact.sourceUrl,
        confidence: latestContact.confidence,
      };
    }

    const activeJob = await this.prisma.companyContactDiscoveryJob.findFirst({
      where: {
        companyId,
        status: {
          in: [CompanyContactDiscoveryStatus.PENDING, CompanyContactDiscoveryStatus.RUNNING],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!options?.force && activeJob) {
      const status: CompanyContactDiscoveryEntryState =
        activeJob.status === CompanyContactDiscoveryStatus.RUNNING ? 'SEARCHING' : 'QUEUED';
      return {
        jobId: activeJob.batchId,
        itemId: activeJob.id,
        companyId: company.id,
        status,
      };
    }

    if (!options?.force && BLOCKED_REQUEUE.includes(company.contactDiscoveryState)) {
      return {
        jobId: null,
        itemId: null,
        companyId: company.id,
        status: company.contactDiscoveryState,
      };
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

    const item = await this.prisma.companyContactDiscoveryJob.create({
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

    this.log.log(
      JSON.stringify({
        event: 'CONTACT_DISCOVERY_QUEUED',
        companyId: company.id,
        companyIco: company.ico,
        jobId: batch.id,
        itemId: item.id,
        status: 'QUEUED',
        timestamp: new Date().toISOString(),
      }),
    );

    return {
      jobId: batch.id,
      itemId: item.id,
      companyId: company.id,
      status: 'QUEUED',
    };
  }

  async discoverForCompany(companyId: string, options?: { force?: boolean }) {
    return this.enqueueDiscover(companyId, options);
  }

  async getDiscoveryItem(itemId: string) {
    const item = await this.prisma.companyContactDiscoveryJob.findUnique({
      where: { id: itemId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            ico: true,
            contactDiscoveryState: true,
            verifiedBusinessEmail: true,
          },
        },
      },
    });
    if (!item) {
      throw new NotFoundException({
        code: 'CONTACT_DISCOVERY_ITEM_NOT_FOUND',
        message: 'Položka dohledávání nenalezena.',
      });
    }

    const companyState = item.company?.contactDiscoveryState ?? 'NOT_SEARCHED';
    const status =
      item.status === CompanyContactDiscoveryStatus.RUNNING
        ? 'SEARCHING'
        : item.status === CompanyContactDiscoveryStatus.PENDING
          ? 'QUEUED'
          : item.status === CompanyContactDiscoveryStatus.FAILED
            ? 'FAILED'
            : companyState;

    return {
      itemId: item.id,
      jobId: item.batchId,
      companyId: item.companyId,
      status,
      email: item.email,
      sourceUrl: item.sourceUrl,
      confidence: item.confidence,
      error: item.error,
      startedAt: item.startedAt?.toISOString() ?? null,
      finishedAt: item.finishedAt?.toISOString() ?? null,
      company: item.company,
    };
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
    if (!company) {
      throw new NotFoundException({
        code: 'COMPANY_NOT_FOUND',
        message: 'Firma nenalezena.',
      });
    }

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

    const latestJob = await this.prisma.companyContactDiscoveryJob.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      companyId,
      state: company.contactDiscoveryState,
      verifiedBusinessEmail: company.verifiedBusinessEmail,
      activeJobId: activeJob?.id ?? null,
      activeItemId: activeJob?.id ?? null,
      jobStatus: activeJob?.status ?? null,
      latestJobDiagnostics: latestJob?.diagnosticsJson ?? null,
      latestJobNotFoundReason: latestJob?.notFoundReason ?? null,
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
      ico?: string;
      verified?: string;
      active?: string;
      minRating?: string;
      hasGoogle?: string;
      hasEmail?: string;
      claimed?: string;
      hasReviews?: string;
      noReviews?: string;
      contactDiscoveryState?: string;
    };
    force?: boolean;
  }) {
    if (!COMPANY_CONTACT_DISCOVERY_ENABLED) {
      throw new ServiceUnavailableException({
        code: 'CONTACT_DISCOVERY_PROVIDER_NOT_CONFIGURED',
        message: 'Provider pro dohledání kontaktů není nakonfigurován.',
      });
    }

    let companyIds = input.companyIds ?? [];
    if (companyIds.length === 0 && input.filter) {
      const where = buildAdminCompanyExtendedWhere({
        category: input.filter.category,
        region: input.filter.region,
        city: input.filter.city,
        q: input.filter.q,
        ico: input.filter.ico,
        verified: input.filter.verified,
        active: input.filter.active,
        minRating: input.filter.minRating,
        hasGoogle: input.filter.hasGoogle,
        hasEmail: input.filter.hasEmail,
        claimed: input.filter.claimed,
        hasReviews: input.filter.hasReviews,
        noReviews: input.filter.noReviews,
        contactDiscoveryState: input.filter.contactDiscoveryState,
      });
      if (!input.force && !input.filter.contactDiscoveryState) {
        where.contactDiscoveryState = { notIn: BLOCKED_REQUEUE };
      }
      const rows = await this.prisma.companyDirectoryEntry.findMany({
        where,
        take: Math.min(input.limit ?? 500, 2000),
        select: { id: true },
        orderBy: { updatedAt: 'desc' },
      });
      companyIds = rows.map((r) => r.id);
      this.log.log(
        JSON.stringify({
          event: 'CONTACT_BATCH_FILTER_RESOLVED',
          filterKeys: Object.keys(input.filter),
          matched: companyIds.length,
          limit: input.limit ?? 500,
          force: input.force ?? false,
        }),
      );
    }

    if (!input.force && companyIds.length > 0) {
      const [eligible, activeJobs] = await Promise.all([
        this.prisma.companyDirectoryEntry.findMany({
          where: {
            id: { in: companyIds },
            contactDiscoveryState: { notIn: BLOCKED_REQUEUE },
          },
          select: { id: true },
        }),
        this.prisma.companyContactDiscoveryJob.findMany({
          where: {
            companyId: { in: companyIds },
            status: {
              in: [CompanyContactDiscoveryStatus.PENDING, CompanyContactDiscoveryStatus.RUNNING],
            },
          },
          select: { companyId: true },
        }),
      ]);
      const blocked = new Set(
        activeJobs.map((j) => j.companyId).filter((id): id is string => id != null),
      );
      companyIds = eligible.map((r) => r.id).filter((id) => !blocked.has(id));
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

  async getDiagnostics() {
    const [waiting, running, activeBatches, completedJobs, foundJobs, notFoundJobs, failedJobs, reviewJobs, websiteFoundJobs] =
      await Promise.all([
      this.prisma.companyContactDiscoveryJob.count({
        where: { status: CompanyContactDiscoveryStatus.PENDING },
      }),
      this.prisma.companyContactDiscoveryJob.count({
        where: { status: CompanyContactDiscoveryStatus.RUNNING },
      }),
      this.prisma.companyContactDiscoveryBatch.count({
        where: {
          status: { in: [CompanyProviderJobStatus.PENDING, CompanyProviderJobStatus.RUNNING] },
        },
      }),
      this.prisma.companyContactDiscoveryJob.count({
        where: { status: CompanyContactDiscoveryStatus.COMPLETED },
      }),
      this.prisma.companyContactDiscoveryJob.count({
        where: { status: CompanyContactDiscoveryStatus.COMPLETED, email: { not: null } },
      }),
      this.prisma.companyContactDiscoveryJob.count({
        where: { status: CompanyContactDiscoveryStatus.COMPLETED, email: null, notFoundReason: { not: null } },
      }),
      this.prisma.companyContactDiscoveryJob.count({
        where: { status: CompanyContactDiscoveryStatus.FAILED },
      }),
      this.prisma.companyDirectoryEntry.count({
        where: { contactDiscoveryState: 'REVIEW_REQUIRED' },
      }),
      this.prisma.companyContactDiscoveryJob.count({
        where: {
          status: CompanyContactDiscoveryStatus.COMPLETED,
          website: { not: null },
        },
      }),
    ]);

    const provider = this.pipeline.getProviderDiagnostics();

    return {
      configured: COMPANY_CONTACT_DISCOVERY_ENABLED,
      worker: this.timer && COMPANY_CONTACT_DISCOVERY_ENABLED ? 'Running' : 'Stopped',
      provider: provider.contactSearchProvider,
      webFetch: provider.webFetch,
      aiAnalysis: provider.aiAnalysis,
      searchProviderName: provider.searchProviderName,
      processing: this.processing,
      lastHeartbeatAt: this.lastHeartbeatAt?.toISOString() ?? null,
      lastHeartbeatSecondsAgo: this.lastHeartbeatAt
        ? Math.round((Date.now() - this.lastHeartbeatAt.getTime()) / 1000)
        : null,
      queue: { waiting, active: running },
      activeBatches,
      concurrency: CONTACT_DISCOVERY_CONCURRENCY,
      delayMs: CONTACT_DISCOVERY_DELAY_MS,
      metrics: {
        processed: completedJobs + failedJobs,
        websiteFound: websiteFoundJobs,
        emailFound: foundJobs,
        reviewRequired: reviewJobs,
        noEmail: Math.max(0, notFoundJobs),
        failed: failedJobs,
      },
    };
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
    this.lastHeartbeatAt = new Date();
    await this.recoverStaleJobs();

    const batch = await this.prisma.companyContactDiscoveryBatch.findFirst({
      where: {
        status: { in: [CompanyProviderJobStatus.PENDING, CompanyProviderJobStatus.RUNNING] },
        jobs: { some: { status: CompanyContactDiscoveryStatus.PENDING } },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!batch) {
      const orphanBatch = await this.reopenBatchWithPendingJobs();
      if (!orphanBatch?.batchId) return;
      this.processing = true;
      try {
        await this.processBatchSlice(orphanBatch.batchId);
      } finally {
        this.processing = false;
      }
      return;
    }

    this.processing = true;
    try {
      await this.processBatchSlice(batch.id);
    } finally {
      this.processing = false;
    }
  }

  private async reopenBatchWithPendingJobs() {
    const pendingJob = await this.prisma.companyContactDiscoveryJob.findFirst({
      where: { status: CompanyContactDiscoveryStatus.PENDING },
      orderBy: { createdAt: 'asc' },
    });
    if (!pendingJob?.batchId) return null;
    await this.prisma.companyContactDiscoveryBatch.update({
      where: { id: pendingJob.batchId },
      data: {
        status: CompanyProviderJobStatus.PENDING,
        finishedAt: null,
        error: null,
      },
    });
    return pendingJob;
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
      const [remainingRunning, remainingPending] = await Promise.all([
        this.prisma.companyContactDiscoveryJob.count({
          where: { batchId, status: CompanyContactDiscoveryStatus.RUNNING },
        }),
        this.prisma.companyContactDiscoveryJob.count({
          where: { batchId, status: CompanyContactDiscoveryStatus.PENDING },
        }),
      ]);
      if (remainingRunning === 0 && remainingPending === 0) {
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
      if (!job.companyId) {
        await this.prisma.companyContactDiscoveryJob.update({
          where: { id: job.id },
          data: {
            status: CompanyContactDiscoveryStatus.FAILED,
            error: 'Chybí vazba na firmu',
            finishedAt: new Date(),
          },
        });
        failed += 1;
        processed += 1;
        continue;
      }
      const company = await this.prisma.companyDirectoryEntry.findUnique({
        where: { id: job.companyId },
      });
      if (!company) {
        await this.prisma.companyContactDiscoveryJob.update({
          where: { id: job.id },
          data: {
            status: CompanyContactDiscoveryStatus.FAILED,
            error: 'Firma nenalezena',
            finishedAt: new Date(),
          },
        });
        failed += 1;
        processed += 1;
        continue;
      }

      const claimed = await this.prisma.companyContactDiscoveryJob.updateMany({
        where: { id: job.id, status: CompanyContactDiscoveryStatus.PENDING },
        data: {
          status: CompanyContactDiscoveryStatus.RUNNING,
          attempts: { increment: 1 },
          startedAt: new Date(),
          website: company.website,
        },
      });
      if (claimed.count === 0) continue;
      await this.prisma.companyDirectoryEntry.update({
        where: { id: company.id },
        data: { contactDiscoveryState: 'SEARCHING' },
      });
      await this.prisma.companyContactDiscoveryBatch.update({
        where: { id: batchId },
        data: { currentCompanyName: company.name, queued: Math.max(0, queued - 1) },
      });
      queued = Math.max(0, queued - 1);

      this.log.log(
        JSON.stringify({
          event: 'CONTACT_DISCOVERY_STARTED',
          companyId: company.id,
          companyIco: company.ico,
          itemId: job.id,
          jobId: batchId,
          timestamp: new Date().toISOString(),
        }),
      );

      try {
        const result = await this.runDiscoveryForCompany(company);
        processed += 1;
        if (result.found) {
          if (result.status === CompanyContactStatus.REVIEW_REQUIRED) needsReview += 1;
          else found += 1;
        } else if (result.discoveryState === 'FAILED') {
          failed += 1;
        } else {
          notFound += 1;
        }
        await this.prisma.companyContactDiscoveryJob.update({
          where: { id: job.id },
          data: {
            status:
              result.discoveryState === 'FAILED'
                ? CompanyContactDiscoveryStatus.FAILED
                : CompanyContactDiscoveryStatus.COMPLETED,
            email: result.email ?? null,
            sourceUrl: result.sourceUrl ?? null,
            confidence: result.confidence ?? null,
            website: result.website ?? company.website,
            candidateEmails: result.diagnostics?.emailsFound ?? [],
            sourceUrls: result.diagnostics?.contactPagesFound ?? [],
            notFoundReason: result.notFoundReason ?? null,
            diagnosticsJson: result.diagnostics as Prisma.InputJsonValue,
            error: result.notFoundReason
              ? (result.diagnostics?.notFoundReasonLabel ?? result.notFoundReason)
              : null,
            finishedAt: new Date(),
          },
        });
        this.log.log(
          JSON.stringify({
            event: result.found ? 'CONTACT_DISCOVERY_COMPLETED' : 'CONTACT_DISCOVERY_NOT_FOUND',
            companyId: company.id,
            companyIco: company.ico,
            itemId: job.id,
            email: result.email ?? null,
            sourceUrl: result.sourceUrl ?? null,
            confidence: result.confidence ?? null,
            notFoundReason: result.notFoundReason ?? null,
            searchQueries: result.diagnostics?.searchQueries?.length ?? 0,
            candidateWebsites: result.diagnostics?.candidateWebsites?.length ?? 0,
            timestamp: new Date().toISOString(),
          }),
        );
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

    const [remainingPending, remainingRunning] = await Promise.all([
      this.prisma.companyContactDiscoveryJob.count({
        where: { batchId, status: CompanyContactDiscoveryStatus.PENDING },
      }),
      this.prisma.companyContactDiscoveryJob.count({
        where: { batchId, status: CompanyContactDiscoveryStatus.RUNNING },
      }),
    ]);
    const done = remainingPending === 0 && remainingRunning === 0;

    await this.prisma.companyContactDiscoveryBatch.update({
      where: { id: batchId },
      data: {
        processed,
        found,
        notFound,
        needsReview,
        failed,
        queued: Math.max(0, remainingPending),
        lastActivityAt: new Date(),
        status: done ? CompanyProviderJobStatus.COMPLETED : CompanyProviderJobStatus.RUNNING,
        finishedAt: done ? new Date() : null,
      },
    });
  }

  private async runDiscoveryForCompany(company: {
    id: string;
    name: string;
    ico: string;
    city: string | null;
    region: string | null;
    website: string | null;
    phone: string | null;
    verifiedBusinessEmail: string | null;
    street?: string | null;
    registeredAddress?: string | null;
  }) {
    const result = await this.pipeline.discoverCompanyContact(company as import('@prisma/client').CompanyDirectoryEntry);

    if (!result.found) {
      await this.prisma.companyDirectoryEntry.update({
        where: { id: company.id },
        data: {
          contactDiscoveryState: result.discoveryState,
          ...(result.website && !company.website ? { website: result.website } : {}),
        },
      });
      if (result.notFoundReason && result.discoveryState === 'NOT_FOUND') {
        await this.audit.log({
          companyId: company.id,
          action: 'CONTACT_DISCOVERY',
          message: `Kontakt nenalezen: ${result.diagnostics.notFoundReasonLabel ?? result.notFoundReason}`,
          meta: { notFoundReason: result.notFoundReason },
        });
      }
      return result;
    }

    await this.prisma.companyContact.create({
      data: {
        companyId: company.id,
        email: result.email!,
        phone: result.phone,
        website: result.website,
        sourceUrl: result.sourceUrl,
        sourceType: CompanyContactSourceType.OFFICIAL_WEBSITE,
        confidence: result.confidence,
        status: result.status!,
      },
    });

    await this.prisma.companyDirectoryEntry.update({
      where: { id: company.id },
      data: {
        contactDiscoveryState: result.discoveryState,
        ...(result.website ? { website: result.website } : {}),
      },
    });

    await this.audit.log({
      companyId: company.id,
      action: 'CONTACT_DISCOVERY',
      message: `Nalezen email ${result.email} (${Math.round((result.confidence ?? 0) * 100)}%)`,
      meta: { sourceUrl: result.sourceUrl, website: result.website },
    });

    return result;
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
    const statusLabel =
      batch.status === CompanyProviderJobStatus.PENDING
        ? 'QUEUED'
        : batch.status === CompanyProviderJobStatus.RUNNING
          ? 'RUNNING'
          : batch.status;
    return {
      ...batch,
      jobId: batch.id,
      total: batch.totalExpected ?? 0,
      status: statusLabel,
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
    const cutoff = new Date(Date.now() - STALE_SEARCHING_MS);
    const stale = await this.prisma.companyContactDiscoveryJob.findMany({
      where: {
        status: CompanyContactDiscoveryStatus.RUNNING,
        OR: [{ startedAt: { lt: cutoff } }, { startedAt: null }],
      },
      take: 50,
    });
    for (const job of stale) {
      const attempts = job.attempts ?? 0;
      const nextStatus =
        attempts >= 3 ? CompanyContactDiscoveryStatus.FAILED : CompanyContactDiscoveryStatus.PENDING;
      await this.prisma.companyContactDiscoveryJob.update({
        where: { id: job.id },
        data: {
          status: nextStatus,
          error: nextStatus === CompanyContactDiscoveryStatus.FAILED ? 'Timeout při dohledávání' : null,
          finishedAt: nextStatus === CompanyContactDiscoveryStatus.FAILED ? new Date() : null,
        },
      });
      if (job.companyId) {
        await this.prisma.companyDirectoryEntry.update({
          where: { id: job.companyId },
          data: {
            contactDiscoveryState:
              nextStatus === CompanyContactDiscoveryStatus.FAILED ? 'FAILED' : 'QUEUED',
          },
        });
      }
    }
  }
}
