import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { OwnerUpdatePropertyDto } from './dto/owner-update-property.dto';
import { PropertyMediaCloudinaryService } from './property-media-cloudinary.service';
import { classicPublicListingWhere } from './property-listing-scope';
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

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propertyMediaCloudinary: PropertyMediaCloudinaryService,
    private readonly ownerListingNotify: OwnerListingNotifyService,
    private readonly brokerPoints: BrokerPointsService,
    private readonly shortsListingService: ShortsListingService,
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

  async findAllPublic(viewerId?: string) {
    const access = await this.viewerAccess(viewerId);
    const rows = await this.prisma.property.findMany({
      where: classicPublicListingWhere,
      orderBy: { createdAt: 'desc' },
      include: socialInclude(viewerId),
    });
    const withVideoUrl = rows.filter((r) => (r.videoUrl ?? '').trim().length > 0).length;
    console.log(
      `[PropertiesService.findAllPublic] classicApprovedRows=${rows.length} nonEmptyVideoUrl=${withVideoUrl}`,
    );
    return rows.map((r) =>
      serializeProperty(
        { ...r, likes: 'likes' in r ? r.likes : [] },
        viewerId,
        access,
      ),
    );
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
            email: true,
            avatar: true,
            name: true,
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
      email: author.email,
      name: author.name ?? null,
      avatar: author.avatar ?? null,
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
    let videoUrl: string | null = dto.videoUrl?.trim() || null;

    if (files) {
      try {
        if (files.videoFile) {
          videoUrl = await this.propertyMediaCloudinary.uploadVideo(
            files.videoFile,
          );
        }
        if (files.imageFiles.length > 0) {
          images = await Promise.all(
            files.imageFiles.map((f) =>
              this.propertyMediaCloudinary.uploadImage(f),
            ),
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
      for (let i = 0; i < images.length; i += 1) {
        mediaRows.push({
          propertyId: created.id,
          url: images[i],
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
    if (classicIds.length > 0) {
      const drafts = await this.prisma.shortsListing.findMany({
        where: {
          userId: ownerId,
          sourceListingId: { in: classicIds },
          status: { in: ['draft', 'ready'] },
        },
        select: { id: true, sourceListingId: true, status: true },
      });
      for (const d of drafts) {
        draftByClassic.set(d.sourceListingId, { id: d.id, status: d.status });
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
    if (dto.city !== undefined) data.city = dto.city.trim();
    if (dto.region !== undefined) data.region = dto.region.trim().slice(0, 120);
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
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
}
