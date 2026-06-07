import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ShareGateTargetType, type ShareGateVideo } from '@prisma/client';
import { extname } from 'node:path';
import { PrismaService } from '../../database/prisma.service';
import { PropertyMediaCloudinaryService } from '../properties/property-media-cloudinary.service';
import { CreateShareGateVideoDto } from './dto/create-share-gate-video.dto';
import { UpdateShareGateVideoDto } from './dto/update-share-gate-video.dto';

const MAX_VIDEO_BYTES = 120 * 1024 * 1024;
const MAX_POSTER_BYTES = 8 * 1024 * 1024;
const ALLOWED_VIDEO_EXT = new Set(['.mp4', '.webm', '.mov']);
const ALLOWED_VIDEO_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);
const ALLOWED_POSTER_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_POSTER_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function parseOptionalDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException('Neplatné datum.');
  }
  return d;
}

function isWithinSchedule(row: ShareGateVideo, now: Date): boolean {
  if (row.activeFrom && row.activeFrom > now) return false;
  if (row.activeTo && row.activeTo < now) return false;
  return true;
}

@Injectable()
export class ShareGateVideoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: PropertyMediaCloudinaryService,
  ) {}

  private assertVideoFile(file: Express.Multer.File): void {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Nahrajte video soubor (pole video).');
    }
    if (file.size > MAX_VIDEO_BYTES) {
      throw new BadRequestException('Video je příliš velké (max 120 MB).');
    }
    const ext = extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_VIDEO_EXT.has(ext)) {
      throw new BadRequestException('Povolené formáty videa: MP4, WebM, MOV.');
    }
    const mime = (file.mimetype || '').toLowerCase();
    if (!ALLOWED_VIDEO_MIME.has(mime)) {
      throw new BadRequestException(`Nepovolený typ videa (${mime || 'neznámý'}).`);
    }
  }

  private assertPosterFile(file: Express.Multer.File): void {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Poster je prázdný.');
    }
    if (file.size > MAX_POSTER_BYTES) {
      throw new BadRequestException('Poster je příliš velký (max 8 MB).');
    }
    const ext = extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_POSTER_EXT.has(ext)) {
      throw new BadRequestException('Poster: JPG, PNG nebo WebP.');
    }
    const mime = (file.mimetype || '').toLowerCase();
    if (!ALLOWED_POSTER_MIME.has(mime)) {
      throw new BadRequestException(`Nepovolený typ posteru (${mime || 'neznámý'}).`);
    }
  }

  listAllForAdmin() {
    return this.prisma.shareGateVideo.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createFromDto(dto: CreateShareGateVideoDto) {
    return this.prisma.shareGateVideo.create({
      data: {
        title: dto.title.trim(),
        videoUrl: dto.videoUrl.trim(),
        posterUrl: dto.posterUrl?.trim() || null,
        targetType: dto.targetType ?? ShareGateTargetType.ALL,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        minWatchSeconds: dto.minWatchSeconds ?? 5,
        buttonText: dto.buttonText?.trim() || 'Pokračovat na inzerát',
        activeFrom: parseOptionalDate(dto.activeFrom) ?? null,
        activeTo: parseOptionalDate(dto.activeTo) ?? null,
      },
    });
  }

  async createFromUpload(
    videoFile: Express.Multer.File,
    posterFile: Express.Multer.File | undefined,
    fields: Record<string, string | undefined>,
  ) {
    this.assertVideoFile(videoFile);
    const title = (fields.title ?? '').trim();
    if (!title) {
      throw new BadRequestException('Vyplňte název videa.');
    }

    const targetTypeRaw = (fields.targetType ?? 'ALL').trim().toUpperCase();
    if (!Object.values(ShareGateTargetType).includes(targetTypeRaw as ShareGateTargetType)) {
      throw new BadRequestException('Neplatný targetType.');
    }

    const isActive = !['0', 'false', 'off', 'no'].includes(
      (fields.isActive ?? 'true').trim().toLowerCase(),
    );
    const sortOrder = Number.parseInt(fields.sortOrder ?? '0', 10);
    const minWatchSeconds = Number.parseInt(fields.minWatchSeconds ?? '5', 10);

    const videoUrl = await this.cloudinary.uploadVideo(videoFile);
    let posterUrl: string | null = null;
    if (posterFile) {
      this.assertPosterFile(posterFile);
      posterUrl = await this.cloudinary.uploadImage(posterFile);
    }

    return this.prisma.shareGateVideo.create({
      data: {
        title: title.slice(0, 200),
        videoUrl,
        posterUrl,
        targetType: targetTypeRaw as ShareGateTargetType,
        isActive,
        sortOrder: Number.isFinite(sortOrder) ? Math.max(0, sortOrder) : 0,
        minWatchSeconds:
          Number.isFinite(minWatchSeconds) && minWatchSeconds >= 1
            ? Math.min(120, minWatchSeconds)
            : 5,
        buttonText: (fields.buttonText ?? 'Pokračovat na inzerát').trim().slice(0, 120),
        activeFrom: parseOptionalDate(fields.activeFrom) ?? null,
        activeTo: parseOptionalDate(fields.activeTo) ?? null,
      },
    });
  }

  private parseBoolField(raw: string | undefined): boolean {
    return !['0', 'false', 'off', 'no'].includes((raw ?? 'true').trim().toLowerCase());
  }

  private parseTargetType(raw: string | undefined): ShareGateTargetType {
    const targetTypeRaw = (raw ?? 'ALL').trim().toUpperCase();
    if (!Object.values(ShareGateTargetType).includes(targetTypeRaw as ShareGateTargetType)) {
      throw new BadRequestException('Neplatný targetType.');
    }
    return targetTypeRaw as ShareGateTargetType;
  }

  async update(id: string, dto: UpdateShareGateVideoDto) {
    const existing = await this.prisma.shareGateVideo.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Reklamní video nenalezeno.');

    return this.prisma.shareGateVideo.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim().slice(0, 200) } : {}),
        ...(dto.videoUrl !== undefined ? { videoUrl: dto.videoUrl.trim() } : {}),
        ...(dto.posterUrl !== undefined ? { posterUrl: dto.posterUrl } : {}),
        ...(dto.targetType !== undefined ? { targetType: dto.targetType } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.minWatchSeconds !== undefined
          ? { minWatchSeconds: dto.minWatchSeconds }
          : {}),
        ...(dto.buttonText !== undefined
          ? { buttonText: dto.buttonText.trim().slice(0, 120) }
          : {}),
        ...(dto.activeFrom !== undefined
          ? { activeFrom: parseOptionalDate(dto.activeFrom) ?? null }
          : {}),
        ...(dto.activeTo !== undefined
          ? { activeTo: parseOptionalDate(dto.activeTo) ?? null }
          : {}),
      },
    });
  }

  async updateFromForm(
    id: string,
    videoFile: Express.Multer.File | undefined,
    posterFile: Express.Multer.File | undefined,
    fields: Record<string, string | undefined>,
  ) {
    const existing = await this.prisma.shareGateVideo.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Reklamní video nenalezeno.');

    const data: {
      title?: string;
      videoUrl?: string;
      posterUrl?: string | null;
      targetType?: ShareGateTargetType;
      isActive?: boolean;
      sortOrder?: number;
      minWatchSeconds?: number;
      buttonText?: string;
      activeFrom?: Date | null;
      activeTo?: Date | null;
    } = {};

    if (fields.title !== undefined) {
      const title = fields.title.trim();
      if (!title) throw new BadRequestException('Vyplňte název videa.');
      data.title = title.slice(0, 200);
    }
    if (fields.targetType !== undefined) {
      data.targetType = this.parseTargetType(fields.targetType);
    }
    if (fields.isActive !== undefined) {
      data.isActive = this.parseBoolField(fields.isActive);
    }
    if (fields.sortOrder !== undefined) {
      const sortOrder = Number.parseInt(fields.sortOrder, 10);
      data.sortOrder = Number.isFinite(sortOrder) ? Math.max(0, sortOrder) : 0;
    }
    if (fields.minWatchSeconds !== undefined) {
      const minWatchSeconds = Number.parseInt(fields.minWatchSeconds, 10);
      data.minWatchSeconds =
        Number.isFinite(minWatchSeconds) && minWatchSeconds >= 1
          ? Math.min(120, minWatchSeconds)
          : 5;
    }
    if (fields.buttonText !== undefined) {
      data.buttonText = (fields.buttonText || 'Pokračovat na inzerát').trim().slice(0, 120);
    }
    if (fields.activeFrom !== undefined) {
      data.activeFrom = parseOptionalDate(fields.activeFrom) ?? null;
    }
    if (fields.activeTo !== undefined) {
      data.activeTo = parseOptionalDate(fields.activeTo) ?? null;
    }
    if (fields.clearPoster === 'true') {
      data.posterUrl = null;
    }

    if (videoFile) {
      this.assertVideoFile(videoFile);
      data.videoUrl = await this.cloudinary.uploadVideo(videoFile);
    }
    if (posterFile) {
      this.assertPosterFile(posterFile);
      data.posterUrl = await this.cloudinary.uploadImage(posterFile);
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Žádná pole k úpravě.');
    }

    return this.prisma.shareGateVideo.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    const existing = await this.prisma.shareGateVideo.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Reklamní video nenalezeno.');
    await this.prisma.shareGateVideo.delete({ where: { id } });
    return { ok: true };
  }

  async findActiveForPublicType(typeRaw: string) {
    const type = typeRaw.trim().toUpperCase() as ShareGateTargetType;
    if (!Object.values(ShareGateTargetType).includes(type)) {
      throw new BadRequestException('Neplatný parametr type.');
    }
    if (type === ShareGateTargetType.ALL) {
      throw new BadRequestException('Parametr type nesmí být ALL.');
    }

    const now = new Date();
    const rows = await this.prisma.shareGateVideo.findMany({
      where: {
        isActive: true,
        targetType: { in: [type, ShareGateTargetType.ALL] },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const activeRows = rows.filter((r) => isWithinSchedule(r, now));
    const exact = activeRows.find((r) => r.targetType === type);
    const picked = exact ?? activeRows.find((r) => r.targetType === ShareGateTargetType.ALL);
    if (!picked) return null;

    return {
      id: picked.id,
      title: picked.title,
      videoUrl: picked.videoUrl,
      posterUrl: picked.posterUrl,
      targetType: picked.targetType,
      minWatchSeconds: picked.minWatchSeconds,
      buttonText: picked.buttonText,
    };
  }
}
