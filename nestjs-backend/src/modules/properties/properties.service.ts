import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { OwnerUpdatePropertyDto } from './dto/owner-update-property.dto';
import { PropertyMediaCloudinaryService } from './property-media-cloudinary.service';
import {
  classicPublicListingWhere,
} from './property-listing-scope';

/** Kanonické klíče (import + `detectPropertyType`) — musí sedět s `ptype` ve frontend URL. */
const CANONICAL_PROPERTY_TYPE_KEYS = new Set([
  'byt',
  'dum',
  'pozemek',
  'garaz',
  'komercni',
  'chata_chalupa',
  'ostatni',
]);

export type PublicPropertyListFilters = {
  city?: string;
  /** Čárkou oddělená města — OR (kdekoli v `city`). */
  cities?: string;
  propertyTypeKey?: string;
  importCategoryKey?: string;
  sourcePortalKey?: string;
  priceMin?: number;
  priceMax?: number;
};
import {
  computeListingPublicStatus,
  isPropertyPubliclyListed,
} from './property-public-visibility';
import {
  serializeProperty,
  type PropertyViewerAccess,
} from './properties.serializer';
import { BrokerPointsService } from '../premium-broker/broker-points.service';
import { OwnerListingNotifyService } from '../premium-broker/owner-listing-notify.service';
import type { CreateShortsFromClassicDto } from './dto/create-shorts-from-classic.dto';
import { socialInclude } from './shorts-listing.social-include';
import { ShortsListingService } from './shorts-listing.service';
import { ListingWatermarkSettingsService } from './listing-watermark-settings.service';

@Injectable()
export class PropertiesService {
  private readonly log = new Logger(PropertiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly propertyMediaCloudinary: PropertyMediaCloudinaryService,
    private readonly ownerListingNotify: OwnerListingNotifyService,
    private readonly brokerPoints: BrokerPointsService,
    private readonly shortsListingService: ShortsListingService,
    private readonly watermarkSettings: ListingWatermarkSettingsService,
  ) {}

  private async viewerAccess(viewerId?: string): Promise<PropertyViewerAccess | undefined> {
    if (!viewerId) return undefined;
    const u = await this.prisma.user.findUnique({
      where: { id: viewerId },
      select: { role: true, isPremiumBroker: true },
    });
    if (!u) return undefined;
    return {
      role: u.role,
      isPremiumBroker: Boolean(u.isPremiumBroker),
      isAdmin: u.role === UserRole.ADMIN,
    };
  }

  private async viewerIsAdmin(viewerId?: string): Promise<boolean> {
    if (!viewerId) return false;
    const u = await this.prisma.user.findUnique({
      where: { id: viewerId },
      select: { role: true },
    });
    return u?.role === UserRole.ADMIN;
  }

  /**
   * Veřejný filtr `propertyTypeKey` / `ptype`: DB má u importu `propertyTypeKey`,
   * starší / ruční řádky často jen `propertyType` („dům“, „Byt“, …).
   */
  private buildPublicPropertyTypeFilterWhere(
    rawKey: string | undefined | null,
  ): Prisma.PropertyWhereInput | null {
    const trimmed = rawKey?.trim();
    if (!trimmed) return null;
    const k = trimmed.toLowerCase();

    const aliasToCanonical: Record<string, string> = {
      house: 'dum',
      dum: 'dum',
      apartment: 'byt',
      byt: 'byt',
      flat: 'byt',
      land: 'pozemek',
      pozemek: 'pozemek',
      commercial: 'komercni',
      komercni: 'komercni',
      garaz: 'garaz',
      garage: 'garaz',
      chata: 'chata_chalupa',
      chalupa: 'chata_chalupa',
      chata_chalupa: 'chata_chalupa',
      ostatni: 'ostatni',
    };

    const canonical = aliasToCanonical[k] ?? k;
    if (!CANONICAL_PROPERTY_TYPE_KEYS.has(canonical)) {
      this.log.warn(
        `[findAllPublic] Neznámý propertyTypeKey="${trimmed}" — filtr ignoruji (nevracet prázdný výpis).`,
      );
      return null;
    }

    const propertyTypeEqualsVariants: Record<string, string[]> = {
      byt: ['byt'],
      dum: ['dům', 'dum', 'dom'],
      pozemek: ['pozemek', 'pozem'],
      garaz: ['garáž', 'garaz'],
      komercni: ['komerční', 'komercni'],
      chata_chalupa: ['chata', 'chalupa', 'chata_chalupa'],
      ostatni: ['ostatní', 'ostatni'],
    };

    const ptEq = propertyTypeEqualsVariants[canonical] ?? [canonical];
    const OR: Prisma.PropertyWhereInput[] = [
      { propertyTypeKey: { equals: canonical, mode: 'insensitive' } },
      ...ptEq.map((t) => ({
        propertyType: { equals: t, mode: 'insensitive' as const },
      })),
    ];

    if (canonical === 'dum') {
      OR.push({ propertyType: { contains: 'dům', mode: 'insensitive' } });
    }
    if (canonical === 'byt') {
      OR.push({ propertyType: { contains: 'byt', mode: 'insensitive' } });
    }
    if (canonical === 'pozemek') {
      OR.push({ propertyType: { contains: 'pozem', mode: 'insensitive' } });
    }

    return { OR };
  }

