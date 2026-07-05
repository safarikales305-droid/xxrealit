import { createHash } from 'crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { buildListingPublicSeoUrl } from '../seo/post-seo.util';
import { classicPublicListingWhere } from '../properties/property-listing-scope';
import { getPublicPortalUrl } from '../social/autopost/social-publish-format.util';
import {
  DEFAULT_EXPORT_FIELD_FLAGS,
  META_CATALOG_FIELDS,
  REQUIRED_FIELD_KEYS,
  SENSITIVE_FIELD_KEYS,
  type MetaCatalogFieldCategory,
} from './meta-catalog.fields';
import { MetaCatalogLogService } from './meta-catalog-log.service';
import {
  resolveCatalogGalleryImages,
  resolveCatalogMainImage,
} from './meta-catalog-image.util';

const SETTINGS_ID = 'default';
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /(\+420)?[\s.\-()]*\d{3}[\s.\-()]*\d{3}[\s.\-()]*\d{3}/;

export type CatalogPropertyRow = {
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
  subType: string;
  city: string;
  region: string;
  district: string;
  address: string;
  area: number | null;
  landArea: number | null;
  energyLabel: string | null;
  construction: string | null;
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
  isContactPaid: boolean;
  isOwnerListing: boolean;
  isActive: boolean;
  approved: boolean;
  status: string;
  createdAt: Date;
  userId: string;
  user: {
    id: string;
    role: string;
    isPromoProfile: boolean;
    isPremiumBroker: boolean;
    brokerOfficeName: string;
    brokerPhonePublic: string;
    brokerEmailPublic: string;
    whatsappPhone: string;
    firstName: string;
    lastName: string;
    postalCode: string;
  };
};

export type MetaCatalogExportRecord = Record<string, string | string[] | boolean | number | null>;

export type FieldPreviewEntry = {
  key: string;
  label: string;
  category: MetaCatalogFieldCategory;
  enabled: boolean;
  exported: boolean;
  value: string;
};

export type ExportValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export type FeedBuildContext = {
  allowContactExport: boolean;
  fieldFlags: Record<string, boolean>;
};

@Injectable()
export class MetaCatalogFeedService {
  private feedCache: { xml: string; csv: string; json: string; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logService: MetaCatalogLogService,
  ) {}

  clearCache() {
    this.feedCache = null;
  }

  resolveFieldFlags(raw: Prisma.JsonValue | null): Record<string, boolean> {
    const base = { ...DEFAULT_EXPORT_FIELD_FLAGS };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
    for (const field of META_CATALOG_FIELDS) {
      const v = (raw as Record<string, unknown>)[field.key];
      if (typeof v === 'boolean') base[field.key] = v;
    }
    for (const field of META_CATALOG_FIELDS) {
      if (field.category === 'required') base[field.key] = true;
      if (field.category === 'sensitive' && !base[field.key]) base[field.key] = false;
    }
    return base;
  }

  isFieldEnabled(ctx: FeedBuildContext, key: string): boolean {
    if (SENSITIVE_FIELD_KEYS.has(key)) {
      return ctx.allowContactExport && Boolean(ctx.fieldFlags[key]);
    }
    if (REQUIRED_FIELD_KEYS.has(key)) return true;
    return Boolean(ctx.fieldFlags[key]);
  }

  private propertySelect(): Prisma.PropertySelect {
    return {
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
      subType: true,
      city: true,
      region: true,
      district: true,
      address: true,
      area: true,
      landArea: true,
      energyLabel: true,
      construction: true,
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
      isContactPaid: true,
      isOwnerListing: true,
      isActive: true,
      approved: true,
      status: true,
      createdAt: true,
      userId: true,
      user: {
        select: {
          id: true,
          role: true,
          isPromoProfile: true,
          isPremiumBroker: true,
          brokerOfficeName: true,
          brokerPhonePublic: true,
          brokerEmailPublic: true,
          whatsappPhone: true,
          firstName: true,
          lastName: true,
          postalCode: true,
        },
      },
    };
  }

