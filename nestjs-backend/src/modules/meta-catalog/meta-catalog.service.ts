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
  city: string;
  listingType: string | null;
  videoUrl: string | null;
  images: string[];
  mainImage: string | null;
  thumbnailUrl: string | null;
  facebookShareImageUrl: string | null;
  facebookShareImageAt: Date | null;
  generatedVideoThumbnail: string | null;
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
    const feedCsvUrl = `${origin}/api/public/meta-catalog-feed.csv`;
    const carouselJsonUrl = `${origin}/api/public/meta-carousel-listings.json`;
    return {
      id: row.id,
      enabled: row.enabled,
      lastItemCount: row.lastItemCount,
      lastGeneratedAt: row.lastGeneratedAt?.toISOString() ?? null,
      lastError: row.lastError,
      carouselListingIds: row.carouselListingIds,
      feedCsvUrl,
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
        city: true,
        listingType: true,
        videoUrl: true,
        images: true,
        mainImage: true,
        thumbnailUrl: true,
        facebookShareImageUrl: true,
        facebookShareImageAt: true,
        generatedVideoThumbnail: true,
      },
    });
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

  async buildCsvFeed(): Promise<string> {
    const settings = await this.getOrCreateSettings();
    if (!settings.enabled) {
      throw new NotFoundException('Meta katalog feed je vypnutý.');
    }

    try {
      const rows = await this.fetchCatalogProperties();
      const mapped = rows.map((p) => this.mapListing(p)).filter((r): r is NonNullable<typeof r> => r != null);

      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
      const header = [
        'id',
        'title',
        'description',
        'availability',
        'condition',
        'price',
        'link',
        'image_link',
        'brand',
        'google_product_category',
        'fb_product_category',
      ].join(',');

      const lines = mapped.map((r) =>
        [
          esc(r.id),
          esc(r.title),
          esc(r.description),
          esc(r.availability),
          esc(r.condition),
          esc(r.price),
          esc(r.link),
          esc(r.image_link),
          esc(r.brand),
          esc(r.google_product_category),
          esc(r.fb_product_category),
        ].join(','),
      );

      await this.persistFeedMeta(mapped.length, null);
      return `\uFEFF${header}\n${lines.join('\n')}\n`;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.persistFeedMeta(0, message);
      throw e;
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