  private buildClassicPublicWhere(
    filters?: PublicPropertyListFilters,
  ): Prisma.PropertyWhereInput {
    const parts: Prisma.PropertyWhereInput[] = [classicPublicListingWhere];
    const citiesCsv = filters?.cities?.trim();
    if (citiesCsv) {
      const list = [...new Set(citiesCsv.split(',').map((s) => s.trim()).filter(Boolean))];
      if (list.length === 1) {
        parts.push({ city: { contains: list[0], mode: 'insensitive' } });
      } else if (list.length > 1) {
        parts.push({
          OR: list.map((c) => ({ city: { contains: c, mode: 'insensitive' as const } })),
        });
      }
    } else {
      const city = filters?.city?.trim();
      if (city) {
        parts.push({ city: { contains: city, mode: 'insensitive' } });
      }
    }
    const ptk = filters?.propertyTypeKey?.trim();
    if (ptk) {
      const ptw = this.buildPublicPropertyTypeFilterWhere(ptk);
      if (ptw) parts.push(ptw);
    }
    const ick = filters?.importCategoryKey?.trim();
    if (ick) {
      parts.push({ importCategoryKey: ick });
    }
    const spk = filters?.sourcePortalKey?.trim();
    if (spk) {
      parts.push({ sourcePortalKey: spk });
    }
    const pMin = filters?.priceMin;
    if (typeof pMin === 'number' && Number.isFinite(pMin) && pMin >= 0) {
      parts.push({ price: { gte: Math.trunc(pMin) } });
    }
    const pMax = filters?.priceMax;
    if (typeof pMax === 'number' && Number.isFinite(pMax) && pMax >= 0) {
      parts.push({ price: { lte: Math.trunc(pMax) } });
    }
    return parts.length === 1 ? parts[0] : { AND: parts };
  }

