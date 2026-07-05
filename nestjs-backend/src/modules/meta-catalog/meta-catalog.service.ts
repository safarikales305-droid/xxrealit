import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { classicPublicListingWhere } from '../properties/property-listing-scope';
import {
  getPublicPortalUrl,
  resolvePropertyShareImage,
} from '../social/autopost/social-publish-format.util';
import { buildListingPublicSeoUrl } from '../seo/post-seo.util';
import type { UpdateMetaCatalogSettingDto } from './dto/meta-catalog.dto';
import {
  DEFAULT_EXPORT_FIELD_FLAGS,
  META_CATALOG_FIELDS,
} from './meta-catalog.fields';
import { MetaCatalogFeedService } from './meta-catalog-feed.service';
import { MetaCatalogLogService } from './meta-catalog-log.service';

const SETTINGS_ID = 'default';

export type MetaCatalogFullItem = {
  id: string;
  title: string;
  description: string;
  price: number | null;
  priceFormatted: string;
  currency: string;
  offerType: string;
  propertyType: string;
  category: string;
  city: string;
  gps: string | null;
  url: string;
  mainImage: string;
  gallery: string[];
  video: string | null;
  premium: boolean;
  developer: boolean;
  project: string;
  createdAt: string;
  availability: string;
};

export type MetaFeedStats = {
  itemCount: number;
  photoCount: number;
  videoCount: number;
  sizeBytes: number;
  lastExport: string | null;
  lastError: string | null;
  generationMs: number;
};

type CatalogProperty = {
  id: string;
  slug: string | null;
  title: string;
  description: string;
  seoTitle: string | null;
  seoDescription: string | null;
  price: number | null;
  currency: string;
  offerType: string;
  propertyType: string;
  propertyTypeKey: string | null;
  propertyTypeLabel: string | null;
  importCategoryLabel: string | null;
  city: string;
  listingType: string | null;
  videoUrl: string | null;
  images: string[];
  mainImage: string | null;
  thumbnailUrl: string | null;
  facebookShareImageUrl: string | null;
  facebookShareImageAt: Date | null;
  generatedVideoThumbnail: string | null;
  isActive: boolean;
  approved: boolean;
  createdAt: Date;
  user: {
    role: string;
    isPromoProfile: boolean;
    isPremiumBroker: boolean;
    brokerOfficeName: string;
    firstName: string;
    lastName: string;
  };
};