  buildWhere(filters?: {
    city?: string;
    propertyType?: string;
    priceMin?: number;
    priceMax?: number;
    ids?: string[];
  }): Prisma.PropertyWhereInput {
    const and: Prisma.PropertyWhereInput[] = [classicPublicListingWhere];
    if (filters?.ids?.length) and.push({ id: { in: filters.ids } });
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

  async fetchProperties(filters?: {
    city?: string;
    propertyType?: string;
    priceMin?: number;
    priceMax?: number;
    ids?: string[];
  }): Promise<CatalogPropertyRow[]> {
    return this.prisma.property.findMany({
      where: this.buildWhere(filters),
      orderBy: { createdAt: 'desc' },
      select: this.propertySelect(),
    }) as Promise<CatalogPropertyRow[]>;
  }

  async fetchPropertyById(id: string): Promise<CatalogPropertyRow | null> {
    const row = await this.prisma.property.findFirst({
      where: { AND: [classicPublicListingWhere, { id }] },
      select: this.propertySelect(),
    });
    return row as CatalogPropertyRow | null;
  }

  buildFullRawRecord(p: CatalogPropertyRow): MetaCatalogExportRecord | null {
    const image = resolveCatalogMainImage(p);
    if (!image) return null;

    const origin = getPublicPortalUrl();
    const title = (p.seoTitle?.trim() || p.title?.trim() || 'Nemovitost').slice(0, 150);
    const description = (p.seoDescription?.trim() || p.description || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000);
    const link = buildListingPublicSeoUrl(origin, p, 'classic');
    const additionalImages = resolveCatalogGalleryImages(p, image);
    const brokerName =
      p.contactName?.trim() ||
      p.user.brokerOfficeName?.trim() ||
      [p.user.firstName, p.user.lastName].filter(Boolean).join(' ').trim() ||
      '';
    const phone = p.contactPhone?.trim() || p.user.brokerPhonePublic?.trim() || '';
    const email = p.contactEmail?.trim() || p.user.brokerEmailPublic?.trim() || '';
    const whatsapp = p.user.whatsappPhone?.trim() || '';
    const premium = Boolean(p.user.isPromoProfile || p.user.isPremiumBroker);
    const developer = p.user.role === 'DEVELOPER';
    const project = developer ? p.user.brokerOfficeName || title : '';
    const priceFormatted =
      p.price != null ? `${p.price} ${p.currency || 'CZK'}` : '';

    return {
      id: p.id,
      title,
      description,
      price: priceFormatted,
      url: link,
      link,
      main_image: image,
      image_link: image,
      availability: 'in stock',
      additional_image_link: additionalImages,
      gallery: additionalImages,
      video: p.videoUrl?.trim() || null,
      offer_type: p.offerType,
      property_type: p.propertyTypeLabel || p.propertyType || p.propertyTypeKey || '',
      category: p.importCategoryLabel || p.propertyTypeKey || p.propertyType,
      disposition: p.subType?.trim() || '',
      city: p.city,
      district: p.district?.trim() || '',
      region: p.region?.trim() || '',
      postal_code: p.user.postalCode?.trim() || '',
      gps: null,
      area: p.area != null ? String(p.area) : '',
      land_area: p.landArea != null ? String(p.landArea) : '',
      energy_label: p.energyLabel?.trim() || '',
      year_built: p.construction?.trim() || '',
      created_at: p.createdAt.toISOString(),
      updated_at: p.createdAt.toISOString(),
      premium,
      developer,
      project,
      broker_name: brokerName,
      broker: brokerName,
      broker_phone: phone,
      phone,
      broker_email: email,
      email,
      broker_whatsapp: whatsapp,
      whatsapp,
      owner_contact: p.isOwnerListing ? brokerName : '',
      user_id: p.userId,
      crm_info: '',
      internal_notes: '',
      paid_contacts: p.isContactPaid ? '1' : '0',
      brand: 'XXREALIT',
      condition: 'used',
    };
  }

  filterRecord(
    raw: MetaCatalogExportRecord,
    ctx: FeedBuildContext,
  ): MetaCatalogExportRecord {
    const out: MetaCatalogExportRecord = {};
    for (const field of META_CATALOG_FIELDS) {
      if (!this.isFieldEnabled(ctx, field.key)) continue;
      for (const feedKey of field.feedKeys) {
        if (feedKey in raw && !(feedKey in out)) {
          const val = raw[feedKey];
          if (val !== null && val !== undefined && val !== '') {
            out[feedKey] = val;
          }
        }
      }
    }
    if (!out.availability) out.availability = 'in stock';

    const galleryVal = out.gallery ?? out.additional_image_link;
    if (Array.isArray(galleryVal) && galleryVal.length > 0) {
      out.additional_image_link = galleryVal;
      out.gallery = galleryVal;
    }

    return out;
  }

  hashRecord(record: MetaCatalogExportRecord): string {
    return createHash('sha256').update(JSON.stringify(record)).digest('hex');
  }

  validateRecord(
    record: MetaCatalogExportRecord,
    ctx: FeedBuildContext,
    propertyId?: string,
  ): ExportValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const title = String(record.title ?? '');
    const price = String(record.price ?? '');
    const url = String(record.url ?? record.link ?? '');
    const image = String(record.main_image ?? record.image_link ?? '');
    const availability = String(record.availability ?? '');

    if (!title.trim()) errors.push('Chybí název');
    if (!price.trim()) errors.push('Chybí cena');
    if (!url.startsWith('http')) errors.push('Neplatná URL detailu');
    if (!image.startsWith('https://')) errors.push('Hlavní fotografie musí být veřejná HTTPS URL');
    if (availability !== 'in stock') errors.push('Neplatná dostupnost (musí být in stock)');

    const additional =
      (Array.isArray(record.additional_image_link) ? record.additional_image_link : null) ??
      (Array.isArray(record.gallery) ? record.gallery : []);
    for (const raw of additional) {
      const u = String(raw ?? '').trim();
      if (!u) continue;
      if (!u.startsWith('https://')) {
        errors.push(`Doplňková fotografie musí být HTTPS: ${u.slice(0, 60)}`);
      }
    }

    if (!ctx.allowContactExport) {
      const scanKeys = new Set([
        'title',
        'description',
        'broker_name',
        'broker',
        'broker_phone',
        'phone',
        'broker_email',
        'email',
        'broker_whatsapp',
        'whatsapp',
        'owner_contact',
      ]);
      for (const [k, v] of Object.entries(record)) {
        if (SENSITIVE_FIELD_KEYS.has(k)) {
          errors.push(`Citlivé pole ${k} nesmí být exportováno`);
        }
        if (!scanKeys.has(k)) continue;
        const str = Array.isArray(v) ? v.join(' ') : String(v ?? '');
        if (EMAIL_RE.test(str)) errors.push(`Nalezen e-mail v poli ${k}`);
        if (PHONE_RE.test(str)) errors.push(`Nalezen telefon v poli ${k}`);
      }
    }

    const result = { ok: errors.length === 0, errors, warnings };
    if (!result.ok && propertyId) {
      void this.logService.log('validation_failed', errors.join('; '), {
        propertyId,
        details: { errors },
      });
    }
    return result;
  }

