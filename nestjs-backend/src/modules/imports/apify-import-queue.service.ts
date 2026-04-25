import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { ListingImportMethod, ListingImportPortal, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ImportedBrokerContactService } from '../imported-broker-contacts/imported-broker-contact.service';
import { ImportImageService } from './import-image.service';
import { safeParsePrice } from './price-parse.util';

type QueueStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'disabled';

type QueueJob = {
  id: string;
  sourceId: string;
  apifyUrl: string;
  status: QueueStatus;
  imported: number;
  updated: number;
  failed: number;
  errors: string[];
  imagesSaved: number;
  brokersCreated: number;
  brokersUpdated: number;
  lastProcessedUrl: string | null;
  runAt: string;
  finishedAt?: string;
  totalItems?: number;
  processedItems?: number;
  progressPercent?: number;
};

@Injectable()
export class ApifyImportQueueService {
  private readonly logger = new Logger(ApifyImportQueueService.name);
  private chain: Promise<void> = Promise.resolve();
  private readonly jobs = new Map<string, QueueJob>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly importImages: ImportImageService,
    private readonly importedBrokers: ImportedBrokerContactService,
  ) {}

  enqueue(params: { sourceId: string; apifyUrl: string }): QueueJob {
    const job: QueueJob = {
      id: `apify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sourceId: params.sourceId,
      apifyUrl: params.apifyUrl.trim(),
      status: 'queued',
      imported: 0,
      updated: 0,
      failed: 0,
      errors: [],
      imagesSaved: 0,
      brokersCreated: 0,
      brokersUpdated: 0,
      lastProcessedUrl: null,
      runAt: new Date().toISOString(),
      totalItems: 0,
      processedItems: 0,
      progressPercent: 0,
    };
    this.jobs.set(job.id, job);

    this.chain = this.chain
      .then(async () => {
        await this.process(job.id);
      })
      .catch((e) => {
        this.logger.error(`APIFY queue chain failure: ${e instanceof Error ? e.message : String(e)}`);
      });

    return job;
  }

  getJob(jobId: string): QueueJob {
    const job = this.jobs.get(jobId);
    if (!job) throw new NotFoundException('APIFY job nenalezen');
    return job;
  }

  private async process(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const source = await this.prisma.importSource.findUnique({
      where: { id: job.sourceId },
    });
    if (!source) {
      job.status = 'failed';
      job.errors.push('Import source nenalezen');
      job.finishedAt = new Date().toISOString();
      return;
    }
    if (!source.enabled) {
      job.status = 'disabled';
      job.errors.push('Import source je vypnutý');
      job.finishedAt = new Date().toISOString();
      return;
    }

    job.status = 'running';
    const credentials =
      source.credentialsJson && typeof source.credentialsJson === 'object' && !Array.isArray(source.credentialsJson)
        ? (source.credentialsJson as Record<string, unknown>)
        : {};
    const token =
      (typeof credentials.apifyToken === 'string' ? credentials.apifyToken : '').trim() ||
      (process.env.APIFY_TOKEN ?? '').trim();

    try {
      const items = await this.fetchItems(job.apifyUrl, token);
      job.totalItems = items.length;
      job.processedItems = 0;
      job.progressPercent = items.length > 0 ? 1 : 100;
      const seenSourceUrls = new Set<string>();
      for (const item of items) {
        try {
          const mapped = this.mapItem(item);
          if (!mapped.externalId) {
            job.failed += 1;
            continue;
          }
          if (mapped.sourceUrl) {
            seenSourceUrls.add(mapped.sourceUrl);
            job.lastProcessedUrl = mapped.sourceUrl;
          }

          let property = await this.prisma.property.findUnique({
            where: {
              importSource_importExternalId: {
                importSource: ListingImportPortal.apify,
                importExternalId: mapped.externalId,
              },
            },
          });
          const isNew = !property;
          if (!property) {
            property = await this.prisma.property.create({
              data: {
                userId: 'system',
                title: mapped.title,
                description: mapped.description,
                price: mapped.price,
                city: mapped.city,
                address: mapped.address,
                region: mapped.region,
                offerType: mapped.offerType,
                propertyType: mapped.propertyType,
                images: [],
                approved: true,
                status: 'APPROVED',
                isActive: true,
                listingType: 'CLASSIC',
                importSource: ListingImportPortal.apify,
                importMethod: ListingImportMethod.apify,
                importExternalId: mapped.externalId,
                importSourceUrl: mapped.sourceUrl,
                importedAt: new Date(),
                lastSyncedAt: new Date(),
                sourcePortalKey: source.portalKey || 'apify',
                sourcePortalLabel: source.portalLabel || 'APIFY',
                importCategoryKey: source.categoryKey || 'obecne',
                importCategoryLabel: source.categoryLabel || 'Obecné',
                contactName: mapped.contactName || '',
                contactPhone: mapped.contactPhone || '',
                contactEmail: mapped.contactEmail || '',
              },
            });
          } else {
            property = await this.prisma.property.update({
              where: { id: property.id },
              data: {
                title: mapped.title,
                description: mapped.description || property.description,
                price: mapped.price ?? property.price,
                city: mapped.city || property.city,
                address: mapped.address || property.address,
                region: mapped.region || property.region,
                offerType: mapped.offerType || property.offerType,
                propertyType: mapped.propertyType || property.propertyType,
                importSourceUrl: mapped.sourceUrl || property.importSourceUrl,
                lastSyncedAt: new Date(),
                isActive: true,
                contactName: mapped.contactName || property.contactName,
                contactPhone: mapped.contactPhone || property.contactPhone,
                contactEmail: mapped.contactEmail || property.contactEmail,
              },
            });
          }

          const storedUrls: string[] = [];
          const variants: Array<{ originalUrl: string; watermarkedUrl: string | null }> = [];
          // Debug importu fotek z Apify (požadavek adminu)
          // eslint-disable-next-line no-console
          console.log('IMAGES:', mapped.images);
          for (let i = 0; i < mapped.images.length; i += 1) {
            const img = mapped.images[i]!;
            const done = await this.importImages.importExternalImageToPortal({
              imageUrl: img,
              propertyId: property.id,
              sourcePortalKey: 'apify',
              index: i,
            });
            if (!done?.storedUrl) continue;
            storedUrls.push(done.storedUrl);
            variants.push({
              originalUrl: done.storedUrl,
              watermarkedUrl: done.watermarkedUrl ?? null,
            });
          }
          job.imagesSaved += storedUrls.length;

          if (storedUrls.length > 0) {
            await this.prisma.property.update({
              where: { id: property.id },
              data: { images: storedUrls },
            });
            await this.prisma.propertyMedia.deleteMany({
              where: { propertyId: property.id, type: 'image' },
            });
            await this.prisma.propertyMedia.createMany({
              data: variants.map((v, idx) => ({
                propertyId: property.id,
                url: v.originalUrl,
                originalUrl: v.originalUrl,
                watermarkedUrl: v.watermarkedUrl,
                type: 'image',
                sortOrder: idx + 1,
              })),
            });
          }

          try {
            const b = await this.importedBrokers.syncFromImportedProperty(property.id);
            if (b === 'created') job.brokersCreated += 1;
            if (b === 'updated') job.brokersUpdated += 1;
          } catch {
            /* broker sync must not break listing */
          }

          if (isNew) job.imported += 1;
          else job.updated += 1;
        } catch (e) {
          job.failed += 1;
          const m = e instanceof Error ? e.message : String(e);
          if (job.errors.length < 40) job.errors.push(m);
        }
        job.processedItems = (job.processedItems ?? 0) + 1;
        const total = Math.max(1, job.totalItems ?? 1);
        job.progressPercent = Math.max(
          1,
          Math.min(99, Math.round(((job.processedItems ?? 0) / total) * 100)),
        );
      }

      await this.prisma.property.updateMany({
        where: {
          importSource: ListingImportPortal.apify,
          importMethod: ListingImportMethod.apify,
          importSourceUrl: { notIn: [...seenSourceUrls] },
          isActive: true,
        },
        data: { isActive: false, lastSyncedAt: new Date() },
      });

      job.status = job.failed > 0 ? 'completed_with_errors' : 'completed';
      job.finishedAt = new Date().toISOString();
      job.progressPercent = 100;

      await this.prisma.importSource.update({
        where: { id: job.sourceId },
        data: {
          lastRunAt: new Date(),
          lastStatus: job.status,
          lastError: job.errors[0] ?? null,
          lastProcessedUrl: job.lastProcessedUrl,
        },
      });
      await this.prisma.importLog.create({
        data: {
          sourceId: job.sourceId,
          portal: ListingImportPortal.apify,
          method: ListingImportMethod.apify,
          status: job.status,
          importedNew: job.imported,
          importedUpdated: job.updated,
          skipped: 0,
          disabled: 0,
          error: job.failed > 0 ? job.errors[0] ?? null : null,
          message: `APIFY import: imported=${job.imported}, updated=${job.updated}, failed=${job.failed}`,
          payloadJson: job as unknown as Prisma.InputJsonValue,
        },
      });
      this.logger.log(`APIFY import done: imported=${job.imported} updated=${job.updated} failed=${job.failed}`);
    } catch (e) {
      job.status = 'failed';
      job.failed += 1;
      job.errors.push(e instanceof Error ? e.message : String(e));
      job.finishedAt = new Date().toISOString();
      job.progressPercent = 100;
      await this.prisma.importSource.update({
        where: { id: job.sourceId },
        data: {
          lastRunAt: new Date(),
          lastStatus: 'failed',
          lastError: job.errors[0] ?? null,
          lastProcessedUrl: job.lastProcessedUrl,
        },
      });
    }
  }

  private async fetchItems(apifyUrl: string, token: string): Promise<Record<string, unknown>[]> {
    if (!/^https?:\/\//i.test(apifyUrl)) throw new BadRequestException('APIFY_URL musí být validní URL.');
    const res = await axios.get(apifyUrl, {
      timeout: 45_000,
      responseType: 'json',
      validateStatus: (s: number) => s >= 200 && s < 300,
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const json = res.data as unknown;
    if (Array.isArray(json)) {
      return json.filter((x): x is Record<string, unknown> => x != null && typeof x === 'object');
    }
    if (json && typeof json === 'object' && Array.isArray((json as { items?: unknown }).items)) {
      return ((json as { items: unknown[] }).items).filter(
        (x): x is Record<string, unknown> => x != null && typeof x === 'object',
      );
    }
    return [];
  }

  private mapItem(item: Record<string, unknown>): {
    externalId: string;
    sourceUrl: string;
    title: string;
    description: string;
    price: number | null;
    address: string;
    city: string;
    region: string;
    propertyType: string;
    offerType: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    companyName: string;
    images: string[];
  } {
    const asStr = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    const get = (...keys: string[]): string => {
      for (const k of keys) {
        const val = asStr(item[k]);
        if (val) return val;
      }
      return '';
    };
    const location = item.location && typeof item.location === 'object' ? (item.location as Record<string, unknown>) : null;
    const contact = item.contact && typeof item.contact === 'object' ? (item.contact as Record<string, unknown>) : null;
    const normalizeImageUrl = (v: unknown): string | null => {
      if (typeof v !== 'string') return null;
      const t = v.trim();
      if (!/^https?:\/\//i.test(t)) return null;
      return t;
    };
    const imagesRaw = item.images;
    const singleRaw =
      normalizeImageUrl(item.obraz) ??
      normalizeImageUrl(item.Obraz) ??
      normalizeImageUrl(item.image) ??
      null;
    const imagesFromArray = Array.isArray(imagesRaw)
      ? imagesRaw
          .map((x) => normalizeImageUrl(x))
          .filter((x): x is string => Boolean(x))
      : [];
    const images = imagesFromArray.length > 0 ? imagesFromArray : singleRaw ? [singleRaw] : [];
    const sourceUrl = get('sourceUrl', 'url', 'detailUrl', 'listingUrl');
    const externalId = get('externalId', 'id', 'itemId', 'listingId') || sourceUrl.slice(-100);

    return {
      externalId,
      sourceUrl,
      title: get('title', 'name') || 'APIFY inzerát',
      description: get('description', 'text'),
      price: safeParsePrice(get('price', 'priceText', 'priceValue')),
      address: get('address', 'streetAddress') || asStr(location?.address),
      city: get('city') || asStr(location?.city) || 'Neuvedeno',
      region: get('region') || asStr(location?.region),
      propertyType: get('propertyType', 'type') || 'nemovitost',
      offerType: get('offerType', 'listingType') || 'prodej',
      contactName: get('contactName') || asStr(contact?.name),
      contactEmail: get('contactEmail', 'email') || asStr(contact?.email),
      contactPhone: get('contactPhone', 'phone') || asStr(contact?.phone),
      companyName: get('companyName', 'agencyName') || asStr(contact?.company),
      images,
    };
  }
}
