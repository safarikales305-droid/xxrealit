import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ListingImportMethod, ListingImportPortal, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AdminUpdatePropertyDto } from './dto/admin-update-property.dto';
import {
  type PropertyRowForAdmin,
  serializeAdminPropertyRow,
} from '../properties/properties.serializer';
import {
  mapRapidResponseToRows,
  RAPID_REALTY_HOST,
  RAPID_REALTY_LIST_URL,
} from './rapid-realty-import';
import { OwnerListingNotifyService } from '../premium-broker/owner-listing-notify.service';
import { parseStringPromise } from 'xml2js';
import { ImportSyncService } from '../imports/import-sync.service';
import { ImportImageService } from '../imports/import-image.service';
import { ShortsListingService } from '../properties/shorts-listing.service';
import { safeParsePrice } from '../imports/price-parse.util';
import { ImportedBrokerContactService } from '../imported-broker-contacts/imported-broker-contact.service';
import {
  ListingWatermarkSettingsService,
  type ListingWatermarkPosition,
} from '../properties/listing-watermark-settings.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcrypt');

type XmlPropertyRow = {
  title: string;
  price: number | null;
  city: string;
  description: string;
  image: string | null;
};

function toFlatString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const s = toFlatString(item);
      if (s) return s;
    }
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj._ === 'string') return obj._.trim();
  }
  return '';
}

function pickByKeys(obj: unknown, keys: string[]): string {
  if (!obj || typeof obj !== 'object') return '';
  const source = obj as Record<string, unknown>;
  for (const key of keys) {
    if (key in source) {
      const s = toFlatString(source[key]);
      if (s) return s;
    }
  }
  return '';
}

function collectXmlPropertyNodes(node: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (value: unknown) => {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value !== 'object') return;
    const obj = value as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      const key = k.toLowerCase();
      if (
        key === 'property' ||
        key === 'properties' ||
        key === 'offer' ||
        key === 'offers' ||
        key === 'listing' ||
        key === 'listings' ||
        key === 'item' ||
        key === 'items'
      ) {
        if (Array.isArray(v)) {
          for (const item of v) {
            if (item && typeof item === 'object') {
              out.push(item as Record<string, unknown>);
            }
          }
        } else if (v && typeof v === 'object') {
          out.push(v as Record<string, unknown>);
        }
      }
      walk(v);
    }
  };
  walk(node);
  return out;
}

