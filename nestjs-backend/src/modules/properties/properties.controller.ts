import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { extname } from 'node:path';
import { PrismaService } from '../../database/prisma.service';
import { parseBearerUserId } from '../auth/auth-token.util';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { propertyMediaMemoryMulterOptions } from '../upload/multer-upload.config';
import { CreatePropertyDto } from './dto/create-property.dto';
import {
  ListingShortsFromPhotosService,
  type ShortsMusicSelection,
} from './listing-shorts-from-photos.service';
import { PropertiesService } from './properties.service';
import { BrokerLeadOfferService } from '../premium-broker/broker-lead-offer.service';
import { OwnerLeadOfferDto } from '../premium-broker/dto/owner-lead-offer.dto';

@Controller('properties')
export class PropertiesController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly listingShortsFromPhotosService: ListingShortsFromPhotosService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly brokerLeadOffer: BrokerLeadOfferService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('following')
  followingFeed(@CurrentUser() user: AuthUser) {
    return this.propertiesService.findFromFollowedUsers(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('generate-shorts-from-photos')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'images', maxCount: 30 }],
      propertyMediaMemoryMulterOptions,
    ),
  )
  async generateShortsFromPhotos(
    @Body() body: Record<string, unknown>,
    @UploadedFiles()
    files?: { images?: Express.Multer.File[] },
  ) {
    const imageFiles = files?.images ?? [];
    if (imageFiles.length > 30) {
      throw new BadRequestException('Max 30 fotek');
    }
    for (const image of imageFiles) {
      const ext = extname(image.originalname || '').toLowerCase();
      if (!['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
        throw new BadRequestException('Nepovolený formát obrázku');
      }
    }

    const str = (v: unknown, fallback = '') =>
      typeof v === 'string' ? v : fallback;
    const toInt = (v: unknown): number => {
      if (typeof v !== 'string') return NaN;
      const n = Number.parseInt(v.replace(/\s/g, ''), 10);
      return Number.isFinite(n) ? n : NaN;
    };

    const title = str(body.title).trim();
    const city = str(body.city).trim();
    const priceRaw = toInt(body.price);
    const price = Number.isFinite(priceRaw) && priceRaw >= 0 ? priceRaw : 0;
    const currency = str(body.currency, 'CZK').trim() || 'CZK';
    const trackId = typeof body.musicTrackId === 'string' ? body.musicTrackId.trim() : '';
    let music: ShortsMusicSelection;
    if (trackId) {
      const track = await this.prisma.shortsMusicTrack.findFirst({
        where: { id: trackId, isActive: true },
      });
      if (!track) {
        throw new BadRequestException('Neplatná nebo neaktivní skladba.');
      }
      music = { kind: 'library', fileUrl: track.fileUrl };
    } else {
      const musicKey = ListingShortsFromPhotosService.parseMusicKey(body.musicKey);
      music = musicKey === 'none' ? { kind: 'none' } : { kind: 'builtin', key: musicKey };
    }
    const includeTextOverlay = ListingShortsFromPhotosService.parseBool(
      body.includeTextOverlay,
    );

    if (includeTextOverlay) {
      if (!title || !city || !Number.isFinite(priceRaw) || priceRaw < 0) {
        throw new BadRequestException(
          'Pro text ve videu vyplňte titulek, město a platnou cenu.',
        );
      }
    }

    return this.listingShortsFromPhotosService.generateAndUpload({
      images: imageFiles,
      title,
      city,
      price,
      currency,
      music,
      includeTextOverlay,
    });
  }

  /** Aktivní skladby z admin knihovny — výběr při generování shorts (přihlášený uživatel). */
  @UseGuards(JwtAuthGuard)
  @Get('shorts-music/active')
  listActiveShortsMusicTracks() {
    return this.prisma.shortsMusicTrack.findMany({
      where: { isActive: true },
      orderBy: { title: 'asc' },
      select: {
        id: true,
        title: true,
        description: true,
        fileUrl: true,
        durationSec: true,
        mimeType: true,
      },
    });
  }

  @Get()
  findAll(@Headers('authorization') auth?: string) {
    const viewerId = parseBearerUserId(this.jwt, auth);
    return this.propertiesService.findAllPublic(viewerId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Headers('authorization') auth?: string,
  ) {
    const viewerId = parseBearerUserId(this.jwt, auth);
    return this.propertiesService.findOneForDetail(id, viewerId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/like')
  toggleLike(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.propertiesService.toggleLike(id, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/owner-lead-offer')
  ownerLeadOffer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: OwnerLeadOfferDto,
  ) {
    return this.brokerLeadOffer.submitOwnerLeadOffer(user.id, id, dto.message);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'video', maxCount: 1 },
        { name: 'images', maxCount: 30 },
      ],
      propertyMediaMemoryMulterOptions,
    ),
  )
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
    @UploadedFiles()
    files?: {
      video?: Express.Multer.File[];
      images?: Express.Multer.File[];
    },
  ) {
    const imageFiles = files?.images ?? [];
    const videoFile = files?.video?.[0] ?? null;
    console.log('UPLOADED VIDEO:', videoFile?.originalname);
    console.log('UPLOADED IMAGES COUNT:', imageFiles.length);
    console.log('BODY:', body);
    if (imageFiles.length > 30) {
      throw new BadRequestException('Max 30 fotek');
    }
    if ((files?.video?.length ?? 0) > 1) {
      throw new BadRequestException('Max 1 video');
    }

    const imageOrderRaw = body.imageOrder;
    const orderValues = Array.isArray(imageOrderRaw)
      ? imageOrderRaw.filter((x): x is string => typeof x === 'string')
      : typeof imageOrderRaw === 'string'
        ? [imageOrderRaw]
        : [];

    const numericOrder =
      orderValues.length === imageFiles.length &&
      orderValues.every((v) => /^\d+$/.test(String(v).trim()));

    const orderedImages = numericOrder
      ? imageFiles
          .map((f, i) => ({
            f,
            order: parseInt(String(orderValues[i]).trim(), 10),
          }))
          .sort((a, b) => a.order - b.order)
          .map((x) => x.f)
      : orderValues.length > 0
        ? [...imageFiles].sort((a, b) => {
            const aKey = `${a.originalname}::${a.size}`;
            const bKey = `${b.originalname}::${b.size}`;
            const ai = orderValues.indexOf(aKey);
            const bi = orderValues.indexOf(bKey);
            return (
              (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) -
              (bi === -1 ? Number.MAX_SAFE_INTEGER : bi)
            );
          })
        : imageFiles;

    for (const image of orderedImages) {
      const ext = extname(image.originalname || '').toLowerCase();
      if (!['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
        throw new BadRequestException('Nepovolený formát obrázku');
      }
    }

    if (videoFile) {
      const ext = extname(videoFile.originalname || '').toLowerCase();
      if (!['.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv'].includes(ext)) {
        throw new BadRequestException('Nepovolený formát videa');
      }
    }

    const toNum = (v: unknown): number | undefined => {
      if (typeof v !== 'string') return undefined;
      const n = Number(v.replace(',', '.'));
      return Number.isFinite(n) ? n : undefined;
    };
    const toInt = (v: unknown): number | undefined => {
      if (typeof v !== 'string') return undefined;
      const n = Number.parseInt(v, 10);
      return Number.isFinite(n) ? n : undefined;
    };
    const toBool = (v: unknown): boolean | undefined => {
      if (typeof v === 'boolean') return v;
      if (typeof v !== 'string') return undefined;
      const s = v.trim().toLowerCase();
      if (s === 'true' || s === '1' || s === 'on' || s === 'yes') return true;
      if (s === 'false' || s === '0' || s === 'off' || s === '') return false;
      return undefined;
    };
    const str = (v: unknown, fallback = '') =>
      typeof v === 'string' ? v : fallback;

    const externalVideo = str(body.videoUrl).trim();

    const dto: CreatePropertyDto = {
      title: str(body.title),
      description: str(body.description),
      price: toInt(body.price) ?? 0,
      currency: str(body.currency, 'CZK'),
      type: str(body.type, 'prodej'),
      propertyType: str(body.propertyType, 'byt'),
      subType: str(body.subType),
      address: str(body.address),
      city: str(body.city),
      area: toNum(body.area),
      landArea: toNum(body.landArea),
      floor: toInt(body.floor),
      totalFloors: toInt(body.totalFloors),
      condition: str(body.condition),
      construction: str(body.construction),
      ownership: str(body.ownership),
      energyLabel: str(body.energyLabel),
      equipment: str(body.equipment),
      parking: toBool(body.parking),
      cellar: toBool(body.cellar),
      images: [],
      videoUrl:
        externalVideo.length > 0 ? externalVideo.slice(0, 2000) : undefined,
      contactName: str(body.contactName),
      contactPhone: str(body.contactPhone),
      contactEmail: str(body.contactEmail),
      isOwnerListing: toBool(body.isOwnerListing) ?? false,
      ownerContactConsent: toBool(body.ownerContactConsent) ?? false,
      region: str(body.region).slice(0, 120),
      district: str(body.district).slice(0, 120),
    };

    return this.propertiesService.create(user.id, dto, {
      videoFile,
      imageFiles: orderedImages,
    });
  }
}
