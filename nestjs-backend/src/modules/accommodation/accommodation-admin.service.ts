import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AccommodationOwnershipType,
  AccommodationSource,
  AccommodationStatus,
  AccommodationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { serializeAccommodation } from './accommodation.serializer';
import { AccommodationProviderRegistry } from './providers/accommodation-provider.registry';
import { AccommodationSyncJobService } from './accommodation-sync-job.service';

@Injectable()
export class AccommodationAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: AccommodationProviderRegistry,
    private readonly syncJobs: AccommodationSyncJobService,
  ) {}

  async dashboard() {
    const [total, active, inactive, byProvider, syncErrors] = await Promise.all([
      this.prisma.accommodation.count(),
      this.prisma.accommodation.count({ where: { status: AccommodationStatus.PUBLISHED, published: true } }),
      this.prisma.accommodation.count({ where: { OR: [{ status: { not: AccommodationStatus.PUBLISHED } }, { published: false }] } }),
      this.prisma.accommodation.groupBy({ by: ['provider'], _count: { _all: true } }),
      this.prisma.accommodationProviderConfig.findMany({ where: { errorCount: { gt: 0 } } }),
    ]);
    return {
      total,
      active,
      inactive,
      byProvider: Object.fromEntries(byProvider.map((r) => [r.provider, r._count._all])),
      syncErrors,
    };
  }

  async list(params: { page?: number; limit?: number; provider?: string; status?: string }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, params.limit ?? 30);
    const where: Prisma.AccommodationWhereInput = {};
    if (params.provider) where.provider = params.provider;
    if (params.status) where.status = params.status as AccommodationStatus;

    const [total, rows] = await Promise.all([
      this.prisma.accommodation.count({ where }),
      this.prisma.accommodation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { photos: { take: 1, where: { isCover: true } } },
      }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        type: r.type,
        city: r.city,
        provider: r.provider,
        externalId: r.externalId,
        priceFrom: r.priceFrom,
        rating: r.rating,
        status: r.status,
        published: r.published,
        lastSyncedAt: r.lastSyncedAt,
        coverPhoto: r.photos[0]?.url ?? null,
      })),
      total,
      page,
      limit,
    };
  }

  async get(id: string) {
    const row = await this.prisma.accommodation.findUnique({
      where: { id },
      include: {
        photos: { orderBy: { sortOrder: 'asc' } },
        facilities: { orderBy: { sortOrder: 'asc' } },
        rooms: true,
      },
    });
    if (!row) throw new NotFoundException('Ubytování nenalezeno.');
    return serializeAccommodation(row);
  }

  async updateStatus(id: string, data: { status?: AccommodationStatus; published?: boolean }) {
    await this.prisma.accommodation.update({ where: { id }, data });
    return { success: true };
  }

  async deleteLocal(id: string) {
    await this.prisma.accommodation.delete({ where: { id } });
    return { success: true };
  }

  async createManual(body: {
    type: AccommodationType;
    name: string;
    slug: string;
    city: string;
    description?: string;
    priceFrom?: number;
    address?: string;
    latitude?: number;
    longitude?: number;
    createdById?: string;
  }) {
    const row = await this.prisma.accommodation.create({
      data: {
        type: body.type,
        name: body.name,
        slug: body.slug,
        city: body.city,
        description: body.description,
        priceFrom: body.priceFrom,
        address: body.address,
        latitude: body.latitude,
        longitude: body.longitude,
        source: AccommodationSource.XXREALIT,
        provider: 'xxrealit',
        ownershipType: AccommodationOwnershipType.XXREALIT,
        status: AccommodationStatus.DRAFT,
        published: false,
        createdById: body.createdById,
      },
    });
    return { id: row.id, slug: row.slug };
  }

  async getProviderConfig(provider: string) {
    const config = await this.prisma.accommodationProviderConfig.findUnique({ where: { provider } });
    const impl = this.providers.get(provider);
    const configured = impl ? await impl.isConfigured() : false;
    return {
      provider,
      label: impl?.label ?? provider,
      configured,
      status: configured ? 'Připojeno (skeleton)' : 'Nepřipojeno',
      config: config
        ? {
            environment: config.environment,
            enabled: config.enabled,
            lastSyncAt: config.lastSyncAt,
            importedCount: config.importedCount,
            updatedCount: config.updatedCount,
            errorCount: config.errorCount,
            lastError: config.lastError,
            hasApiKey: Boolean(config.apiKey),
            hasAffiliateId: Boolean(config.affiliateId),
          }
        : null,
    };
  }

  async saveProviderConfig(
    provider: string,
    body: { apiKey?: string; affiliateId?: string; environment?: string; enabled?: boolean },
  ) {
    await this.prisma.accommodationProviderConfig.upsert({
      where: { provider },
      create: {
        provider,
        apiKey: body.apiKey,
        affiliateId: body.affiliateId,
        environment: body.environment ?? 'sandbox',
        enabled: body.enabled ?? false,
      },
      update: {
        apiKey: body.apiKey,
        affiliateId: body.affiliateId,
        environment: body.environment,
        enabled: body.enabled,
      },
    });
    return { success: true };
  }

  async testProvider(provider: string) {
    const impl = this.providers.get(provider);
    if (!impl) throw new NotFoundException('Provider nenalezen.');
    return impl.testConnection();
  }

  startSync(provider: string) {
    return this.syncJobs.startSync(provider);
  }

  getSyncJob(jobId: string) {
    return this.syncJobs.getJob(jobId);
  }

  pauseSync(jobId: string) {
    return this.syncJobs.pauseJob(jobId);
  }

  cancelSync(jobId: string) {
    return this.syncJobs.cancelJob(jobId);
  }
}
