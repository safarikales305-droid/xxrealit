import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ShortsListingStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BrokerPointsService } from '../premium-broker/broker-points.service';
import type { CreateShortsFromClassicDto } from './dto/create-shorts-from-classic.dto';
import {
  ListingShortsFromPhotosService,
  type ShortsMusicKey,
  type ShortsMusicSelection,
} from './listing-shorts-from-photos.service';
import { PropertyMediaCloudinaryService } from './property-media-cloudinary.service';
import { socialInclude } from './shorts-listing.social-include';
import {
  serializeProperty,
  type PropertyViewerAccess,
} from './properties.serializer';
import { UserRole } from '@prisma/client';
import { upgradeHttpToHttpsForApi } from '../../lib/secure-url';

function collectClassicImageUrls(classic: {
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

async function downloadImageUrlsAsMulterFiles(
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
      originalname: `shorts-draft-${i}.${safeExt}`,
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

function parseBuiltinKey(raw: string | null | undefined): ShortsMusicKey {
  const v = (raw ?? 'demo_soft').trim();
  if (v === 'none' || v === 'demo_soft' || v === 'demo_warm' || v === 'demo_pulse') {
    return v;
  }
  return 'demo_soft';
}

@Injectable()
export class ShortsListingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly listingShortsFromPhotos: ListingShortsFromPhotosService,
    private readonly brokerPoints: BrokerPointsService,
    private readonly propertyMediaCloudinary: PropertyMediaCloudinaryService,
  ) {}

  private async viewerAccess(viewerId: string): Promise<PropertyViewerAccess> {
    const u = await this.prisma.user.findUnique({
      where: { id: viewerId },
      select: { role: true, isPremiumBroker: true },
    });
    if (!u) {
      return {
        role: UserRole.USER,
        isPremiumBroker: false,
        isAdmin: false,
      };
    }
    return {
      role: u.role,
      isPremiumBroker: Boolean(u.isPremiumBroker),
      isAdmin: u.role === UserRole.ADMIN,
    };
  }

  private async resolveMusicSelection(sl: {
    musicTrackId: string | null;
    musicUrl: string;
    musicBuiltinKey: string;
  }): Promise<ShortsMusicSelection> {
    const tid = (sl.musicTrackId ?? '').trim();
    if (tid) {
      const track = await this.prisma.shortsMusicTrack.findFirst({
        where: { id: tid, isActive: true },
      });
      if (!track) {
        throw new BadRequestException('Neplatná nebo neaktivní skladba.');
      }
      return { kind: 'library', fileUrl: track.fileUrl };
    }
    const url = (sl.musicUrl ?? '').trim();
    if (url) {
      return { kind: 'library', fileUrl: url };
    }
    const key = parseBuiltinKey(sl.musicBuiltinKey);
    return key === 'none' ? { kind: 'none' } : { kind: 'builtin', key };
  }

  private serializeDraft(row: {
    id: string;
    userId: string;
    sourceListingId: string;
    publishedPropertyId: string | null;
    title: string;
    description: string;
    coverImage: string | null;
    musicUrl: string;
    musicTrackId: string | null;
    musicBuiltinKey: string;
    videoUrl: string | null;
    status: ShortsListingStatus;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    media: Array<{
      id: string;
      imageUrl: string;
      order: number;
      duration: number;
      isCover: boolean;
    }>;
  }) {
    return {
      id: row.id,
      userId: row.userId,
      sourceListingId: row.sourceListingId,
      publishedPropertyId: row.publishedPropertyId,
      title: row.title,
      description: row.description,
      coverImage: upgradeHttpToHttpsForApi(row.coverImage),
      musicUrl: upgradeHttpToHttpsForApi(row.musicUrl) ?? row.musicUrl,
      musicTrackId: row.musicTrackId,
      musicBuiltinKey: row.musicBuiltinKey,
      videoUrl: upgradeHttpToHttpsForApi(row.videoUrl),
      status: row.status,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      media: row.media
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((m) => ({
          id: m.id,
          imageUrl: upgradeHttpToHttpsForApi(m.imageUrl) ?? m.imageUrl,
          order: m.order,
          duration: m.duration,
          isCover: m.isCover,
        })),
    };
  }

  async listMine(userId: string) {
    const rows = await this.prisma.shortsListing.findMany({
      where: {
        userId,
        status: { in: [ShortsListingStatus.draft, ShortsListingStatus.ready] },
      },
      orderBy: { updatedAt: 'desc' },
      include: { media: { orderBy: { order: 'asc' } } },
    });
    return rows.map((r) => this.serializeDraft(r));
  }

  async getByIdForOwner(userId: string, id: string) {
    const row = await this.prisma.shortsListing.findFirst({
      where: { id, userId },
      include: { media: { orderBy: { order: 'asc' } } },
    });
    if (!row) {
      throw new NotFoundException('Shorts záznam nebyl nalezen');
    }
    return this.serializeDraft(row);
  }

  async createDraftFromClassic(
    userId: string,
    classicPropertyId: string,
    dto?: CreateShortsFromClassicDto,
  ) {
    const classic = await this.prisma.property.findUnique({
      where: { id: classicPropertyId },
      include: { media: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!classic || classic.deletedAt) {
      throw new NotFoundException(`Property "${classicPropertyId}" not found`);
    }
    if (classic.userId !== userId) {
      throw new ForbiddenException('Tento inzerát není váš.');
    }
    if (String(classic.listingType ?? '').toUpperCase() !== 'CLASSIC') {
      throw new BadRequestException('Shorts lze připravit jen z klasického inzerátu.');
    }

    const legacy = await this.prisma.property.findFirst({
      where: {
        userId,
        deletedAt: null,
        derivedFromPropertyId: classicPropertyId,
      },
    });
    if (legacy) {
      throw new ConflictException(
        'K tomuto klasickému inzerátu už existuje shorts záznam (Property). Upravte ho nebo kontaktujte administrátora.',
      );
    }

    const existingDraft = await this.prisma.shortsListing.findFirst({
      where: {
        userId,
        sourceListingId: classicPropertyId,
        status: { in: [ShortsListingStatus.draft, ShortsListingStatus.ready] },
      },
      include: { media: { orderBy: { order: 'asc' } } },
    });
    if (existingDraft) {
      return this.serializeDraft(existingDraft);
    }

    const urls = collectClassicImageUrls(classic);
    if (urls.length === 0) {
      throw new BadRequestException('Klasický inzerát nemá žádné fotky ke zpracování.');
    }

    const trackId = dto?.musicTrackId?.trim();
    let musicTrackId: string | null = null;
    if (trackId) {
      const track = await this.prisma.shortsMusicTrack.findFirst({
        where: { id: trackId, isActive: true },
      });
      if (!track) {
        throw new BadRequestException('Neplatná nebo neaktivní skladba.');
      }
      musicTrackId = track.id;
    }

    const listing = await this.prisma.shortsListing.create({
      data: {
        userId,
        sourceListingId: classicPropertyId,
        title: classic.title,
        description: classic.description,
        coverImage: urls[0] ?? null,
        musicTrackId,
        musicUrl: '',
        musicBuiltinKey: String(
          ListingShortsFromPhotosService.parseMusicKey(dto?.musicKey ?? 'demo_soft'),
        ),
        status: ShortsListingStatus.draft,
      },
    });

    await this.prisma.shortsMediaItem.createMany({
      data: urls.map((url, i) => ({
        shortsListingId: listing.id,
        imageUrl: url,
        order: i,
        duration: 3,
        isCover: i === 0,
      })),
    });

    const full = await this.prisma.shortsListing.findUniqueOrThrow({
      where: { id: listing.id },
      include: { media: { orderBy: { order: 'asc' } } },
    });
    return this.serializeDraft(full);
  }

  async updateDraft(
    userId: string,
    id: string,
    body: {
      title?: string;
      description?: string;
      status?: ShortsListingStatus;
      musicTrackId?: string | null;
      musicUrl?: string;
      musicBuiltinKey?: string;
    },
  ) {
    const row = await this.prisma.shortsListing.findFirst({
      where: { id, userId },
    });
    if (!row) {
      throw new NotFoundException('Shorts záznam nebyl nalezen');
    }
    const wasPublished = row.status === ShortsListingStatus.published;

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title.trim().slice(0, 250);
    if (body.description !== undefined) {
      data.description = body.description.trim().slice(0, 10_000);
    }
    if (body.musicUrl !== undefined) data.musicUrl = body.musicUrl.trim().slice(0, 2000);
    if (body.musicBuiltinKey !== undefined) {
      data.musicBuiltinKey = parseBuiltinKey(body.musicBuiltinKey);
    }
    if (body.musicTrackId !== undefined) {
      const tid = body.musicTrackId?.trim() ?? '';
      data.musicTrackId = tid.length ? tid : null;
    }
    if (body.status !== undefined && !wasPublished) {
      if (
        body.status !== ShortsListingStatus.draft &&
        body.status !== ShortsListingStatus.ready &&
        body.status !== ShortsListingStatus.published
      ) {
        throw new BadRequestException('Neplatný stav konceptu.');
      }
      if (body.status === ShortsListingStatus.published) {
        throw new BadRequestException('Publikujte prosím přes endpoint /publish.');
      }
      data.status = body.status;
    }

    await this.prisma.shortsListing.update({
      where: { id },
      data: data as never,
    });
    await this.syncCoverFromMedia(id);
    if (wasPublished) {
      await this.syncPublishedMetadataToPropertyIfPublished(id);
    }
    return this.getByIdForOwner(userId, id);
  }

  /** Nastaví `coverImage` z prvního média s `isCover` nebo prvního obrázku. */
  private async syncCoverFromMedia(shortsListingId: string) {
    const media = await this.prisma.shortsMediaItem.findMany({
      where: { shortsListingId },
      orderBy: { order: 'asc' },
    });
    const cover = media.find((m) => m.isCover)?.imageUrl ?? media[0]?.imageUrl ?? null;
    await this.prisma.shortsListing.update({
      where: { id: shortsListingId },
      data: { coverImage: cover },
    });
  }

  /** Zveřejněný Property inzerát — titulek, popis, pořadí fotek v `images` a PropertyMedia (video řádek beze změny). */
  private async syncPublishedMetadataToProperty(shortsListingId: string) {
    const listing = await this.prisma.shortsListing.findUnique({
      where: { id: shortsListingId },
      include: { media: { orderBy: { order: 'asc' } } },
    });
    if (
      !listing ||
      listing.status !== ShortsListingStatus.published ||
      !listing.publishedPropertyId
    ) {
      return;
    }
    const urls = listing.media.map((m) => m.imageUrl.trim()).filter(Boolean);
    if (urls.length === 0) {
      throw new BadRequestException(
        'Publikovaný shorts musí mít alespoň jednu fotku. Přidejte snímek nebo smažte inzerát.',
      );
    }
    const pid = listing.publishedPropertyId;
    await this.prisma.$transaction(async (tx) => {
      await tx.property.update({
        where: { id: pid },
        data: {
          title: listing.title.trim().slice(0, 250),
          description: listing.description.trim(),
          images: urls,
        },
      });
      await tx.propertyMedia.deleteMany({
        where: { propertyId: pid, type: 'image' },
      });
      let sortOrder = 1;
      for (const u of urls) {
        await tx.propertyMedia.create({
          data: {
            propertyId: pid,
            url: u,
            type: 'image',
            sortOrder,
          },
        });
        sortOrder += 1;
      }
    });
  }

  private async syncPublishedMetadataToPropertyIfPublished(shortsListingId: string) {
    const row = await this.prisma.shortsListing.findUnique({
      where: { id: shortsListingId },
      select: { status: true, publishedPropertyId: true },
    });
    if (
      row?.status === ShortsListingStatus.published &&
      row.publishedPropertyId
    ) {
      await this.syncPublishedMetadataToProperty(shortsListingId);
    }
  }

  private async applyVideoToPublishedProperty(
    propertyId: string,
    videoUrl: string,
  ) {
    const v = videoUrl.trim();
    if (!v) return;
    await this.prisma.$transaction([
      this.prisma.property.update({
        where: { id: propertyId },
        data: { videoUrl: v },
      }),
      this.prisma.propertyMedia.updateMany({
        where: { propertyId, type: 'video' },
        data: { url: v },
      }),
    ]);
  }

  async reorderMedia(userId: string, shortsListingId: string, orderedIds: string[]) {
    const listing = await this.ensureListingOwner(userId, shortsListingId);
    const media = await this.prisma.shortsMediaItem.findMany({
      where: { shortsListingId },
    });
    const idSet = new Set(media.map((m) => m.id));
    for (const oid of orderedIds) {
      if (!idSet.has(oid)) {
        throw new BadRequestException('Neplatné ID média v pořadí.');
      }
    }
    if (orderedIds.length !== media.length) {
      throw new BadRequestException('Pořadí musí obsahovat všechny položky.');
    }
    await this.prisma.$transaction(
      orderedIds.map((mid, idx) =>
        this.prisma.shortsMediaItem.update({
          where: { id: mid },
          data: { order: idx },
        }),
      ),
    );
    await this.syncCoverFromMedia(listing.id);
    await this.syncPublishedMetadataToPropertyIfPublished(shortsListingId);
    return this.getByIdForOwner(userId, shortsListingId);
  }

  async setCover(userId: string, shortsListingId: string, mediaId: string) {
    await this.ensureListingOwner(userId, shortsListingId);
    const m = await this.prisma.shortsMediaItem.findFirst({
      where: { id: mediaId, shortsListingId },
    });
    if (!m) {
      throw new NotFoundException('Médium nenalezeno');
    }
    await this.prisma.shortsMediaItem.updateMany({
      where: { shortsListingId },
      data: { isCover: false },
    });
    await this.prisma.shortsMediaItem.update({
      where: { id: mediaId },
      data: { isCover: true },
    });
    await this.syncCoverFromMedia(shortsListingId);
    await this.syncPublishedMetadataToPropertyIfPublished(shortsListingId);
    return this.getByIdForOwner(userId, shortsListingId);
  }

  async deleteMedia(userId: string, shortsListingId: string, mediaId: string) {
    const listing = await this.ensureListingOwner(userId, shortsListingId);
    const m = await this.prisma.shortsMediaItem.findFirst({
      where: { id: mediaId, shortsListingId },
    });
    if (!m) {
      throw new NotFoundException('Médium nenalezeno');
    }
    const remainingBefore = await this.prisma.shortsMediaItem.count({
      where: { shortsListingId },
    });
    if (
      listing.status === ShortsListingStatus.published &&
      remainingBefore <= 1
    ) {
      throw new BadRequestException(
        'Publikovaný shorts musí mít alespoň jednu fotku. Nejprve přidejte další snímek.',
      );
    }
    await this.prisma.shortsMediaItem.delete({ where: { id: mediaId } });
    const rest = await this.prisma.shortsMediaItem.findMany({
      where: { shortsListingId },
      orderBy: { order: 'asc' },
    });
    await this.prisma.$transaction(
      rest.map((row, idx) =>
        this.prisma.shortsMediaItem.update({
          where: { id: row.id },
          data: { order: idx, isCover: idx === 0 },
        }),
      ),
    );
    await this.syncCoverFromMedia(shortsListingId);
    await this.syncPublishedMetadataToPropertyIfPublished(shortsListingId);
    return this.getByIdForOwner(userId, shortsListingId);
  }

  async addMediaByUrl(userId: string, shortsListingId: string, imageUrl: string) {
    await this.ensureListingOwner(userId, shortsListingId);
    const url = imageUrl.trim();
    if (!url) {
      throw new BadRequestException('Chybí URL obrázku');
    }
    const max = await this.prisma.shortsMediaItem.count({
      where: { shortsListingId },
    });
    await this.prisma.shortsMediaItem.create({
      data: {
        shortsListingId,
        imageUrl: url.slice(0, 2000),
        order: max,
        duration: 3,
        isCover: max === 0,
      },
    });
    await this.syncCoverFromMedia(shortsListingId);
    await this.syncPublishedMetadataToPropertyIfPublished(shortsListingId);
    return this.getByIdForOwner(userId, shortsListingId);
  }

  async uploadMediaFile(
    userId: string,
    shortsListingId: string,
    file: Express.Multer.File,
  ) {
    await this.ensureListingOwner(userId, shortsListingId);
    const url = await this.propertyMediaCloudinary.uploadImage(file);
    return this.addMediaByUrl(userId, shortsListingId, url);
  }

  async patchMedia(
    userId: string,
    shortsListingId: string,
    mediaId: string,
    body: { duration?: number; isCover?: boolean },
  ) {
    await this.ensureListingOwner(userId, shortsListingId);
    const m = await this.prisma.shortsMediaItem.findFirst({
      where: { id: mediaId, shortsListingId },
    });
    if (!m) {
      throw new NotFoundException('Médium nenalezeno');
    }
    const data: { duration?: number; isCover?: boolean } = {};
    if (body.duration !== undefined) {
      const d = Number(body.duration);
      if (!Number.isFinite(d) || d < 0.5 || d > 30) {
        throw new BadRequestException('Délka snímku musí být 0,5–30 s.');
      }
      data.duration = d;
    }
    if (body.isCover === true) {
      await this.prisma.shortsMediaItem.updateMany({
        where: { shortsListingId },
        data: { isCover: false },
      });
      data.isCover = true;
    }
    await this.prisma.shortsMediaItem.update({
      where: { id: mediaId },
      data,
    });
    await this.syncCoverFromMedia(shortsListingId);
    await this.syncPublishedMetadataToPropertyIfPublished(shortsListingId);
    return this.getByIdForOwner(userId, shortsListingId);
  }

  private async ensureListingOwner(userId: string, id: string) {
    const row = await this.prisma.shortsListing.findFirst({
      where: { id, userId },
    });
    if (!row) {
      throw new NotFoundException('Shorts záznam nebyl nalezen');
    }
    return row;
  }

  /**
   * Smaže koncept (včetně médií) nebo publikovaný shorts: soft-delete Property + smazání ShortsListing.
   */
  async deleteListing(userId: string, id: string) {
    const row = await this.prisma.shortsListing.findFirst({
      where: { id, userId },
    });
    if (!row) {
      throw new NotFoundException('Shorts záznam nebyl nalezen');
    }
    if (row.status === ShortsListingStatus.published && row.publishedPropertyId) {
      const pid = row.publishedPropertyId;
      await this.prisma.$transaction(async (tx) => {
        await tx.shortsListing.update({
          where: { id },
          data: { publishedPropertyId: null },
        });
        await tx.property.update({
          where: { id: pid },
          data: { deletedAt: new Date(), isActive: false },
        });
        await tx.shortsListing.delete({ where: { id } });
      });
      return { ok: true };
    }
    await this.prisma.shortsListing.delete({ where: { id } });
    return { ok: true };
  }

  async previewVideo(userId: string, id: string) {
    const listing = await this.prisma.shortsListing.findFirst({
      where: { id, userId },
      include: { media: { orderBy: { order: 'asc' } } },
    });
    if (!listing) {
      throw new NotFoundException('Shorts záznam nebyl nalezen');
    }
    const publishedPid = listing.publishedPropertyId;
    let urls = listing.media.map((m) => m.imageUrl.trim()).filter(Boolean);
    if (urls.length === 0) {
      throw new BadRequestException('Přidejte alespoň jednu fotku.');
    }
    if (urls.length === 1) {
      urls = [urls[0], urls[0]];
    }
    const files = await downloadImageUrlsAsMulterFiles(urls.slice(0, 15));
    const music = await this.resolveMusicSelection(listing);
    const classic = await this.prisma.property.findUnique({
      where: { id: listing.sourceListingId },
    });
    if (!classic) {
      throw new NotFoundException('Zdrojový inzerát neexistuje');
    }
    const { videoUrl } = await this.listingShortsFromPhotos.generateAndUpload({
      images: files,
      title: listing.title,
      city: classic.city,
      price: classic.price,
      currency: classic.currency,
      music,
      includeTextOverlay: true,
    });
    const nextStatus =
      listing.status === ShortsListingStatus.published
        ? ShortsListingStatus.published
        : ShortsListingStatus.ready;
    await this.prisma.shortsListing.update({
      where: { id },
      data: { videoUrl, status: nextStatus },
    });
    if (listing.status === ShortsListingStatus.published && publishedPid) {
      await this.applyVideoToPublishedProperty(publishedPid, videoUrl);
      await this.syncPublishedMetadataToProperty(id);
    }
    return this.getByIdForOwner(userId, id);
  }

  async publish(userId: string, id: string) {
    const listing = await this.prisma.shortsListing.findFirst({
      where: { id, userId },
      include: { media: { orderBy: { order: 'asc' } } },
    });
    if (!listing) {
      throw new NotFoundException('Koncept nebyl nalezen');
    }
    if (listing.status === ShortsListingStatus.published) {
      throw new ConflictException('Koncept je již publikovaný.');
    }
    const classic = await this.prisma.property.findUnique({
      where: { id: listing.sourceListingId },
    });
    if (!classic || classic.deletedAt) {
      throw new NotFoundException('Zdrojový klasický inzerát nebyl nalezen');
    }

    let urls = listing.media.map((m) => m.imageUrl.trim()).filter(Boolean);
    if (urls.length === 0) {
      throw new BadRequestException('Bez fotek nelze publikovat.');
    }
    if (urls.length === 1) {
      urls = [urls[0], urls[0]];
    }

    let videoUrl = (listing.videoUrl ?? '').trim();
    if (!videoUrl) {
      const files = await downloadImageUrlsAsMulterFiles(urls.slice(0, 15));
      const music = await this.resolveMusicSelection(listing);
      const gen = await this.listingShortsFromPhotos.generateAndUpload({
        images: files,
        title: listing.title.trim() || classic.title,
        city: classic.city,
        price: classic.price,
        currency: classic.currency,
        music,
        includeTextOverlay: true,
      });
      videoUrl = gen.videoUrl;
    }

    const publishedAt = new Date();
    const coverStill =
      listing.media.find((m) => m.isCover)?.imageUrl ?? urls[0] ?? listing.coverImage;

    const access = await this.viewerAccess(userId);

    const result = await this.prisma.$transaction(async (tx) => {
      const created = await tx.property.create({
        data: {
          title: listing.title.trim().slice(0, 250) || classic.title,
          description: listing.description.trim() || classic.description,
          price: classic.price,
          currency: classic.currency,
          offerType: classic.offerType,
          propertyType: classic.propertyType,
          subType: classic.subType,
          address: classic.address,
          city: classic.city,
          area: classic.area,
          landArea: classic.landArea,
          floor: classic.floor,
          totalFloors: classic.totalFloors,
          condition: classic.condition,
          construction: classic.construction,
          ownership: classic.ownership,
          energyLabel: classic.energyLabel,
          equipment: classic.equipment,
          parking: classic.parking,
          cellar: classic.cellar,
          images: urls,
          videoUrl,
          contactName: classic.contactName,
          contactPhone: classic.contactPhone,
          contactEmail: classic.contactEmail,
          userId,
          approved: true,
          status: 'ACTIVE',
          listingType: 'SHORTS',
          isOwnerListing: classic.isOwnerListing,
          ownerContactConsent: classic.ownerContactConsent,
          region: classic.region,
          district: classic.district,
          derivedFromPropertyId: classic.id,
          publishedAt,
        },
      });

      const mediaRows: Array<{
        propertyId: string;
        url: string;
        type: 'image' | 'video';
        sortOrder: number;
      }> = [
        {
          propertyId: created.id,
          url: videoUrl,
          type: 'video',
          sortOrder: 0,
        },
      ];
      let ord = 1;
      for (const u of urls) {
        mediaRows.push({
          propertyId: created.id,
          url: u,
          type: 'image',
          sortOrder: ord,
        });
        ord += 1;
      }
      await tx.propertyMedia.createMany({ data: mediaRows });

      await tx.shortsListing.update({
        where: { id: listing.id },
        data: {
          status: ShortsListingStatus.published,
          publishedAt,
          publishedPropertyId: created.id,
          videoUrl,
          coverImage: coverStill ?? listing.coverImage,
        },
      });

      const full = await tx.property.findUnique({
        where: { id: created.id },
        include: socialInclude(userId),
      });
      return { created, full };
    });

    await this.brokerPoints.onListingCreatedByBroker(
      userId,
      result.created.id,
      'SHORTS',
    );

    const full = result.full;
    if (!full) {
      throw new NotFoundException('Property not found after publish');
    }
    const likesArr = 'likes' in full && Array.isArray(full.likes) ? full.likes : [];
    const serialized = serializeProperty(
      {
        ...full,
        likes: likesArr,
        _count: full._count,
        user: full.user,
      },
      userId,
      access,
    );

    return {
      property: serialized,
      shortsListingId: listing.id,
    };
  }
}