function mapXmlNodeToRow(node: Record<string, unknown>): XmlPropertyRow {
  const title =
    pickByKeys(node, ['title', 'name', 'headline']) || 'Importovaný inzerát';
  const rawPrice = pickByKeys(node, ['price', 'amount', 'cost']);
  const city = pickByKeys(node, ['city', 'town', 'locality']) || 'Neznámé město';
  const description =
    pickByKeys(node, ['description', 'desc', 'text']) || title;
  const image = pickByKeys(node, ['image', 'img', 'photo', 'picture']) || '';
  return {
    title: title.slice(0, 250),
    price: safeParsePrice(rawPrice) ?? null,
    city: city.slice(0, 120),
    description: description.slice(0, 10_000),
    image: image || null,
  };
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ownerListingNotify: OwnerListingNotifyService,
    private readonly importSync: ImportSyncService,
    private readonly importImages: ImportImageService,
    private readonly importedBrokers: ImportedBrokerContactService,
    private readonly shortsListing: ShortsListingService,
    private readonly watermarkSettings: ListingWatermarkSettingsService,
  ) {}

  async getListingPhotoWatermarkSettings() {
    return this.watermarkSettings.getSettings();
  }

  async updateListingPhotoWatermarkSettings(input: {
    enabled?: boolean;
    position?: string;
    logoWidthRatio?: number;
    opacity?: number;
    marginPx?: number;
  }) {
    const positionRaw = (input.position ?? '').trim();
    const position: ListingWatermarkPosition | undefined =
      positionRaw === 'left-top' ||
      positionRaw === 'right-top' ||
      positionRaw === 'left-bottom' ||
      positionRaw === 'right-bottom'
        ? positionRaw
        : undefined;

    const updated = await this.watermarkSettings.updateSettings({
      enabled:
        typeof input.enabled === 'boolean' ? input.enabled : undefined,
      position,
      logoWidthRatio:
        typeof input.logoWidthRatio === 'number'
          ? input.logoWidthRatio
          : undefined,
      opacity: typeof input.opacity === 'number' ? input.opacity : undefined,
      marginPx: typeof input.marginPx === 'number' ? input.marginPx : undefined,
    });

    const mediaRows = await this.prisma.propertyMedia.findMany({
      where: { type: 'image' },
      select: {
        id: true,
        propertyId: true,
        url: true,
        originalUrl: true,
        watermarkedUrl: true,
      },
    });
    for (const m of mediaRows) {
      const original = (m.originalUrl ?? m.url ?? '').trim();
      const nextUrl =
        updated.enabled && (m.watermarkedUrl ?? '').trim()
          ? (m.watermarkedUrl ?? '').trim()
          : original;
      if (!nextUrl) continue;
      if (nextUrl !== (m.url ?? '').trim()) {
        await this.prisma.propertyMedia.update({
          where: { id: m.id },
          data: { url: nextUrl, originalUrl: original || null },
        });
      }
    }

    const properties = await this.prisma.property.findMany({
      where: { deletedAt: null },
      select: { id: true, images: true, media: { where: { type: 'image' }, orderBy: { sortOrder: 'asc' } } },
    });
    for (const p of properties) {
      const mediaImages = p.media
        .map((m) => (m.url ?? '').trim())
        .filter((u) => u.length > 0);
      if (mediaImages.length === 0) continue;
      const dedupe: string[] = [];
      const seen = new Set<string>();
      for (const u of mediaImages) {
        if (seen.has(u)) continue;
        seen.add(u);
        dedupe.push(u);
      }
      if (JSON.stringify(dedupe) !== JSON.stringify(p.images ?? [])) {
        await this.prisma.property.update({
          where: { id: p.id },
          data: { images: dedupe },
        });
      }
    }

    return updated;
  }

  async stats() {
    const [
      totalUsers,
      adminUsers,
      properties,
      pendingProperties,
      visits,
      ownerListings,
      premiumBrokers,
      brokerLeadsSent,
      brokerPointsAgg,
      brokerFreeLeadsAgg,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: UserRole.ADMIN } }),
      this.prisma.property.count(),
      this.prisma.property.count({
        where: { OR: [{ approved: false }, { status: 'PENDING' }] },
      }),
      this.prisma.visit.count(),
      this.prisma.property.count({ where: { isOwnerListing: true } }),
      this.prisma.user.count({
        where: { role: UserRole.AGENT, isPremiumBroker: true },
      }),
      this.prisma.brokerLeadOffer.count(),
      this.prisma.user.aggregate({ _sum: { brokerPoints: true } }),
      this.prisma.user.aggregate({ _sum: { brokerFreeLeads: true } }),
    ]);
    return {
      users: totalUsers - adminUsers,
      admins: adminUsers,
      total: totalUsers,
      properties,
      pendingProperties,
      visits,
      ownerListings,
      premiumBrokers,
      brokerLeadsSent,
      brokerPointsTotal: brokerPointsAgg._sum.brokerPoints ?? 0,
      brokerFreeLeadsOutstanding: brokerFreeLeadsAgg._sum.brokerFreeLeads ?? 0,
    };
  }

  private toAdminRow(
    r: {
      likes?: { id: string }[];
      user: { id: string; email: string; city: string | null };
      _count: { likes: number };
    } & Record<string, unknown>,
  ): Record<string, unknown> {
    return serializeAdminPropertyRow({
      ...(r as unknown as PropertyRowForAdmin),
      likes: [],
    });
  }

  async listAllProperties() {
    const rows = await this.prisma.property.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, city: true } },
        _count: { select: { likes: true } },
      },
    });
    return rows.map((r) => this.toAdminRow(r));
  }

  async listPendingProperties() {
    const rows = await this.prisma.property.findMany({
      where: {
        deletedAt: null,
        OR: [{ approved: false }, { status: 'PENDING' }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, city: true } },
        _count: { select: { likes: true } },
      },
    });
    return rows.map((r) => this.toAdminRow(r));
  }

  async listListings(filters: {
    search?: string;
    listingType?: string;
    status?: string;
    userId?: string;
    city?: string;
    source?: string;
    importMethod?: string;
    propertyTypeKey?: string;
    importCategoryKey?: string;
    sourcePortalKey?: string;
    createdFrom?: string;
    createdTo?: string;
  }) {
    const parts: Prisma.PropertyWhereInput[] = [];
    const now = new Date();

    const q = filters.search?.trim();
    if (q) {
      parts.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { city: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    const lt = filters.listingType?.trim().toUpperCase();
    if (lt === 'SHORTS' || lt === 'CLASSIC') {
      parts.push({ listingType: lt });
    }

    const uid = filters.userId?.trim();
    if (uid) {
      parts.push({ userId: uid });
    }

    const cityQ = filters.city?.trim();
    if (cityQ) {
      parts.push({ city: { contains: cityQ, mode: 'insensitive' } });
    }
    const sourceQ = (filters.source ?? '').trim().toLowerCase();
    if (sourceQ) {
      if (Object.values(ListingImportPortal).includes(sourceQ as ListingImportPortal)) {
        parts.push({ importSource: sourceQ as ListingImportPortal });
      }
    }
    const methodQ = (filters.importMethod ?? '').trim().toLowerCase();
    if (methodQ) {
      if (Object.values(ListingImportMethod).includes(methodQ as ListingImportMethod)) {
        parts.push({ importMethod: methodQ as ListingImportMethod });
      }
    }

    const ptk = filters.propertyTypeKey?.trim();
    if (ptk) {
      parts.push({ propertyTypeKey: ptk });
    }
    const ick = filters.importCategoryKey?.trim();
    if (ick) {
      parts.push({ importCategoryKey: ick });
    }
    const spk = filters.sourcePortalKey?.trim();
    if (spk) {
      parts.push({ sourcePortalKey: spk });
    }

    const cf = filters.createdFrom?.trim()
      ? new Date(filters.createdFrom.trim())
      : null;
    const ct = filters.createdTo?.trim()
      ? new Date(filters.createdTo.trim())
      : null;
    const created: Prisma.DateTimeFilter = {};
    if (cf && Number.isFinite(cf.getTime())) created.gte = cf;
    if (ct && Number.isFinite(ct.getTime())) created.lte = ct;
    if (Object.keys(created).length > 0) {
      parts.push({ createdAt: created });
    }

    const st = filters.status?.trim().toUpperCase();
    switch (st) {
      case 'DELETED':
        parts.push({ NOT: { deletedAt: null } });
        break;
      case 'PENDING_APPROVAL':
        parts.push({ deletedAt: null, approved: false });
        break;
      case 'INACTIVE':
        parts.push({ deletedAt: null, isActive: false });
        break;
      case 'EXPIRED':
        parts.push({
          deletedAt: null,
          approved: true,
          isActive: true,
          activeUntil: { lt: now },
        });
        break;
      case 'SCHEDULED':
        parts.push({
          deletedAt: null,
          approved: true,
          isActive: true,
          activeFrom: { gt: now },
        });
        break;
      case 'ACTIVE':
        parts.push({ deletedAt: null, approved: true, isActive: true });
        parts.push({
          OR: [{ activeFrom: null }, { activeFrom: { lte: now } }],
        });
        parts.push({
          OR: [{ activeUntil: null }, { activeUntil: { gte: now } }],
        });
        break;
      default:
        break;
    }

    const where: Prisma.PropertyWhereInput =
      parts.length > 0 ? { AND: parts } : {};

    const rows = await this.prisma.property.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        user: { select: { id: true, email: true, city: true } },
        _count: { select: { likes: true } },
      },
    });
    return rows.map((r) => this.toAdminRow(r));
  }

  async updateProperty(propertyId: string, dto: AdminUpdatePropertyDto) {
    const existing = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!existing) {
      throw new NotFoundException('Inzerát nenalezen');
    }

    const data: Prisma.PropertyUpdateInput = {};

    if (dto.title !== undefined) {
      data.title = dto.title.trim();
    }
    if (dto.price !== undefined) {
      data.price = dto.price;
    }
    if (dto.city !== undefined) {
      data.city = dto.city.trim();
    }
    if (dto.description !== undefined) {
      data.description = dto.description.trim();
    }
    if (dto.images !== undefined) {
      data.images = dto.images.map((x) => x.trim()).filter((x) => x.length > 0);
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }
    if (dto.approved !== undefined) {
      data.approved = dto.approved;
      if (dto.approved) {
        data.status = 'APPROVED';
      }
    }
    if (dto.listingType !== undefined) {
      data.listingType = dto.listingType;
    }
    if (dto.viewsCount !== undefined) {
      data.viewsCount = Math.max(0, Math.trunc(dto.viewsCount));
    }
    if (dto.autoViewsEnabled !== undefined) {
      data.autoViewsEnabled = dto.autoViewsEnabled;
      if (dto.autoViewsEnabled) {
        data.lastAutoViewsAt = new Date();
      }
      if (!dto.autoViewsEnabled) {
        data.lastAutoViewsAt = null;
      }
    }
    if (dto.autoViewsIncrement !== undefined) {
      if (dto.autoViewsIncrement <= 0) {
        throw new BadRequestException('autoViewsIncrement musí být > 0');
      }
      data.autoViewsIncrement = Math.trunc(dto.autoViewsIncrement);
    }
    if (dto.autoViewsIntervalMinutes !== undefined) {
      if (dto.autoViewsIntervalMinutes <= 0) {
        throw new BadRequestException('autoViewsIntervalMinutes musí být > 0');
      }
      data.autoViewsIntervalMinutes = Math.trunc(dto.autoViewsIntervalMinutes);
    }
    if (
      existing.autoViewsEnabled &&
      existing.lastAutoViewsAt == null &&
      dto.autoViewsEnabled === undefined
    ) {
      data.lastAutoViewsAt = new Date();
    }

    const toDateOrNull = (v: string | null | undefined): Date | null => {
      if (v === null || v === undefined) return null;
      const s = v.trim();
      if (!s) return null;
      const d = new Date(s);
      return Number.isFinite(d.getTime()) ? d : null;
    };

    if (dto.activeFrom !== undefined) {
      data.activeFrom = toDateOrNull(dto.activeFrom ?? null);
    }
    if (dto.activeUntil !== undefined) {
      data.activeUntil = toDateOrNull(dto.activeUntil ?? null);
    }
    if (dto.restore === true) {
      data.deletedAt = null;
    }
    if (dto.importDisabled !== undefined) {
      data.importDisabled = dto.importDisabled;
      if (dto.importDisabled) {
        data.isActive = false;
      }
    }

    if (Object.keys(data).length === 0) {
      const row = await this.prisma.property.findUnique({
        where: { id: propertyId },
        include: {
          user: { select: { id: true, email: true, city: true } },
          _count: { select: { likes: true } },
        },
      });
      if (!row) throw new NotFoundException('Inzerát nenalezen');
      return this.toAdminRow(row);
    }

    const updated = await this.prisma.property.update({
      where: { id: propertyId },
      data,
      include: {
        user: { select: { id: true, email: true, city: true } },
        _count: { select: { likes: true } },
      },
    });

    return this.toAdminRow(updated);
  }

  async listUsers() {
    const rows = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        avatar: true,
        createdAt: true,
        name: true,
        isPremiumBroker: true,
        brokerPoints: true,
        brokerFreeLeads: true,
        creditBalance: true,
      },
    });
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      avatarUrl: u.avatar,
      createdAt: u.createdAt,
      isPremiumBroker: u.isPremiumBroker,
      brokerPoints: u.brokerPoints,
      brokerFreeLeads: u.brokerFreeLeads,
      creditBalance: u.creditBalance,
    }));
  }

  async updateUserCreditBalance(_actorId: string, targetId: string, creditBalance: number) {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) {
      throw new NotFoundException('Uživatel nenalezen');
    }
    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { creditBalance: Math.max(0, Math.trunc(creditBalance)) },
      select: { id: true, creditBalance: true },
    });
    return { ok: true, id: updated.id, creditBalance: updated.creditBalance };
  }

  async updateUserPremiumBroker(_actorId: string, targetId: string, isPremiumBroker: boolean) {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) {
      throw new NotFoundException('Uživatel nenalezen');
    }
    if (target.role !== UserRole.AGENT) {
      throw new BadRequestException('Premium makléř lze nastavit jen účtu s rolí AGENT.');
    }
    return this.prisma.user.update({
      where: { id: targetId },
      data: { isPremiumBroker },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isPremiumBroker: true,
      },
    });
  }

  async approveProperty(propertyId: string) {
    const p = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!p) {
      throw new NotFoundException('Inzerát nenalezen');
    }
    const wasPending = !p.approved;
    const updated = await this.prisma.property.update({
      where: { id: propertyId },
      data: { approved: true, status: 'APPROVED', isActive: true },
    });
    if (wasPending && updated.isOwnerListing && !updated.derivedFromPropertyId) {
      await this.ownerListingNotify.notifyPremiumBrokersForNewOwnerListing({
        id: updated.id,
        title: updated.title,
        city: updated.city,
        region: updated.region ?? '',
        district: updated.district ?? '',
        propertyType: updated.propertyType,
        isOwnerListing: updated.isOwnerListing,
      });
    }
    return updated;
  }

  async deleteProperty(propertyId: string) {
    const p = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!p) {
      throw new NotFoundException('Inzerát nenalezen');
    }
    await this.prisma.property.update({
      where: { id: propertyId },
      data: { deletedAt: new Date() },
    });
    return { success: true };
  }

  /**
   * RapidAPI Realty in US — import pod účtem volajícího admina (approved = true).
   */
  async importPropertiesFromRapidApi(adminUserId: string, apiKeyRaw: string) {
    const apiKey = typeof apiKeyRaw === 'string' ? apiKeyRaw.trim() : '';
    if (!apiKey) {
      throw new BadRequestException('apiKey je povinný');
    }

    const url = new URL(RAPID_REALTY_LIST_URL);
    url.searchParams.set('limit', '20');
    url.searchParams.set('city', 'Houston');
    url.searchParams.set('state_code', 'TX');

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': RAPID_REALTY_HOST,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      throw new BadRequestException('Nepodařilo se spojit s RapidAPI');
    }

    if (res.status === 401 || res.status === 403) {
      throw new UnauthorizedException('Neplatný nebo nepovolený RapidAPI klíč');
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new BadRequestException(
        `RapidAPI vrátilo HTTP ${res.status}${text ? `: ${text.slice(0, 240)}` : ''}`,
      );
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new BadRequestException('RapidAPI nevrátilo platné JSON');
    }

    const rows = mapRapidResponseToRows(json);
    if (rows.length === 0) {
      throw new BadRequestException(
        'API nevrátilo žádné zpracovatelné inzeráty. Zkontrolujte klíč nebo strukturu odpovědi.',
      );
    }

    const maxPerRun = 50;
    const slice = rows.slice(0, maxPerRun);
    let imported = 0;
    for (const row of slice) {
      await this.prisma.property.create({
        data: {
          title: row.title,
          description: row.description ?? row.title,
          price: row.price,
          city: row.city,
          address: row.city,
          currency: 'USD',
          offerType: 'prodej',
          propertyType: 'import',
          subType: '',
          images: row.imageUrl ? [row.imageUrl] : [],
          videoUrl: null,
          contactName: 'RapidAPI import',
          contactPhone: '+000',
          contactEmail: 'import@example.com',
          userId: adminUserId,
          approved: true,
          status: 'APPROVED',
          listingType: 'CLASSIC',
          isActive: true,
        },
      });
      imported += 1;
    }

    return { imported };
  }

  async importPropertiesFromXml(adminUserId: string, xmlUrlRaw: string) {
    const xmlUrl = typeof xmlUrlRaw === 'string' ? xmlUrlRaw.trim() : '';
    if (!xmlUrl) {
      throw new BadRequestException('url je povinná');
    }
    if (!/^https?:\/\//i.test(xmlUrl)) {
      throw new BadRequestException('url musí začínat http:// nebo https://');
    }

    let res: Response;
    try {
      res = await fetch(xmlUrl, {
        headers: { Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8' },
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      throw new BadRequestException('Nepodařilo se stáhnout XML feed');
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new BadRequestException(
        `XML feed vrátil HTTP ${res.status}${text ? `: ${text.slice(0, 240)}` : ''}`,
      );
    }

    const xmlText = await res.text();
    let parsed: unknown;
    try {
      parsed = await parseStringPromise(xmlText, {
        explicitArray: false,
        trim: true,
        mergeAttrs: true,
      });
    } catch {
      throw new BadRequestException('Nepodařilo se parsovat XML (xml2js)');
    }

    const nodes = collectXmlPropertyNodes(parsed);
    if (nodes.length === 0) {
      throw new BadRequestException('V XML nebyly nalezeny žádné nemovitosti');
    }

    const maxPerRun = 200;
    const rows = nodes.slice(0, maxPerRun).map(mapXmlNodeToRow);

    let imported = 0;
    for (const row of rows) {
      await this.prisma.property.create({
        data: {
          title: row.title,
          description: row.description,
          price: row.price,
          city: row.city,
          address: row.city,
          currency: 'CZK',
          offerType: 'prodej',
          propertyType: 'import',
          subType: '',
          images: row.image ? [row.image] : [],
          videoUrl: null,
          contactName: 'XML import',
          contactPhone: '+000',
          contactEmail: 'import@example.com',
          userId: adminUserId,
          approved: true,
          status: 'APPROVED',
          listingType: 'CLASSIC',
          isActive: true,
        },
      });
      imported += 1;
    }

    return { imported };
  }

  async importApifyDataset(adminUserId: string, datasetUrlRaw: string) {
    try {
      const datasetUrlInput = (datasetUrlRaw ?? '').trim();
      if (!datasetUrlInput) {
        throw new BadRequestException('datasetUrl je povinný');
      }
      const datasetUrl = this.normalizeApifyDatasetUrl(datasetUrlInput);
      const datasetUrlForLog = this.sanitizeUrlForLog(datasetUrl);

      const source = await this.ensureManualApifySource(datasetUrl);
      let imported = 0;
      let updated = 0;
      let failed = 0;
      let brokersCreated = 0;
      let brokersUpdated = 0;
      let imagesSaved = 0;
      let lastError: string | null = null;
      const seenExternalIds = new Set<string>();
      const seenSourceUrls = new Set<string>();
      let firstItemKeys: string[] = [];

      this.logger.log(`[apify-dataset] import start url=${datasetUrlForLog}`);
      let rows: Record<string, unknown>[];
      try {
        const response = await fetch(datasetUrl, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(45_000),
        });
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new BadRequestException(
            `Apify dataset vrátil HTTP ${response.status}${body ? `: ${body.slice(0, 240)}` : ''}`,
          );
        }
        const payload = (await response.json().catch(() => null)) as unknown;
        if (!Array.isArray(payload)) {
          throw new BadRequestException(
            'Apify dataset musí vracet JSON pole (array). Zkontroluj URL a parametry clean=true&format=json.',
          );
        }
        rows = payload.filter(
          (x): x is Record<string, unknown> => !!x && typeof x === 'object',
        );
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        const msg = e instanceof Error ? e.message : String(e);
        throw new BadRequestException(`Nepodařilo se stáhnout/parsovat Apify dataset: ${msg}`);
      }

      if (rows.length === 0) {
        throw new BadRequestException('Apify dataset neobsahuje žádné položky.');
      }
      firstItemKeys = Object.keys(rows[0] ?? {}).slice(0, 20);
      this.logger.log(
        `[apify-dataset] items=${rows.length} firstKeys=${firstItemKeys.join(',')}`,
      );

      for (let index = 0; index < rows.length; index += 1) {
        const item = rows[index]!;
        try {
          const mapped = this.mapApifyDatasetItem(item, index);
          if (!mapped.externalId && !mapped.sourceUrl) {
            failed += 1;
            lastError = `Položka #${index + 1} nemá externalId ani sourceUrl.`;
            this.logger.warn(`[apify-dataset] mapping skip index=${index} reason=${lastError}`);
            continue;
          }
          if (mapped.externalId) seenExternalIds.add(mapped.externalId);
          if (mapped.sourceUrl) seenSourceUrls.add(mapped.sourceUrl);

          let property = mapped.sourceUrl
            ? await this.prisma.property.findFirst({
                where: {
                  importSource: ListingImportPortal.apify,
                  importMethod: ListingImportMethod.apify,
                  importSourceUrl: mapped.sourceUrl,
                },
              })
            : null;
          if (!property && mapped.externalId) {
            property = await this.prisma.property.findUnique({
              where: {
                importSource_importExternalId: {
                  importSource: ListingImportPortal.apify,
                  importExternalId: mapped.externalId,
                },
              },
            });
          }

          const isNew = !property;
          if (!property) {
            property = await this.prisma.property.create({
              data: {
                userId: adminUserId,
                title: mapped.title,
                description: mapped.description || mapped.title,
                price: mapped.price,
                city: mapped.city || 'Neuvedeno',
                address: mapped.address || mapped.city || 'Neuvedeno',
                region: undefined,
                offerType: mapped.offerType,
                propertyType: mapped.propertyType,
                area: mapped.usableArea,
                landArea: mapped.landArea,
                images: [],
                approved: true,
                status: 'APPROVED',
                isActive: true,
                listingType: 'CLASSIC',
                importSource: ListingImportPortal.apify,
                importMethod: ListingImportMethod.apify,
                importExternalId: mapped.externalId || `source:${mapped.sourceUrl}`,
                importSourceUrl: mapped.sourceUrl || undefined,
                importedAt: new Date(),
                lastSyncedAt: new Date(),
                sourcePortalKey: 'apify',
                sourcePortalLabel: 'APIFY',
                importCategoryKey: 'manual_dataset',
                importCategoryLabel: 'Manual dataset',
                contactName: mapped.contactName || mapped.companyName || '',
                contactPhone: mapped.contactPhone || '',
                contactEmail: mapped.contactEmail || '',
              },
            });
          } else {
            property = await this.prisma.property.update({
              where: { id: property.id },
              data: {
                title: mapped.title || property.title,
                description: mapped.description || property.description,
                price: mapped.price ?? property.price,
                city: mapped.city || property.city,
                address: mapped.address || property.address,
                offerType: mapped.offerType || property.offerType,
                propertyType: mapped.propertyType || property.propertyType,
                area: mapped.usableArea ?? property.area,
                landArea: mapped.landArea ?? property.landArea,
                importSourceUrl: mapped.sourceUrl || property.importSourceUrl,
                isActive: true,
                lastSyncedAt: new Date(),
                contactName: mapped.contactName || mapped.companyName || property.contactName,
                contactPhone: mapped.contactPhone || property.contactPhone,
                contactEmail: mapped.contactEmail || property.contactEmail,
              },
            });
          }

          const mediaVariants: Array<{ originalUrl: string; watermarkedUrl: string | null }> = [];
          for (let i = 0; i < mapped.images.length; i += 1) {
            const mirrored = await this.importImages.importExternalImageToPortal({
              imageUrl: mapped.images[i]!,
              propertyId: property.id,
              sourcePortalKey: 'apify',
              index: i,
            });
            if (!mirrored?.storedUrl) continue;
            mediaVariants.push({
              originalUrl: mirrored.storedUrl,
              watermarkedUrl: mirrored.watermarkedUrl ?? null,
            });
          }
          imagesSaved += mediaVariants.length;

          if (mediaVariants.length > 0) {
            const imageUrls = mediaVariants.map((m) => m.originalUrl);
            await this.prisma.property.update({
              where: { id: property.id },
              data: { images: imageUrls },
            });
            await this.prisma.propertyMedia.deleteMany({
              where: { propertyId: property.id, type: 'image' },
            });
            await this.prisma.propertyMedia.createMany({
              data: mediaVariants.map((m, idx) => ({
                propertyId: property.id,
                url: m.originalUrl,
                originalUrl: m.originalUrl,
                watermarkedUrl: m.watermarkedUrl,
                type: 'image',
                sortOrder: idx + 1,
              })),
            });
          }

          const brokerSync = await this.importedBrokers.syncFromImportedProperty(property.id);
          if (brokerSync === 'created') brokersCreated += 1;
          if (brokerSync === 'updated') brokersUpdated += 1;

          if (isNew) imported += 1;
          else updated += 1;
        } catch (e) {
          failed += 1;
          lastError = e instanceof Error ? e.message : String(e);
          this.logger.warn(
            `[apify-dataset] item failed index=${index} error=${lastError}`,
          );
        }
      }

      await this.prisma.property.updateMany({
        where: {
          importSource: ListingImportPortal.apify,
          importMethod: ListingImportMethod.apify,
          isActive: true,
          AND: [
            { importExternalId: { notIn: [...seenExternalIds] } },
            { importSourceUrl: { notIn: [...seenSourceUrls] } },
          ],
        },
        data: { isActive: false, lastSyncedAt: new Date() },
      });

      await this.prisma.importSource.update({
        where: { id: source.id },
        data: {
          startUrl: datasetUrl,
          lastRunAt: new Date(),
          lastStatus: failed > 0 ? 'completed_with_errors' : 'completed',
          lastError,
        },
      });
      await this.prisma.importLog.create({
        data: {
          sourceId: source.id,
          portal: ListingImportPortal.apify,
          method: ListingImportMethod.apify,
          status: failed > 0 ? 'completed_with_errors' : 'completed',
          importedNew: imported,
          importedUpdated: updated,
          skipped: 0,
          disabled: 0,
          error: lastError,
          message: `Manual APIFY dataset import: imported=${imported}, updated=${updated}, failed=${failed}`,
          payloadJson: {
            datasetUrl: datasetUrlForLog,
            imported,
            updated,
            failed,
            brokersCreated,
            brokersUpdated,
            imagesSaved,
            firstItemKeys,
            lastError,
          } as Prisma.InputJsonValue,
        },
      });

      return {
        imported,
        updated,
        failed,
        brokersCreated,
        brokersUpdated,
        imagesSaved,
        firstItemKeys,
        lastError,
      };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      const message = e instanceof Error ? e.message : String(e);
      throw new BadRequestException(`Import Apify datasetu selhal: ${message}`);
    }
  }

  private mapApifyDatasetItem(item: Record<string, unknown>, index: number) {
    const asString = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    const pick = (...keys: string[]): string => {
      for (const key of keys) {
        const val = asString(item[key]);
        if (val) return val;
      }
      return '';
    };
    const pickAny = (...keys: string[]): unknown => {
      for (const key of keys) {
        if (key in item) return item[key];
      }
      return undefined;
    };
    const location =
      pickAny('location', 'Umístění', 'Umisteni') &&
      typeof pickAny('location', 'Umístění', 'Umisteni') === 'object'
        ? (pickAny('location', 'Umístění', 'Umisteni') as Record<string, unknown>)
        : null;
    const contact =
      item.contact && typeof item.contact === 'object'
        ? (item.contact as Record<string, unknown>)
        : null;
    const rawImages = pickAny('images', 'Obrázky', 'Obrazky');
    const rawSingleImage = pick('image', 'Obraz');
    const images = Array.isArray(rawImages)
      ? rawImages
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.trim())
          .filter((x) => /^https?:\/\//i.test(x))
      : rawSingleImage && /^https?:\/\//i.test(rawSingleImage)
        ? [rawSingleImage]
        : [];
    const sourceUrl = pick('sourceUrl', 'url', 'detailUrl', 'listingUrl', 'Odkaz', 'Link');
    const externalId =
      pick('externalId', 'id', 'itemId', 'listingId', 'ID') ||
      sourceUrl ||
      `apify-dataset-item-${index + 1}`;
    return {
      externalId,
      sourceUrl,
      title: pick('title', 'Titul', 'name', 'Název', 'Nazev') || 'APIFY inzerát',
      description: pick('description', 'popis', 'Popis', 'text'),
      price: safeParsePrice(pick('price', 'Cena', 'priceText', 'priceValue')),
      address:
        pick('address', 'adresa', 'streetAddress') ||
        asString(location?.address) ||
        asString(pickAny('Umístění', 'Umisteni')),
      city: pick('city', 'Město', 'Mesto') || asString(location?.city),
      propertyType: pick('propertyType', 'type') || 'nemovitost',
      offerType: pick('offerType', 'listingType') || 'prodej',
      contactName: pick('contactName') || asString(contact?.name),
      contactEmail: pick('contactEmail', 'email') || asString(contact?.email),
      contactPhone: pick('contactPhone', 'phone') || asString(contact?.phone),
      companyName:
        pick('companyName', 'agencyName', 'agency', 'company', 'Značka', 'Znacka') ||
        asString(contact?.company),
      usableArea: safeParsePrice(pick('Plocha_domu_m2', 'usableArea')),
      landArea: safeParsePrice(pick('Plocha_pozemku_m2', 'landArea')),
      images,
    };
  }

  private normalizeApifyDatasetUrl(raw: string): string {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new BadRequestException('datasetUrl musí být validní URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('datasetUrl musí začínat http:// nebo https://');
    }
    const path = parsed.pathname.toLowerCase();
    const isDatasetItems = path.includes('/v2/datasets/') && path.endsWith('/items');
    if (!isDatasetItems) {
      throw new BadRequestException(
        'Použijte Apify Dataset items URL, ne Actor run/Input URL.',
      );
    }
    if (!parsed.searchParams.get('clean')) parsed.searchParams.set('clean', 'true');
    if (!parsed.searchParams.get('format')) parsed.searchParams.set('format', 'json');
    return parsed.toString();
  }

  private sanitizeUrlForLog(raw: string): string {
    try {
      const parsed = new URL(raw);
      if (parsed.searchParams.has('token')) parsed.searchParams.set('token', '***');
      return parsed.toString();
    } catch {
      return raw;
    }
  }

  private async ensureManualApifySource(datasetUrl: string) {
    const datasetId = this.extractDatasetIdFromApifyItemsUrl(datasetUrl);
    const settingsJson: Prisma.InputJsonValue = {
      sourceType: 'APIFY_DATASET',
    };
    const existing = await this.prisma.importSource.findUnique({
      where: {
        portalKey_categoryKey_method: {
          portalKey: 'apify',
          categoryKey: 'manual_dataset',
          method: ListingImportMethod.apify,
        },
      },
    });
    if (existing) {
      return this.prisma.importSource.update({
        where: { id: existing.id },
        data: {
          datasetId: datasetId || undefined,
          datasetUrl,
          sourceType: 'APIFY_DATASET',
          settingsJson,
        },
      });
    }
    return this.prisma.importSource.create({
      data: {
        portal: ListingImportPortal.apify,
        method: ListingImportMethod.apify,
        name: 'Manual APIFY dataset import',
        portalKey: 'apify',
        portalLabel: 'APIFY',
        categoryKey: 'manual_dataset',
        categoryLabel: 'Manual dataset',
        enabled: true,
        intervalMinutes: 60,
        limitPerRun: 500,
        datasetId: datasetId || undefined,
        datasetUrl,
        sourceType: 'APIFY_DATASET',
        startUrl: datasetUrl,
        settingsJson,
        isActive: true,
      },
    });
  }

  private extractDatasetIdFromApifyItemsUrl(datasetUrl: string): string {
    try {
      const parsed = new URL(datasetUrl);
      const m = parsed.pathname.match(/\/v2\/datasets\/([^/]+)\/items$/i);
      return m?.[1]?.trim() ?? '';
    } catch {
      return '';
    }
  }

  /**
   * Jednorázová oprava špatných fallback cen (např. 1 / 100 / 697 Kč) u importu Reality.cz.
   */
  async repairRealityImportedPricePlaceholders() {
    const updated = await this.prisma.property.updateMany({
      where: {
        importSource: ListingImportPortal.reality_cz,
        price: { not: null, lt: 1000 },
      },
      data: { price: null },
    });
    return { affected: updated.count };
  }

  async listImportSources() {
    return this.importSync.listSources();
  }

  async listImportSourcesOverview(filter: {
    portalKey?: string;
    onlyEnabled?: boolean;
    onlyRunning?: boolean;
    onlyError?: boolean;
    search?: string;
  }) {
    return this.importSync.listSourcesOverview(filter);
  }

  async updateImportSource(sourceId: string, patch: {
    enabled?: boolean;
    intervalMinutes?: number;
    limitPerRun?: number;
    endpointUrl?: string | null;
    actorId?: string | null;
    actorTaskId?: string | null;
    datasetId?: string | null;
    startUrl?: string | null;
    sourcePortal?: string | null;
    notes?: string | null;
    isActive?: boolean;
    portalKey?: string;
    portalLabel?: string;
    categoryKey?: string;
    categoryLabel?: string;
    listingType?: string | null;
    propertyType?: string | null;
    sortOrder?: number;
    credentialsJson?: Prisma.InputJsonValue | null;
    settingsJson?: Prisma.InputJsonValue | null;
  }) {
    return this.importSync.updateSource(sourceId, patch);
  }

  async createImportSource(input: {
    portal: ListingImportPortal;
    method: ListingImportMethod;
    name: string;
    portalKey: string;
    portalLabel: string;
    categoryKey: string;
    categoryLabel: string;
    endpointUrl?: string | null;
    actorId?: string | null;
    actorTaskId?: string | null;
    datasetId?: string | null;
    startUrl?: string | null;
    sourcePortal?: string | null;
    notes?: string | null;
    isActive?: boolean;
    intervalMinutes?: number;
    limitPerRun?: number;
    enabled?: boolean;
    settingsJson?: Prisma.InputJsonValue | null;
    credentialsJson?: Prisma.InputJsonValue | null;
    sortOrder?: number;
  }) {
    return this.importSync.createSource(input);
  }

  async deleteImportSource(sourceId: string) {
    return this.importSync.deleteSource(sourceId);
  }

  async runImportSource(sourceId: string, actorUserId: string) {
    return this.importSync.runSource(sourceId, actorUserId);
  }

  async runApifyImportSource(sourceId: string, actorUserId: string) {
    return this.importSync.runSource(sourceId, actorUserId);
  }

  async toggleImportSource(sourceId: string, enabled: boolean) {
    return this.importSync.toggleSourceEnabled(sourceId, enabled);
  }

  async getImportSourceStatus(sourceId: string) {
    return this.importSync.getSourceStatus(sourceId);
  }

  async getImportSourceProgress(sourceId: string) {
    return this.importSync.getSourceProgress(sourceId);
  }

  async runImportPortal(portalKey: string, actorUserId: string) {
    return this.importSync.runPortal(portalKey, actorUserId);
  }

  /** NDJSON řádky: `{type:\"progress\",percent,message}` pak `{type:\"result\",...}` nebo `{type:\"error\",message}`. */
  async runImportSourceStream(
    sourceId: string,
    actorUserId: string,
    writeLine: (chunk: string) => void,
  ): Promise<void> {
    const emit = (obj: Record<string, unknown>) => {
      writeLine(`${JSON.stringify(obj)}\n`);
    };
    try {
      const result = await this.importSync.runSource(sourceId, actorUserId, (p) => {
        emit({
          type: 'progress',
          percent: p.percent,
          message: p.message,
          phase: p.phase,
          totalListings: p.totalListings,
          processedListings: p.processedListings,
          totalDetails: p.totalDetails,
          processedDetails: p.processedDetails,
          savedCount: p.savedCount,
          updatedCount: p.updatedCount,
          skippedCount: p.skippedCount,
          errorCount: p.errorCount,
          failedCount: p.failedCount,
          lastProcessedSourceUrl: p.lastProcessedSourceUrl,
          lastItemErrorMessage: p.lastItemErrorMessage,
          lastItemErrorCategory: p.lastItemErrorCategory,
          lastItemErrorExternalId: p.lastItemErrorExternalId,
          itemErrorLog: p.itemErrorLog,
          progressPercent: p.progressPercent,
          currentMessage: p.currentMessage,
        });
      });
      emit({
        type: 'result',
        importedNew: result.importedNew,
        importedUpdated: result.importedUpdated,
        skipped: result.skipped,
        skippedInvalid: result.skippedInvalid,
        failed: result.failed,
        disabled: result.disabled,
        summary: result.summary ?? null,
        warnings: result.warnings ?? [],
        stats: result.stats ?? null,
        errors: result.errors ?? [],
        itemErrors: result.itemErrors ?? [],
      });
    } catch (err: unknown) {
      let message = 'Neznámá chyba importu';
      if (err instanceof HttpException) {
        const r = err.getResponse();
        if (typeof r === 'string') {
          message = r;
        } else if (r && typeof r === 'object') {
          const m = (r as { message?: unknown }).message;
          if (Array.isArray(m)) message = m.map(String).join(', ');
          else if (typeof m === 'string') message = m;
          else message = err.message;
        }
      } else if (err instanceof Error) {
        message = err.message;
      }
      emit({ type: 'error', message });
    }
  }

  async listImportLogs(filter?: { sourceId?: string; portalKey?: string; categoryKey?: string }) {
    return this.importSync.listLogs(filter);
  }

  async bulkDisableImportedListings(filter: {
    source?: ListingImportPortal;
    method?: ListingImportMethod;
  }) {
    return this.importSync.bulkDisableByFilter({
      portal: filter.source,
      method: filter.method,
    });
  }

  async updateUserRole(_actorId: string, targetId: string, newRole: UserRole) {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) {
      throw new NotFoundException('Uživatel nenalezen');
    }
    if (target.role === UserRole.ADMIN && newRole !== UserRole.ADMIN) {
      const adminCount = await this.prisma.user.count({
        where: { role: UserRole.ADMIN },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('Nelze odebrat posledního administrátora');
      }
    }
    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { role: newRole },
      select: {
        id: true,
        email: true,
        role: true,
        avatar: true,
        createdAt: true,
        name: true,
      },
    });
    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      avatarUrl: updated.avatar,
      createdAt: updated.createdAt,
    };
  }

  async deleteUser(actorId: string, targetId: string) {
    if (actorId === targetId) {
      throw new BadRequestException('Nelze smazat vlastní účet');
    }
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) {
      throw new NotFoundException('Uživatel nenalezen');
    }
    if (target.role === UserRole.ADMIN) {
      const adminCount = await this.prisma.user.count({
        where: { role: UserRole.ADMIN },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('Nelze smazat posledního administrátora');
      }
    }
    await this.prisma.user.delete({ where: { id: targetId } });
    return { success: true };
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('Nové heslo musí mít alespoň 8 znaků');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    if (!user) {
      throw new NotFoundException();
    }
    const ok = await bcrypt.compare(oldPassword, user.password);
    if (!ok) {
      throw new UnauthorizedException('Současné heslo je nesprávné');
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hash },
    });
    return { success: true };
  }

  async bulkShortsDraftsFromImported(body: {
    sourcePortalKey?: string;
    importCategoryKey?: string;
    city?: string;
    onlyNewImports?: boolean;
    limit?: number;
    propertyIds?: string[];
  }) {
    const limit = Math.min(Math.max(body.limit ?? 50, 1), 500);
    const where: Prisma.PropertyWhereInput = {
      importSource: { not: null },
      importDisabled: false,
      deletedAt: null,
      listingType: 'CLASSIC',
      canGenerateShorts: true,
      shortsGenerated: false,
    };
    if (body.sourcePortalKey?.trim()) {
      where.sourcePortalKey = body.sourcePortalKey.trim();
    }
    if (body.importCategoryKey?.trim()) {
      where.importCategoryKey = body.importCategoryKey.trim();
    }
    if (body.city?.trim()) {
      where.city = { contains: body.city.trim(), mode: 'insensitive' };
    }
    if (body.onlyNewImports) {
      const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
      where.importedAt = { gte: since };
    }
    if (body.propertyIds && body.propertyIds.length > 0) {
      where.id = { in: body.propertyIds.slice(0, 500) };
    }
    const rows = await this.prisma.property.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, userId: true, title: true },
    });
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const r of rows) {
      try {
        await this.shortsListing.createDraftFromClassic(r.userId, r.id, {
          pickRandomLibraryTrack: true,
        });
        results.push({ id: r.id, ok: true });
      } catch (e) {
        results.push({
          id: r.id,
          ok: false,
          error: e instanceof Error ? e.message : 'Chyba',
        });
      }
    }
    return {
      requestedLimit: limit,
      attempted: rows.length,
      succeeded: results.filter((x) => x.ok).length,
      failed: results.filter((x) => !x.ok).length,
      results,
    };
  }

  async setBrokerReviewVisibility(reviewId: string, isVisible: boolean) {
    const row = await this.prisma.brokerReview.findUnique({
      where: { id: reviewId },
    });
    if (!row) {
      throw new NotFoundException('Recenze nebyla nalezena');
    }
    await this.prisma.brokerReview.update({
      where: { id: reviewId },
      data: { isVisible },
    });
    const agg = await this.prisma.brokerReview.aggregate({
      where: { brokerId: row.brokerId, isVisible: true },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await this.prisma.user.update({
      where: { id: row.brokerId },
      data: {
        brokerReviewAverage: Number(agg._avg.rating ?? 0),
        brokerReviewCount: agg._count._all,
      },
    });
    return { ok: true };
  }
}
