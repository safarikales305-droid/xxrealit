import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { buildListingPublicSeoUrl } from '../seo/post-seo.util';
import { classicPublicListingWhere } from '../properties/property-listing-scope';
import { resolvePropertyShareImage } from '../social/autopost/social-publish-format.util';
import { getPublicPortalUrl } from '../social/autopost/social-publish-format.util';
import type { UpdateMetaCatalogSettingDto } from './dto/meta-catalog.dto';

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
  broker: string;
  phone: string;
  email: string;
  premium: boolean;
  developer: boolean;
  project: string;
  createdAt: string;
  active: boolean;
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
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  isActive: boolean;
  approved: boolean;
  createdAt: Date;
  user: {
    role: string;
    isPromoProfile: boolean;
    isPremiumBroker: boolean;
    brokerOfficeName: string;
    brokerPhonePublic: string;
    brokerEmailPublic: string;
    firstName: string;
    lastName: string;
  };
};

@Injectable()
export class MetaCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private async getOrCreateSettings() {
    const existing = await this.prisma.metaCatalogSetting.findUnique({
      where: { id: SETTINGS_ID },
    });
    if (existing) return existing;
    return this.prisma.metaCatalogSetting.create({ data: { id: SETTINGS_ID } });
  }

  serializeSettings(row: {
    id: string;
    enabled: boolean;
    lastItemCount: number;
    lastGeneratedAt: Date | null;
    lastError: string | null;
    carouselListingIds: string[];
    updatedAt: Date;
  }) {
    const origin = getPublicPortalUrl();
    const feedCsvUrl = `${origin}/meta/feed.csv`;
    const feedXmlUrl = `${origin}/meta/feed.xml`;
    const feedJsonUrl = `${origin}/meta/feed.json`;
    const carouselJsonUrl = `${origin}/api/public/meta-carousel-listings.json`;
    return {
      id: row.id,
      enabled: row.enabled,
      lastItemCount: row.lastItemCount,
      lastGeneratedAt: row.lastGeneratedAt?.toISOString() ?? null,
      lastError: row.lastError,
      carouselListingIds: row.carouselListingIds,
      feedCsvUrl,
      feedXmlUrl,
      feedJsonUrl,
      carouselJsonUrl,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async getAdminSettings() {
    const row = await this.getOrCreateSettings();
    return this.serializeSettings(row);
  }

  async updateSettings(dto: UpdateMetaCatalogSettingDto) {
    await this.getOrCreateSettings();
    const data: Prisma.MetaCatalogSettingUpdateInput = {};
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.carouselListingIds !== undefined) {
      data.carouselListingIds = dto.carouselListingIds.map(String);
    }
    const row = await this.prisma.metaCatalogSetting.update({
      where: { id: SETTINGS_ID },
      data,
    });
    return { ok: true, settings: this.serializeSettings(row) };
  }

  private buildWhere(filters?: {
    city?: string;
    propertyType?: string;
    priceMin?: number;
    priceMax?: number;
    ids?: string[];
  }): Prisma.PropertyWhereInput {
    const and: Prisma.PropertyWhereInput[] = [classicPublicListingWhere];
    if (filters?.ids?.length) {
      and.push({ id: { in: filters.ids } });
    }
    if (filters?.city?.trim()) {
      and.push({ city: { contains: filters.city.trim(), mode: 'insensitive' } });
    }
    if (filters?.propertyType?.trim()) {
      const pt = filters.propertyType.trim();
      and.push({
        OR: [
          { propertyTypeKey: { equals: pt, mode: 'insensitive' } },
          { propertyType: { contains: pt, mode: 'insensitive' } },
          { propertyTypeLabel: { contains: pt, mode: 'insensitive' } },
        ],
      });
    }
    if (filters?.priceMin != null && Number.isFinite(filters.priceMin)) {
      and.push({ price: { gte: filters.priceMin } });
    }
    if (filters?.priceMax != null && Number.isFinite(filters.priceMax)) {
      and.push({ price: { lte: filters.priceMax } });
    }
    return { AND: and };
  }

  private async fetchCatalogProperties(filters?: {
    city?: string;
    propertyType?: string;
    priceMin?: number;
    priceMax?: number;
    ids?: string[];
  }): Promise<CatalogProperty[]> {
    return this.prisma.property.findMany({
      where: this.buildWhere(filters),
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
        contactName: true,
        contactPhone: true,
        contactEmail: true,
        isActive: true,
        approved: true,
        createdAt: true,
        user: {
          select: {
            role: true,
            isPromoProfile: true,
            isPremiumBroker: true,
            brokerOfficeName: true,
            brokerPhonePublic: true,
            brokerEmailPublic: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  private mapListingFull(p: CatalogProperty): MetaCatalogFullItem | null {
    const image = resolvePropertyShareImage(p);
    if (!image) return null;

    const origin = getPublicPortalUrl();
    const title = (p.seoTitle?.trim() || p.title?.trim() || 'Nemovitost').slice(0, 150);
    const description = (p.seoDescription?.trim() || p.description || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000);
    const link = buildListingPublicSeoUrl(origin, p, 'classic');
    const gallery = (p.images ?? []).filter(Boolean);
    const brokerName =
      p.contactName?.trim() ||
      p.user.brokerOfficeName?.trim() ||
      [p.user.firstName, p.user.lastName].filter(Boolean).join(' ').trim() ||
      '';
    const phone = p.contactPhone?.trim() || p.user.brokerPhonePublic?.trim() || '';
    const email = p.contactEmail?.trim() || p.user.brokerEmailPublic?.trim() || '';
    const premium = Boolean(p.user.isPromoProfile || p.user.isPremiumBroker);
    const developer = p.user.role === 'DEVELOPER';
    const project = developer ? p.user.brokerOfficeName || title : '';

    return {
      id: p.id,
      title,
      description,
      price: p.price,
      priceFormatted: p.price != null ? `${p.price} ${p.currency || 'CZK'}` : '',
      currency: p.currency || 'CZK',
      offerType: p.offerType,
      propertyType: p.propertyTypeLabel || p.propertyType || p.propertyTypeKey || '',
      category: p.importCategoryLabel || p.propertyTypeKey || p.propertyType,
      city: p.city,
      gps: null,
      url: link,
      mainImage: image,
      gallery,
      video: p.videoUrl?.trim() || null,
      broker: brokerName,
      phone,
      email,
      premium,
      developer,
      project,
      createdAt: p.createdAt.toISOString(),
      active: Boolean(p.isActive && p.approved),
    };
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
    const isNew =
      String(p.offerType ?? '').toLowerCase().includes('nov') ||
      String(p.propertyTypeKey ?? '').toLowerCase().includes('novostav');

    return {
      id: p.id,
      title,
      description,
      availability: 'in stock',
      condition: isNew ? 'new' : 'used',
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

  private async assertFeedEnabled() {
    const settings = await this.getOrCreateSettings();
    if (!settings.enabled) {
      throw new NotFoundException('Meta katalog feed je vypnutý.');
    }
  }

  async buildFullItems(): Promise<MetaCatalogFullItem[]> {
    await this.assertFeedEnabled();
    const rows = await this.fetchCatalogProperties();
    return rows
      .map((p) => this.mapListingFull(p))
      .filter((r): r is MetaCatalogFullItem => r != null);
  }

  async buildCsvFeed(): Promise<string> {
    try {
      const items = await this.buildFullItems();
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const header = [
        'id',
        'title',
        'description',
        'price',
        'offer_type',
        'property_type',
        'category',
        'city',
        'gps',
        'url',
        'main_image',
        'gallery',
        'video',
        'broker',
        'phone',
        'email',
        'premium',
        'developer',
        'project',
        'created_at',
        'active',
      ].join(',');

      const lines = items.map((r) =>
        [
          esc(r.id),
          esc(r.title),
          esc(r.description),
          esc(r.priceFormatted),
          esc(r.offerType),
          esc(r.propertyType),
          esc(r.category),
          esc(r.city),
          esc(r.gps ?? ''),
          esc(r.url),
          esc(r.mainImage),
          esc(r.gallery.join('|')),
          esc(r.video ?? ''),
          esc(r.broker),
          esc(r.phone),
          esc(r.email),
          esc(r.premium ? '1' : '0'),
          esc(r.developer ? '1' : '0'),
          esc(r.project),
          esc(r.createdAt),
          esc(r.active ? '1' : '0'),
        ].join(','),
      );

      await this.persistFeedMeta(items.length, null);
      return `\uFEFF${header}\n${lines.join('\n')}\n`;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.persistFeedMeta(0, message);
      throw e;
    }
  }

  async buildJsonFeed(): Promise<string> {
    try {
      const items = await this.buildFullItems();
      const body = JSON.stringify(
        { generatedAt: new Date().toISOString(), count: items.length, items },
        null,
        2,
      );
      await this.persistFeedMeta(items.length, null);
      return body;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.persistFeedMeta(0, message);
      throw e;
    }
  }

  async buildXmlFeed(): Promise<string> {
    try {
      const items = await this.buildFullItems();
      const origin = getPublicPortalUrl();
      const esc = (v: string) =>
        v
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

      const itemXml = items
        .map(
          (r) => `    <item>
      <g:id>${esc(r.id)}</g:id>
      <g:title>${esc(r.title)}</g:title>
      <g:description>${esc(r.description)}</g:description>
      <g:price>${esc(r.priceFormatted)}</g:price>
      <g:availability>in stock</g:availability>
      <g:condition>new</g:condition>
      <g:link>${esc(r.url)}</g:link>
      <g:image_link>${esc(r.mainImage)}</g:image_link>
      <g:brand>XXREALIT</g:brand>
      <g:google_product_category>Real Estate</g:google_product_category>
      <g:custom_label_0>${esc(r.city)}</g:custom_label_0>
      <g:custom_label_1>${esc(r.propertyType)}</g:custom_label_1>
      <g:custom_label_2>${esc(r.premium ? 'premium' : 'standard')}</g:custom_label_2>
    </item>`,
        )
        .join('\n');

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>XXREALIT Meta Catalog</title>
    <link>${esc(origin)}</link>
    <description>Facebook Catalog feed nemovitostí</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${itemXml}
  </channel>
</rss>
`;
      await this.persistFeedMeta(items.length, null);
      return xml;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.persistFeedMeta(0, message);
      throw e;
    }
  }

  async computeFeedStats(format: 'csv' | 'json' | 'xml'): Promise<MetaFeedStats> {
    const settings = await this.getOrCreateSettings();
    const started = Date.now();
    let body = '';
    let items: MetaCatalogFullItem[] = [];
    try {
      if (format === 'csv') body = await this.buildCsvFeed();
      else if (format === 'json') body = await this.buildJsonFeed();
      else body = await this.buildXmlFeed();
      items = await this.buildFullItems();
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
    const photoCount = items.reduce((s, i) => s + i.gallery.length + 1, 0);
    const videoCount = items.filter((i) => Boolean(i.video)).length;
    return {
      itemCount: items.length,
      photoCount,
      videoCount,
      sizeBytes: Buffer.byteLength(body, 'utf8'),
      lastExport: new Date().toISOString(),
      lastError: null,
      generationMs: Date.now() - started,
    };
  }

  async validateFeed(): Promise<{ ok: boolean; errors: string[]; itemCount: number }> {
    const errors: string[] = [];
    try {
      const items = await this.buildFullItems();
      if (items.length === 0) errors.push('Feed neobsahuje žádné aktivní inzeráty s fotografií.');
      for (const item of items.slice(0, 20)) {
        if (!item.url.startsWith('http')) errors.push(`Neplatná URL u ${item.id}`);
        if (!item.mainImage.startsWith('http')) errors.push(`Chybí hlavní fotografie u ${item.id}`);
      }
      return { ok: errors.length === 0, errors, itemCount: items.length };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, errors: [message], itemCount: 0 };
    }
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

    const rows = await this.fetchCatalogProperties({ ...filters, ids });
    const items = rows
      .map((p) => this.mapListing(p))
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
      where: this.buildWhere(filters),
    });
    const withImageRows = await this.fetchCatalogProperties(filters);
    const withImage = withImageRows
      .map((p) => this.mapListing(p))
      .filter((r): r is NonNullable<typeof r> => r != null).length;
    return { total: count, withImage };
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
