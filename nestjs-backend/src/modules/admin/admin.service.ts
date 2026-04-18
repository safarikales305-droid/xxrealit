import {
  BadRequestException,
  Injectable,
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
import { safeParsePrice } from '../imports/price-parse.util';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownerListingNotify: OwnerListingNotifyService,
    private readonly importSync: ImportSyncService,
  ) {}

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

  /**
   * Jednorázová oprava špatných fallback cen (1 / 100 Kč) u importu Reality.cz.
   */
  async repairRealityImportedPricePlaceholders() {
    const updated = await this.prisma.property.updateMany({
      where: {
        importSource: ListingImportPortal.reality_cz,
        OR: [{ price: 1 }, { price: 100 }],
      },
      data: { price: null },
    });
    return { affected: updated.count };
  }

  async listImportSources() {
    return this.importSync.listSources();
  }

  async updateImportSource(sourceId: string, patch: {
    enabled?: boolean;
    intervalMinutes?: number;
    limitPerRun?: number;
    endpointUrl?: string | null;
    credentialsJson?: Prisma.InputJsonValue | null;
    settingsJson?: Prisma.InputJsonValue | null;
  }) {
    return this.importSync.updateSource(sourceId, patch);
  }

  async runImportSource(sourceId: string, actorUserId: string) {
    return this.importSync.runSource(sourceId, actorUserId);
  }

  async listImportLogs(sourceId?: string) {
    return this.importSync.listLogs(sourceId);
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