  async findAllPublic(viewerId?: string, filters?: PublicPropertyListFilters) {
    const access = await this.viewerAccess(viewerId);
    const where = this.buildClassicPublicWhere(filters);
    const rows = await this.prisma.property.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: socialInclude(viewerId),
    });
    const withVideoUrl = rows.filter((r) => (r.videoUrl ?? '').trim().length > 0).length;
    const withCoverImage = rows.filter(
      (r) =>
        Array.isArray(r.images) &&
        r.images.some((u) => typeof u === 'string' && u.trim().length > 0),
    ).length;
    const withValidPrice = rows.filter((r) => r.price != null && r.price > 0).length;
    this.log.log(
      `[findAllPublic] classicPublicRows=${rows.length} nonEmptyVideoUrl=${withVideoUrl} withCoverImage=${withCoverImage} validPrice=${withValidPrice}`,
    );
    if (process.env.CLASSIC_FEED_IMPORT_DEBUG === '1') {
      const importedAny = await this.prisma.property.count({
        where: { importSource: { not: null }, deletedAt: null },
      });
      const importedInClassicFeed = await this.prisma.property.count({
        where: {
          AND: [{ importSource: { not: null } }, classicPublicListingWhere],
        },
      });
      this.log.warn(
        `[findAllPublic][CLASSIC_FEED_IMPORT_DEBUG] importovaných v DB (nesmazané)=${importedAny} z toho v Klasik veřejném where=${importedInClassicFeed}`,
      );
    }
    const mapped = rows.map((r) =>
      serializeProperty(
        { ...r, likes: 'likes' in r ? r.likes : [] },
        viewerId,
        access,
      ),
    );
    if (process.env.LISTING_FEED_DEBUG === '1' && mapped.length > 0) {
      const q = mapped[0] as Record<string, unknown>;
      // eslint-disable-next-line no-console
      console.log('PROPERTY API ITEM', {
        id: q.id,
        title: q.title,
        price: q.price,
        importSource: q.importSource,
        importExternalId: q.importExternalId,
        coverImage: q.coverImage,
        imageUrl: q.imageUrl,
        thumbnail: q.thumbnail,
        photos: q.photos,
        images: q.images,
        mediaLen: Array.isArray(q.media) ? (q.media as unknown[]).length : 0,
      });
    }
    return {
      items: mapped,
      total: mapped.length,
    };
  }

  async findByOwner(ownerId: string, viewerId?: string) {
    const admin = await this.viewerIsAdmin(viewerId);
    const access = await this.viewerAccess(viewerId);
    const viewerIsOwner = viewerId === ownerId;
    const where: Prisma.PropertyWhereInput =
      viewerIsOwner || admin
        ? { userId: ownerId, deletedAt: null }
        : {
            userId: ownerId,
            ...classicPublicListingWhere,
          };
    const rows = await this.prisma.property.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: socialInclude(viewerId),
    });
    return rows.map((r) =>
      serializeProperty(
        { ...r, likes: 'likes' in r ? r.likes : [] },
        viewerId,
        access,
      ),
    );
  }

  async findFromFollowedUsers(viewerId: string) {
    const access = await this.viewerAccess(viewerId);
    const follows = await this.prisma.follow.findMany({
      where: { followerId: viewerId },
      select: { followingId: true },
    });
    const ids = follows.map((f) => f.followingId);
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.property.findMany({
      where: {
        userId: { in: ids },
        ...classicPublicListingWhere,
      },
      orderBy: { createdAt: 'desc' },
      include: socialInclude(viewerId),
    });
    return rows.map((r) =>
      serializeProperty(
        { ...r, likes: 'likes' in r ? r.likes : [] },
        viewerId,
        access,
      ),
    );
  }

  /**
   * Detail inzerátu + autor + další inzeráty stejného uživatele.
   * Neschválený inzerát vidí jen admin nebo vlastník.
   */
  async findOneForDetail(id: string, viewerId?: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: {
        media: {
          orderBy: { sortOrder: 'asc' },
        },
        user: {
          select: {
            id: true,
            avatar: true,
            name: true,
            phone: true,
            phonePublic: true,
            city: true,
            role: true,
          },
        },
        _count: { select: { likes: true } },
        ...(viewerId
          ? {
              likes: {
                where: { userId: viewerId },
                select: { id: true },
                take: 1,
              },
            }
          : {}),
      },
    });

    if (!property) {
      throw new NotFoundException(`Property "${id}" not found`);
    }

    const admin = await this.viewerIsAdmin(viewerId);
    const isOwner = viewerId === property.userId;
    if (!property.approved && !admin && !isOwner) {
      throw new NotFoundException(`Property "${id}" not found`);
    }
    if (!admin && !isOwner && !isPropertyPubliclyListed(property)) {
      throw new NotFoundException(`Property "${id}" not found`);
    }

    const author = property.user;
    const access = await this.viewerAccess(viewerId);
    const userPayload = {
      id: author.id,
      name: author.name ?? null,
      avatar: author.avatar ?? null,
      phone: author.phonePublic ? author.phone : null,
      phonePublic: Boolean(author.phonePublic),
      role: author.role,
    };

    const othersWhere: Prisma.PropertyWhereInput =
      admin || isOwner
        ? {
            userId: property.userId,
            id: { not: property.id },
            deletedAt: null,
          }
        : {
            userId: property.userId,
            id: { not: property.id },
            ...classicPublicListingWhere,
          };

    const otherRows = await this.prisma.property.findMany({
      where: othersWhere,
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: {
        media: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: { select: { likes: true } },
        user: { select: { id: true, city: true } },
        ...(viewerId
          ? {
              likes: {
                where: { userId: viewerId },
                select: { id: true },
                take: 1,
              },
            }
          : {}),
      },
    });

    const likesArr =
      'likes' in property && Array.isArray(property.likes) ? property.likes : [];

    const propertySerialized = serializeProperty(
      {
        ...property,
        likes: likesArr,
        _count: property._count,
        user: { id: author.id, city: author.city },
      },
      viewerId,
      access,
    );
    if (process.env.LISTING_FEED_DEBUG === '1') {
      const q = propertySerialized as Record<string, unknown>;
      // eslint-disable-next-line no-console
      console.log('PROPERTY API ITEM (detail)', {
        id: q.id,
        title: q.title,
        price: q.price,
        importSource: q.importSource,
        importExternalId: q.importExternalId,
        coverImage: q.coverImage,
        imageUrl: q.imageUrl,
        thumbnail: q.thumbnail,
        photos: q.photos,
        images: q.images,
        mediaLen: Array.isArray(q.media) ? (q.media as unknown[]).length : 0,
      });
    }

    const otherProperties = otherRows.map((r) =>
      serializeProperty(
        {
          ...r,
          likes: 'likes' in r ? r.likes : [],
          _count: r._count,
          user: r.user,
        },
        viewerId,
        access,
      ),
    );

    return {
      property: propertySerialized,
      user: userPayload,
      otherProperties,
    };
  }

  async toggleLike(propertyId: string, userId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      throw new NotFoundException(`Property "${propertyId}" not found`);
    }
    const admin = await this.viewerIsAdmin(userId);
    if (!property.approved && !admin) {
      throw new NotFoundException(`Property "${propertyId}" not found`);
    }
    if (!admin && !isPropertyPubliclyListed(property)) {
      throw new NotFoundException(`Property "${propertyId}" not found`);
    }

    const existing = await this.prisma.propertyLike.findUnique({
      where: {
        propertyId_userId: { propertyId, userId },
      },
    });

    if (existing) {
      await this.prisma.propertyLike.delete({ where: { id: existing.id } });
    } else {
      try {
        await this.prisma.propertyLike.create({
          data: { propertyId, userId },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          throw new ConflictException('Already liked');
        }
        throw e;
      }
    }

    const likeCount = await this.prisma.propertyLike.count({
      where: { propertyId },
    });
    return {
      liked: !existing,
      likeCount,
    };
  }

  async create(
    ownerId: string,
    dto: CreatePropertyDto,
    files?: {
      videoFile: Express.Multer.File | null;
      imageFiles: Express.Multer.File[];
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: ownerId },
    });

    if (!user) {
      throw new NotFoundException(`User with id "${ownerId}" not found`);
    }

    let images = Array.isArray(dto.images)
      ? dto.images.filter((u) => typeof u === 'string' && u.trim().length > 0)
      : [];
    let imageVariants: Array<{ originalUrl: string; watermarkedUrl: string | null }> =
      images.map((u) => ({ originalUrl: u, watermarkedUrl: null }));
    let videoUrl: string | null = dto.videoUrl?.trim() || null;

    const wmSettings = await this.watermarkSettings.getSettings();
    if (files) {
      try {
        if (files.videoFile) {
          videoUrl = await this.propertyMediaCloudinary.uploadVideo(
            files.videoFile,
          );
        }
        if (files.imageFiles.length > 0) {
          imageVariants = await Promise.all(
            files.imageFiles.map((f) =>
              this.propertyMediaCloudinary.uploadImageWithWatermarkVariants(f),
            ),
          );
          images = imageVariants.map((x) =>
            wmSettings.enabled && x.watermarkedUrl ? x.watermarkedUrl : x.originalUrl,
          );
        }
      } catch (error) {
        console.error('PROPERTY MEDIA UPLOAD ERROR:', error);
        throw error;
      }
    }

    const mediaRows: Array<{
      propertyId: string;
      url: string;
      originalUrl?: string | null;
      watermarkedUrl?: string | null;
      type: 'image' | 'video';
      sortOrder: number;
    }> = [];

    try {
      const created = await this.prisma.property.create({
        data: {
          title: dto.title.trim(),
          description: dto.description.trim(),
          price: dto.price,
          currency: (dto.currency ?? 'CZK').trim().slice(0, 8) || 'CZK',
          offerType: dto.type.trim(),
          propertyType: dto.propertyType.trim(),
          subType: (dto.subType ?? '').trim().slice(0, 120),
          address: (dto.address ?? '').trim().slice(0, 500),
          city: dto.city.trim(),
          area: dto.area ?? null,
          landArea: dto.landArea ?? null,
          floor: dto.floor ?? null,
          totalFloors: dto.totalFloors ?? null,
          condition: dto.condition?.trim() || null,
          construction: dto.construction?.trim() || null,
          ownership: dto.ownership?.trim() || null,
          energyLabel: dto.energyLabel?.trim() || null,
          equipment: dto.equipment?.trim() || null,
          parking: dto.parking ?? false,
          cellar: dto.cellar ?? false,
          images,
          videoUrl,
          contactName: dto.contactName.trim(),
          contactPhone: dto.contactPhone.trim(),
          contactEmail: dto.contactEmail.trim().toLowerCase(),
          userId: ownerId,
          approved: false,
          status: 'PENDING',
          listingType: videoUrl ? 'SHORTS' : 'CLASSIC',
          isOwnerListing: dto.isOwnerListing ?? false,
          ownerContactConsent: dto.ownerContactConsent ?? false,
          region: (dto.region ?? '').trim().slice(0, 120),
          district: (dto.district ?? '').trim().slice(0, 120),
        },
      });

      if (videoUrl) {
        mediaRows.push({
          propertyId: created.id,
          url: videoUrl,
          type: 'video',
          sortOrder: 0,
        });
      }
      for (let i = 0; i < imageVariants.length; i += 1) {
        const v = imageVariants[i]!;
        mediaRows.push({
          propertyId: created.id,
          url: wmSettings.enabled && v.watermarkedUrl ? v.watermarkedUrl : v.originalUrl,
          originalUrl: v.originalUrl,
          watermarkedUrl: v.watermarkedUrl ?? null,
          type: 'image',
          sortOrder: i + 1,
        });
      }

      console.log('MEDIA TO CREATE:', mediaRows);

      if (mediaRows.length > 0) {
        await this.prisma.propertyMedia.createMany({ data: mediaRows });
      }

      const full = await this.prisma.property.findUnique({
        where: { id: created.id },
        include: socialInclude(ownerId),
      });

      if (!full) {
        throw new NotFoundException(`Property "${created.id}" not found`);
      }

      const likesArr =
        'likes' in full && Array.isArray(full.likes) ? full.likes : [];

      await this.brokerPoints.onListingCreatedByBroker(
        ownerId,
        full.id,
        full.listingType,
      );

      const ownerAccess = await this.viewerAccess(ownerId);
      return serializeProperty(
        {
          ...full,
          likes: likesArr,
          _count: full._count,
          user: full.user,
        },
        ownerId,
        ownerAccess,
      );
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new NotFoundException(`User with id "${ownerId}" not found`);
      }
      throw e;
    }
  }

  private pickListingCoverUrl(r: {
    videoUrl: string | null;
    images: string[];
    media: Array<{ url: string; type: string; sortOrder: number }>;
  }): string | null {
    const media = [...r.media].sort((a, b) => a.sortOrder - b.sortOrder);
    const v = media.find((m) => m.type === 'video');
    if (v?.url) return v.url;
    const im = media.find((m) => m.type === 'image');
    if (im?.url) return im.url;
    if (r.videoUrl?.trim()) return r.videoUrl.trim();
    if (r.images.length > 0) return r.images[0];
    return null;
  }

  async findDashboardListingsByOwner(ownerId: string) {
    const rows = await this.prisma.property.findMany({
      where: { userId: ownerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        media: { orderBy: { sortOrder: 'asc' } },
      },
    });
    const classicIds = rows
      .filter((r) => String(r.listingType ?? '').toUpperCase() !== 'SHORTS')
      .map((r) => r.id);
    const shortsByClassic = new Map<
      string,
      {
        id: string;
        deletedAt: Date | null;
        isActive: boolean;
        activeFrom: Date | null;
        activeUntil: Date | null;
        approved: boolean;
      }
    >();
    if (classicIds.length > 0) {
      const derived = await this.prisma.property.findMany({
        where: {
          userId: ownerId,
          deletedAt: null,
          derivedFromPropertyId: { in: classicIds },
        },
        select: {
          id: true,
          derivedFromPropertyId: true,
          deletedAt: true,
          isActive: true,
          activeFrom: true,
          activeUntil: true,
          approved: true,
        },
      });
      for (const s of derived) {
        if (s.derivedFromPropertyId) {
          shortsByClassic.set(s.derivedFromPropertyId, s);
        }
      }
    }

    const draftByClassic = new Map<string, { id: string; status: string }>();
    const shortsListingByClassic = new Map<string, string>();
    if (classicIds.length > 0) {
      const drafts = await this.prisma.shortsListing.findMany({
        where: {
          userId: ownerId,
          sourceListingId: { in: classicIds },
        },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, sourceListingId: true, status: true },
      });
      for (const d of drafts) {
        if (!shortsListingByClassic.has(d.sourceListingId)) {
          shortsListingByClassic.set(d.sourceListingId, d.id);
        }
        if (d.status === 'draft' || d.status === 'ready') {
          draftByClassic.set(d.sourceListingId, { id: d.id, status: d.status });
        }
      }
    }

    const shortsPropertyIds = rows
      .filter((r) => String(r.listingType ?? '').toUpperCase() === 'SHORTS')
      .map((r) => r.id);
    const shortsListingByPublishedPropertyId = new Map<string, string>();
    if (shortsPropertyIds.length > 0) {
      const slPublished = await this.prisma.shortsListing.findMany({
        where: {
          userId: ownerId,
          publishedPropertyId: { in: shortsPropertyIds },
        },
        select: { id: true, publishedPropertyId: true },
      });
      for (const s of slPublished) {
        if (s.publishedPropertyId) {
          shortsListingByPublishedPropertyId.set(s.publishedPropertyId, s.id);
        }
      }
    }

    const now = new Date();
    return rows.map((r) => {
      const dashboardStatus = computeListingPublicStatus(
        {
          deletedAt: r.deletedAt,
          isActive: r.isActive,
          activeFrom: r.activeFrom,
          activeUntil: r.activeUntil,
          approved: r.approved,
        },
        now,
      );
      const listingType =
        String(r.listingType ?? '').toUpperCase() === 'SHORTS'
          ? 'SHORTS'
          : 'CLASSIC';
      const shortsListingId =
        listingType === 'SHORTS'
          ? (shortsListingByPublishedPropertyId.get(r.id) ?? null)
          : (shortsListingByClassic.get(r.id) ?? null);
      const linked =
        listingType === 'CLASSIC' ? shortsByClassic.get(r.id) ?? null : null;
      const shortsDashboardStatus = linked
        ? computeListingPublicStatus(
            {
              deletedAt: linked.deletedAt,
              isActive: linked.isActive,
              activeFrom: linked.activeFrom,
              activeUntil: linked.activeUntil,
              approved: linked.approved,
            },
            now,
          )
        : null;
      return {
        id: r.id,
        title: r.title,
        listingType,
        price: r.price,
        currency: r.currency,
        city: r.city,
        region: r.region ?? '',
        dashboardStatus,
        createdAt: r.createdAt.toISOString(),
        coverUrl: this.pickListingCoverUrl(r),
        derivedFromPropertyId: r.derivedFromPropertyId ?? null,
        shortsVariant: linked
          ? {
              id: linked.id,
              dashboardStatus: shortsDashboardStatus,
            }
          : null,
        shortsDraft:
          listingType === 'CLASSIC' ? (draftByClassic.get(r.id) ?? null) : null,
        shortsListingId,
      };
    });
  }

  private classicPropertyVideoUrl(classic: {
    videoUrl: string | null;
    media: Array<{ type: string; url: string }>;
  }): string | null {
    const vu = (classic.videoUrl ?? '').trim();
    if (vu) return vu;
    const vm = classic.media.find(
      (m) => m.type === 'video' && (m.url ?? '').trim().length > 0,
    );
    return vm?.url.trim() ?? null;
  }

  private collectClassicImageUrls(classic: {
    images: string[];
    media: Array<{ type: string; url: string; sortOrder: number }>;
  }): string[] {
    const fromMedia = [...classic.media]
      .filter((m) => m.type === 'image' && (m.url ?? '').trim())
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((m) => m.url.trim());
    const fromLegacy = (classic.images ?? []).filter(
      (u) => typeof u === 'string' && u.trim().length > 0,
    ) as string[];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const u of [...fromMedia, ...fromLegacy]) {
      if (seen.has(u)) continue;
      seen.add(u);
      out.push(u);
    }
    return out;
  }

  private async downloadImageUrlsAsMulterFiles(
    urls: string[],
  ): Promise<Express.Multer.File[]> {
    const out: Express.Multer.File[] = [];
    let i = 0;
    for (const rawUrl of urls) {
      const url = rawUrl.trim();
      const res = await fetch(url);
      if (!res.ok) {
        throw new BadRequestException(`Nelze stáhnout obrázek (HTTP ${res.status}).`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) {
        throw new BadRequestException('Stažený obrázek je prázdný.');
      }
      const extGuess = url.split('?')[0]?.match(/\.(jpe?g|png|webp|gif)$/i);
      const ext = (extGuess?.[1] ?? 'jpg').toLowerCase();
      const mime =
        ext === 'png'
          ? 'image/png'
          : ext === 'webp'
            ? 'image/webp'
            : ext === 'gif'
              ? 'image/gif'
              : 'image/jpeg';
      const safeExt = ext === 'jpeg' ? 'jpg' : ext;
      out.push({
        fieldname: 'images',
        originalname: `from-classic-${i}.${safeExt}`,
        encoding: '7bit',
        mimetype: mime,
        size: buf.length,
        buffer: buf,
        destination: '',
        filename: '',
        path: '',
        stream: undefined as never,
      } as Express.Multer.File);
      i += 1;
    }
    return out;
  }

  async createShortsFromClassic(
    ownerId: string,
    classicId: string,
    dto?: CreateShortsFromClassicDto,
  ) {
    return this.shortsListingService.createDraftFromClassic(ownerId, classicId, dto);
  }

  async updateByOwner(ownerId: string, propertyId: string, dto: OwnerUpdatePropertyDto) {
    const existing = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException(`Property "${propertyId}" not found`);
    }
    if (existing.userId !== ownerId) {
      throw new ForbiddenException('Tento inzerát nemůžete upravovat.');
    }
    const data: Prisma.PropertyUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description.trim();
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.currency !== undefined) data.currency = dto.currency.trim().slice(0, 8) || 'CZK';
    if (dto.type !== undefined) data.offerType = dto.type.trim();
    if (dto.propertyType !== undefined) data.propertyType = dto.propertyType.trim();
    if (dto.subType !== undefined) data.subType = dto.subType.trim().slice(0, 120);
    if (dto.address !== undefined) data.address = dto.address.trim().slice(0, 500);
    if (dto.city !== undefined) data.city = dto.city.trim();
    if (dto.area !== undefined) data.area = dto.area;
    if (dto.landArea !== undefined) data.landArea = dto.landArea;
    if (dto.floor !== undefined) data.floor = dto.floor;
    if (dto.totalFloors !== undefined) data.totalFloors = dto.totalFloors;
    if (dto.condition !== undefined) data.condition = dto.condition.trim() || null;
    if (dto.construction !== undefined) data.construction = dto.construction.trim() || null;
    if (dto.ownership !== undefined) data.ownership = dto.ownership.trim() || null;
    if (dto.energyLabel !== undefined) data.energyLabel = dto.energyLabel.trim() || null;
    if (dto.equipment !== undefined) data.equipment = dto.equipment.trim() || null;
    if (dto.parking !== undefined) data.parking = dto.parking;
    if (dto.cellar !== undefined) data.cellar = dto.cellar;
    if (dto.images !== undefined) {
      data.images = dto.images
        .map((u) => (typeof u === 'string' ? u.trim() : ''))
        .filter((u) => u.length > 0);
    }
    if (dto.videoUrl !== undefined) {
      const vu = dto.videoUrl.trim();
      data.videoUrl = vu ? vu.slice(0, 2000) : null;
    }
    if (dto.contactName !== undefined) data.contactName = dto.contactName.trim();
    if (dto.contactPhone !== undefined) data.contactPhone = dto.contactPhone.trim();
    if (dto.contactEmail !== undefined) data.contactEmail = dto.contactEmail.trim().toLowerCase();
    if (dto.isOwnerListing !== undefined) data.isOwnerListing = dto.isOwnerListing;
    if (dto.ownerContactConsent !== undefined) data.ownerContactConsent = dto.ownerContactConsent;
    if (dto.region !== undefined) data.region = dto.region.trim().slice(0, 120);
    if (dto.district !== undefined) data.district = dto.district.trim().slice(0, 120);
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.videoUrl !== undefined) {
      const nextVideoUrl = (dto.videoUrl ?? '').trim();
      data.listingType = nextVideoUrl ? 'SHORTS' : 'CLASSIC';
    }
    const updated = await this.prisma.property.update({
      where: { id: propertyId },
      data,
      include: socialInclude(ownerId),
    });
    const likesArr =
      'likes' in updated && Array.isArray(updated.likes) ? updated.likes : [];
    const ownerAccess = await this.viewerAccess(ownerId);
    return serializeProperty(
      {
        ...updated,
        likes: likesArr,
        _count: updated._count,
        user: updated.user,
      },
      ownerId,
      ownerAccess,
    );
  }

  async softDeleteByOwner(ownerId: string, propertyId: string) {
    const existing = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException(`Property "${propertyId}" not found`);
    }
    if (existing.userId !== ownerId) {
      throw new ForbiddenException('Tento inzerát nemůžete smazat.');
    }
    await this.prisma.property.update({
      where: { id: propertyId },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { ok: true };
  }

  async topByOwner(ownerId: string, propertyId: string) {
    const existing = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, userId: true, deletedAt: true },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException(`Property "${propertyId}" not found`);
    }
    if (existing.userId !== ownerId) {
      throw new ForbiddenException('Tento inzerát nemůžete topovat.');
    }

    const now = new Date();
    const boostedUntil = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        isActive: true,
        activeFrom: now,
        activeUntil: boostedUntil,
      },
    });
    return { ok: true, activeUntil: boostedUntil.toISOString() };
  }

  /** Hodnoty pro filtry veřejného klasického katalogu (Klasik). */
  async getPublicFilterOptions() {
    const rows = await this.prisma.property.findMany({
      where: classicPublicListingWhere,
      select: {
        city: true,
        propertyTypeKey: true,
        propertyTypeLabel: true,
        importCategoryKey: true,
        importCategoryLabel: true,
        sourcePortalKey: true,
        sourcePortalLabel: true,
        importSource: true,
      },
      take: 8000,
      orderBy: { createdAt: 'desc' },
    });
    const citySet = new Set<string>();
    const propertyTypes = new Map<string, string>();
    const importCategories = new Map<string, string>();
    const portals = new Map<string, string>();
    for (const r of rows) {
      const c = (r.city ?? '').trim();
      if (c) citySet.add(c);
      const pk = (r.propertyTypeKey ?? '').trim();
      if (pk) {
        const lab = (r.propertyTypeLabel ?? '').trim() || pk;
        propertyTypes.set(pk, lab);
      }
      const ik = (r.importCategoryKey ?? '').trim();
      if (ik) {
        const il = (r.importCategoryLabel ?? '').trim() || ik;
        importCategories.set(ik, il);
      }
      const sk = (r.sourcePortalKey ?? '').trim();
      if (sk) {
        const sl = (r.sourcePortalLabel ?? '').trim() || sk;
        portals.set(sk, sl);
      } else if (r.importSource) {
        portals.set(String(r.importSource), String(r.importSource));
      }
    }
    return {
      cities: [...citySet].sort((a, b) => a.localeCompare(b, 'cs')),
      propertyTypes: [...propertyTypes.entries()]
        .map(([key, label]) => ({ key, label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'cs')),
      importCategories: [...importCategories.entries()]
        .map(([key, label]) => ({ key, label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'cs')),
      sourcePortals: [...portals.entries()]
        .map(([key, label]) => ({ key, label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'cs')),
    };
  }
}