@Injectable()
export class MetaCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feed: MetaCatalogFeedService,
    private readonly logService: MetaCatalogLogService,
  ) {}

  private async getOrCreateSettings() {
    const existing = await this.prisma.metaCatalogSetting.findUnique({
      where: { id: SETTINGS_ID },
    });
    if (existing) return existing;
    return this.prisma.metaCatalogSetting.create({
      data: {
        id: SETTINGS_ID,
        exportFieldFlags: DEFAULT_EXPORT_FIELD_FLAGS as Prisma.InputJsonValue,
      },
    });
  }

  async getExportFieldsConfig() {
    const row = await this.getOrCreateSettings();
    const flags = this.feed.resolveFieldFlags(row.exportFieldFlags);
    return {
      fields: META_CATALOG_FIELDS.map((f) => ({
        key: f.key,
        label: f.label,
        category: f.category,
        defaultEnabled: f.defaultEnabled,
        enabled: flags[f.key],
      })),
      allowContactExport: row.allowContactExport,
      contactExportWarning:
        'Kontakty na makléře a vlastníky jsou obchodně citlivá data. Exportem mohou být dostupná mimo portál XXREALIT.',
    };
  }

  serializeSettings(row: {
    id: string;
    enabled: boolean;
    lastItemCount: number;
    lastGeneratedAt: Date | null;
    lastError: string | null;
    carouselListingIds: string[];
    allowContactExport: boolean;
    exportFieldFlags: Prisma.JsonValue | null;
    syncIntervalMinutes: number;
    lastSyncAt: Date | null;
    nextSyncAt: Date | null;
    syncRunning: boolean;
    updatedAt: Date;
  }) {
    const origin = getPublicPortalUrl();
    return {
      id: row.id,
      enabled: row.enabled,
      lastItemCount: row.lastItemCount,
      lastGeneratedAt: row.lastGeneratedAt?.toISOString() ?? null,
      lastError: row.lastError,
      carouselListingIds: row.carouselListingIds,
      allowContactExport: row.allowContactExport,
      exportFieldFlags: this.feed.resolveFieldFlags(row.exportFieldFlags),
      syncIntervalMinutes: row.syncIntervalMinutes,
      lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
      nextSyncAt: row.nextSyncAt?.toISOString() ?? null,
      syncRunning: row.syncRunning,
      feedCsvUrl: `${origin}/meta/feed.csv`,
      feedXmlUrl: `${origin}/meta/feed.xml`,
      feedJsonUrl: `${origin}/meta/feed.json`,
      carouselJsonUrl: `${origin}/api/public/meta-carousel-listings.json`,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async getAdminSettings() {
    const row = await this.getOrCreateSettings();
    return this.serializeSettings(row);
  }

  async updateSettings(dto: UpdateMetaCatalogSettingDto) {
    const before = await this.getOrCreateSettings();
    const data: Prisma.MetaCatalogSettingUpdateInput = {};
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.carouselListingIds !== undefined) {
      data.carouselListingIds = dto.carouselListingIds.map(String);
    }
    if (dto.allowContactExport !== undefined) data.allowContactExport = dto.allowContactExport;
    if (dto.exportFieldFlags !== undefined) {
      const merged = { ...this.feed.resolveFieldFlags(before.exportFieldFlags), ...dto.exportFieldFlags };
      for (const f of META_CATALOG_FIELDS) {
        if (f.category === 'required') merged[f.key] = true;
        if (f.category === 'sensitive' && !dto.allowContactExport && !before.allowContactExport) {
          merged[f.key] = false;
        }
      }
      data.exportFieldFlags = merged as Prisma.InputJsonValue;
    }
    if (dto.syncIntervalMinutes !== undefined) {
      data.syncIntervalMinutes = dto.syncIntervalMinutes;
      data.nextSyncAt = this.computeNextSync(new Date(), dto.syncIntervalMinutes);
    }
    const row = await this.prisma.metaCatalogSetting.update({
      where: { id: SETTINGS_ID },
      data,
    });
    this.feed.clearCache();
    await this.logService.log('settings_changed', 'Změna nastavení Meta katalogu', {
      details: { patch: dto },
    });
    return { ok: true, settings: this.serializeSettings(row) };
  }

  private computeNextSync(from: Date, intervalMinutes: number) {
    return new Date(from.getTime() + intervalMinutes * 60_000);
  }

  private async assertFeedEnabled() {
    const settings = await this.getOrCreateSettings();
    if (!settings.enabled) {
      throw new NotFoundException('Meta katalog feed je vypnutý.');
    }
  }

  private async persistFeedMeta(itemCount: number, error: string | null) {
    await this.prisma.metaCatalogSetting.update({
      where: { id: SETTINGS_ID },
      data: {
        lastItemCount: itemCount,
        lastGeneratedAt: new Date(),
        lastError: error,
      },
    });
  }

  async buildFullItems(): Promise<MetaCatalogFullItem[]> {
    await this.assertFeedEnabled();
    const built = await this.feed.buildExportRecords();
    return built.map((b) => ({
      id: b.id,
      title: String(b.record.title ?? ''),
      description: String(b.record.description ?? ''),
      price: null,
      priceFormatted: String(b.record.price ?? ''),
      currency: 'CZK',
      offerType: String(b.record.offer_type ?? ''),
      propertyType: String(b.record.property_type ?? ''),
      category: String(b.record.category ?? ''),
      city: String(b.record.city ?? ''),
      gps: null,
      url: String(b.record.url ?? b.record.link ?? ''),
      mainImage: String(b.record.main_image ?? b.record.image_link ?? ''),
      gallery: Array.isArray(b.record.gallery) ? b.record.gallery : [],
      video: b.record.video ? String(b.record.video) : null,
      premium: Boolean(b.record.premium),
      developer: Boolean(b.record.developer),
      project: String(b.record.project ?? ''),
      createdAt: String(b.record.created_at ?? ''),
      availability: 'in stock',
    }));
  }

  async buildCsvFeed(): Promise<string> {
    try {
      await this.assertFeedEnabled();
      const feeds = await this.feed.buildFeeds();
      await this.persistFeedMeta(feeds.count, null);
      return feeds.csv;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.persistFeedMeta(0, message);
      throw e;
    }
  }

  async buildJsonFeed(): Promise<string> {
    try {
      await this.assertFeedEnabled();
      const feeds = await this.feed.buildFeeds();
      await this.persistFeedMeta(feeds.count, null);
      return feeds.json;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.persistFeedMeta(0, message);
      throw e;
    }
  }

  async buildXmlFeed(): Promise<string> {
    try {
      await this.assertFeedEnabled();
      const feeds = await this.feed.buildFeeds();
      await this.persistFeedMeta(feeds.count, null);
      return feeds.xml;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.persistFeedMeta(0, message);
      throw e;
    }
  }

  async computeFeedStats(format: 'csv' | 'json' | 'xml'): Promise<MetaFeedStats> {
    const settings = await this.getOrCreateSettings();
    const started = Date.now();
    try {
      const feeds = await this.feed.buildFeeds();
      const body = format === 'csv' ? feeds.csv : format === 'json' ? feeds.json : feeds.xml;
      const items = await this.buildFullItems();
      const photoCount = items.reduce((s, i) => s + i.gallery.length + 1, 0);
      const videoCount = items.filter((i) => Boolean(i.video)).length;
      return {
        itemCount: feeds.count,
        photoCount,
        videoCount,
        sizeBytes: Buffer.byteLength(body, 'utf8'),
        lastExport: new Date().toISOString(),
        lastError: null,
        generationMs: Date.now() - started,
      };
    } catch {
      return {
        itemCount: settings.lastItemCount,
        photoCount: 0,
        videoCount: 0,
        sizeBytes: 0,
        lastExport: settings.lastGeneratedAt?.toISOString() ?? null,
        lastError: settings.lastError,
        generationMs: Date.now() - started,
      };
    }
  }

  async validateFeed(): Promise<{ ok: boolean; errors: string[]; itemCount: number }> {
    try {
      const ctx = await this.feed.getFeedContext();
      const built = await this.feed.buildExportRecords();
      const validation = this.feed.validateBatch(
        built.map((b) => ({ id: b.id, record: b.record })),
        ctx,
      );
      if (built.length === 0) validation.errors.push('Feed neobsahuje žádné aktivní inzeráty s fotografií.');
      return { ok: validation.ok && built.length > 0, errors: validation.errors, itemCount: built.length };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, errors: [message], itemCount: 0 };
    }
  }

  private mapListing(p: CatalogProperty) {
    const origin = getPublicPortalUrl();
    const image = resolvePropertyShareImage(p);
    if (!image) return null;

    const title = (p.seoTitle?.trim() || p.title?.trim() || 'Nemovitost').slice(0, 150);
    const description = (p.seoDescription?.trim() || p.description || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000);
    const link = buildListingPublicSeoUrl(origin, p, 'classic');
    const priceValue = p.price != null ? `${p.price} ${p.currency || 'CZK'}` : '';

    return {
      id: p.id,
      title,
      description,
      availability: 'in stock',
      condition: 'used',
      price: priceValue,
      link,
      image_link: image,
      brand: 'XXREALIT',
      google_product_category: 'Real Estate',
      fb_product_category: 'Home & Garden',
      city: p.city,
      propertyType: p.propertyTypeLabel || p.propertyType || p.propertyTypeKey || '',
      image,
      url: link,
    };
  }

  async buildCarouselJson(filters?: {
    city?: string;
    propertyType?: string;
    priceMin?: number;
    priceMax?: number;
    ids?: string[];
  }) {
    const settings = await this.getOrCreateSettings();
    const ids =
      filters?.ids && filters.ids.length > 0
        ? filters.ids
        : settings.carouselListingIds.length > 0
          ? settings.carouselListingIds
          : undefined;

    const rows = await this.prisma.property.findMany({
      where: this.feed.buildWhere({ ...filters, ids }),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        seoTitle: true,
        seoDescription: true,
        price: true,
        currency: true,
        offerType: true,
        propertyType: true,
        propertyTypeKey: true,
        propertyTypeLabel: true,
        importCategoryLabel: true,
        city: true,
        listingType: true,
        videoUrl: true,
        images: true,
        mainImage: true,
        thumbnailUrl: true,
        facebookShareImageUrl: true,
        facebookShareImageAt: true,
        generatedVideoThumbnail: true,
        isActive: true,
        approved: true,
        createdAt: true,
        user: {
          select: {
            role: true,
            isPromoProfile: true,
            isPremiumBroker: true,
            brokerOfficeName: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    const items = rows
      .map((p) => this.mapListing(p as CatalogProperty))
      .filter((r): r is NonNullable<typeof r> => r != null)
      .map((r) => ({
        title: r.title,
        description: r.description,
        image: r.image,
        url: r.url,
        price: r.price,
        city: r.city,
        propertyType: r.propertyType,
      }));

    return {
      generatedAt: new Date().toISOString(),
      count: items.length,
      items,
    };
  }

  async previewCount(filters?: {
    city?: string;
    propertyType?: string;
    priceMin?: number;
    priceMax?: number;
  }) {
    const count = await this.prisma.property.count({
      where: this.feed.buildWhere(filters),
    });
    const built = await this.feed.buildExportRecords(filters);
    return { total: count, withImage: built.length };
  }

  async listAdminListings(filters?: {
    city?: string;
    propertyType?: string;
    priceMin?: number;
    priceMax?: number;
    search?: string;
    take?: number;
  }) {
    const and: Prisma.PropertyWhereInput[] = [classicPublicListingWhere];
    if (filters?.city?.trim()) {
      and.push({ city: { contains: filters.city.trim(), mode: 'insensitive' } });
    }
    if (filters?.propertyType?.trim()) {
      const pt = filters.propertyType.trim();
      and.push({
        OR: [
          { propertyTypeKey: { equals: pt, mode: 'insensitive' } },
          { propertyType: { contains: pt, mode: 'insensitive' } },
        ],
      });
    }
    if (filters?.priceMin != null && Number.isFinite(filters.priceMin)) {
      and.push({ price: { gte: filters.priceMin } });
    }
    if (filters?.priceMax != null && Number.isFinite(filters.priceMax)) {
      and.push({ price: { lte: filters.priceMax } });
    }
    if (filters?.search?.trim()) {
      const s = filters.search.trim();
      and.push({
        OR: [
          { title: { contains: s, mode: 'insensitive' } },
          { city: { contains: s, mode: 'insensitive' } },
          { id: { contains: s, mode: 'insensitive' } },
        ],
      });
    }

    const take = Math.min(200, Math.max(1, filters?.take ?? 50));
    const items = await this.prisma.property.findMany({
      where: { AND: and },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        title: true,
        city: true,
        price: true,
        currency: true,
        propertyType: true,
        propertyTypeKey: true,
        slug: true,
        mainImage: true,
        images: true,
        thumbnailUrl: true,
        facebookShareImageUrl: true,
        facebookShareImageAt: true,
        generatedVideoThumbnail: true,
        videoUrl: true,
      },
    });

    return {
      items: items.map((p) => {
        const mapped = this.mapListing(p as CatalogProperty);
        return {
          id: p.id,
          title: p.title,
          city: p.city,
          price: p.price,
          currency: p.currency,
          propertyType: p.propertyTypeKey || p.propertyType,
          hasImage: Boolean(mapped),
          link: mapped?.url ?? null,
          image: mapped?.image ?? null,
        };
      }),
    };
  }

  parsePrice(raw?: string): number | undefined {
    if (!raw?.trim()) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
}