  validateBatch(
    records: Array<{ id: string; record: MetaCatalogExportRecord }>,
    ctx: FeedBuildContext,
  ): ExportValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    for (const item of records) {
      const r = this.validateRecord(item.record, ctx, item.id);
      for (const e of r.errors) errors.push(`${item.id}: ${e}`);
      warnings.push(...r.warnings);
    }
    return { ok: errors.length === 0, errors, warnings };
  }

  assertExportSafe(validation: ExportValidationResult) {
    if (!validation.ok) {
      void this.logService.log('export_blocked', validation.errors.join('; '), {
        details: { errors: validation.errors },
      });
      throw new BadRequestException({
        message: 'Export zastaven — nalezeny citlivé nebo neplatné údaje.',
        errors: validation.errors,
      });
    }
  }

  buildPreview(
    raw: MetaCatalogExportRecord,
    filtered: MetaCatalogExportRecord,
    ctx: FeedBuildContext,
  ) {
    const fields: FieldPreviewEntry[] = META_CATALOG_FIELDS.map((f) => {
      const enabled = this.isFieldEnabled(ctx, f.key);
      const feedKey = f.feedKeys[0];
      const rawVal = raw[feedKey];
      const exported = feedKey in filtered;
      const value = Array.isArray(rawVal)
        ? rawVal.join(', ')
        : rawVal == null
          ? ''
          : String(rawVal);
      return {
        key: f.key,
        label: f.label,
        category: f.category,
        enabled,
        exported,
        value: value.slice(0, 200),
      };
    });

    const xml = this.recordToXmlItem(filtered);
    const csvLine = this.recordToCsvLine(filtered);
    const json = JSON.stringify(filtered, null, 2);

    return { fields, xml, csv: csvLine, json };
  }

  private escXml(v: string) {
    return v
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private escCsv(v: string) {
    return `"${v.replace(/"/g, '""')}"`;
  }

  recordToXmlItem(record: MetaCatalogExportRecord): string {
    const lines: string[] = ['    <item>'];
    const esc = (v: string) => this.escXml(v);

    const scalarFields: Array<[string, string]> = [
      ['id', 'g:id'],
      ['title', 'g:title'],
      ['description', 'g:description'],
      ['price', 'g:price'],
      ['availability', 'g:availability'],
      ['link', 'g:link'],
      ['url', 'g:link'],
      ['image_link', 'g:image_link'],
      ['main_image', 'g:image_link'],
      ['offer_type', 'g:custom_label_0'],
      ['city', 'g:custom_label_1'],
      ['property_type', 'g:custom_label_2'],
    ];

    const writtenTags = new Set<string>();
    for (const [key, tag] of scalarFields) {
      if (writtenTags.has(tag)) continue;
      const val = record[key];
      if (val === null || val === undefined || val === '' || Array.isArray(val)) continue;
      writtenTags.add(tag);
      lines.push(`      <${tag}>${esc(String(val))}</${tag}>`);
    }

    if (!writtenTags.has('g:availability')) {
      lines.push('      <g:availability>in stock</g:availability>');
    }

    const additional =
      (Array.isArray(record.additional_image_link) ? record.additional_image_link : null) ??
      (Array.isArray(record.gallery) ? record.gallery : []);
    const mainImage = String(record.image_link ?? record.main_image ?? '');
    for (const img of additional) {
      const url = String(img ?? '').trim();
      if (!url || url === mainImage) continue;
      lines.push(`      <g:additional_image_link>${esc(url)}</g:additional_image_link>`);
    }

    lines.push('    </item>');
    return lines.join('\n');
  }

  recordToCsvLine(record: MetaCatalogExportRecord): string {
    const keys = Object.keys(record).sort();
    const header = keys.join(',');
    const values = keys.map((k) => {
      const v = record[k];
      if (Array.isArray(v)) return this.escCsv(v.join('|'));
      return this.escCsv(v == null ? '' : String(v));
    });
    return `${header}\n${values.join(',')}`;
  }

  buildXmlFeed(records: MetaCatalogExportRecord[]): string {
    const origin = getPublicPortalUrl();
    const items = records.map((r) => this.recordToXmlItem(r)).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>XXREALIT Meta Catalog</title>
    <link>${this.escXml(origin)}</link>
    <description>Facebook Catalog feed nemovitostí</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
  }

  buildCsvFeed(records: MetaCatalogExportRecord[]): string {
    if (records.length === 0) return '\uFEFFid,title\n';
    const allKeys = new Set<string>();
    for (const r of records) Object.keys(r).forEach((k) => allKeys.add(k));
    const keys = [...allKeys].sort();
    const header = keys.join(',');
    const lines = records.map((r) =>
      keys
        .map((k) => {
          const v = r[k];
          if (Array.isArray(v)) return this.escCsv(v.join('|'));
          return this.escCsv(v == null ? '' : String(v));
        })
        .join(','),
    );
    return `\uFEFF${header}\n${lines.join('\n')}\n`;
  }

  buildJsonFeed(records: MetaCatalogExportRecord[]): string {
    const items = records.map((r) => this.toMetaCatalogJsonItem(r));
    return JSON.stringify(
      { generatedAt: new Date().toISOString(), count: items.length, items },
      null,
      2,
    );
  }

  toMetaCatalogJsonItem(record: MetaCatalogExportRecord) {
    const imageLink = String(record.image_link ?? record.main_image ?? '');
    const additional =
      (Array.isArray(record.additional_image_link) ? record.additional_image_link : null) ??
      (Array.isArray(record.gallery) ? record.gallery : []);
    const additionalFiltered = additional
      .map((u) => String(u).trim())
      .filter((u) => u && u !== imageLink);

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(record)) {
      if (k === 'gallery' || k === 'main_image') continue;
      if (Array.isArray(v)) continue;
      if (v !== null && v !== undefined && v !== '') out[k] = v;
    }
    out.image_link = imageLink;
    if (additionalFiltered.length > 0) {
      out.additional_image_link = additionalFiltered;
    }
    return out;
  }

  async getFeedContext(): Promise<FeedBuildContext> {
    const settings = await this.prisma.metaCatalogSetting.findUnique({
      where: { id: SETTINGS_ID },
    });
    return {
      allowContactExport: settings?.allowContactExport ?? false,
      fieldFlags: this.resolveFieldFlags(settings?.exportFieldFlags ?? null),
    };
  }

  async buildExportRecords(filters?: {
    city?: string;
    propertyType?: string;
    priceMin?: number;
    priceMax?: number;
    ids?: string[];
  }): Promise<Array<{ id: string; record: MetaCatalogExportRecord; hash: string }>> {
    const ctx = await this.getFeedContext();
    const rows = await this.fetchProperties(filters);
    const out: Array<{ id: string; record: MetaCatalogExportRecord; hash: string }> = [];
    for (const row of rows) {
      const raw = this.buildFullRawRecord(row);
      if (!raw) continue;
      const record = this.filterRecord(raw, ctx);
      out.push({ id: row.id, record, hash: this.hashRecord(record) });
    }
    return out;
  }

  async buildFeeds(useCache = true): Promise<{ xml: string; csv: string; json: string; count: number }> {
    if (useCache && this.feedCache) {
      return {
        xml: this.feedCache.xml,
        csv: this.feedCache.csv,
        json: this.feedCache.json,
        count: JSON.parse(this.feedCache.json).count as number,
      };
    }
    const ctx = await this.getFeedContext();
    const built = await this.buildExportRecords();
    const validation = this.validateBatch(
      built.map((b) => ({ id: b.id, record: b.record })),
      ctx,
    );
    this.assertExportSafe(validation);
    const records = built.map((b) => b.record);
    const xml = this.buildXmlFeed(records);
    const csv = this.buildCsvFeed(records);
    const json = this.buildJsonFeed(records);
    this.feedCache = { xml, csv, json, at: Date.now() };
    return { xml, csv, json, count: records.length };
  }

  async previewItem(propertyId: string) {
    const ctx = await this.getFeedContext();
    const row = await this.fetchPropertyById(propertyId);
    if (!row) return null;
    const raw = this.buildFullRawRecord(row);
    if (!raw) return null;
    const filtered = this.filterRecord(raw, ctx);
    const validation = this.validateRecord(filtered, ctx, propertyId);
    return {
      propertyId,
      ...this.buildPreview(raw, filtered, ctx),
      validation,
    };
  }
}
