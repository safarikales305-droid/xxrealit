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
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { extname } from 'node:path';
import { parseBearerUserId } from '../auth/auth-token.util';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { propertyMediaMemoryMulterOptions } from '../upload/multer-upload.config';
import { CreatePropertyDto } from './dto/create-property.dto';
import { PropertiesService } from './properties.service';

@Controller('properties')
export class PropertiesController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly jwt: JwtService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('following')
  followingFeed(@CurrentUser() user: AuthUser) {
    return this.propertiesService.findFromFollowedUsers(user.id);
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
      if (typeof v !== 'string') return undefined;
      return v === 'true';
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
    };

    return this.propertiesService.create(user.id, dto, {
      videoFile,
      imageFiles: orderedImages,
    });
  }
}
