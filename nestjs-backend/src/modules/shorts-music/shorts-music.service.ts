import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { PrismaService } from '../../database/prisma.service';
import { resolveFfmpegBinary } from '../../lib/ffmpeg-binary';
import {
  parseDurationSecondsFromFfmpegStderr,
  runFfmpegCapture,
} from '../../lib/ffmpeg-run';
import { PropertyMediaCloudinaryService } from '../properties/property-media-cloudinary.service';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXT = new Set(['.mp3', '.wav', '.m4a']);
const ALLOWED_MIME = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/x-m4a',
  'audio/mp4',
  'audio/m4a',
]);

@Injectable()
export class ShortsMusicService {
  private readonly log = new Logger(ShortsMusicService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: PropertyMediaCloudinaryService,
  ) {}

  assertAudioFile(file: Express.Multer.File): void {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Soubor hudby je prázdný.');
    }
    if (file.size > MAX_AUDIO_BYTES) {
      throw new BadRequestException(
        `Maximální velikost audio souboru je ${Math.floor(MAX_AUDIO_BYTES / (1024 * 1024))} MB.`,
      );
    }
    const ext = extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      throw new BadRequestException('Povolené formáty: MP3, WAV, M4A.');
    }
    const mime = (file.mimetype || '').toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      throw new BadRequestException(`Nepovolený typ souboru (${mime || 'neznámý'}).`);
    }
  }

  private async probeDurationSec(filePath: string): Promise<number | null> {
    const { path: ffmpegBin } = resolveFfmpegBinary();
    try {
      const { stderr, code } = await runFfmpegCapture(ffmpegBin, [
        '-hide_banner',
        '-i',
        filePath,
      ]);
      if (code !== 1 && code !== 0) {
        return null;
      }
      return parseDurationSecondsFromFfmpegStderr(stderr);
    } catch (e) {
      this.log.warn(`ffprobe duration skip: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  async createFromUpload(
    adminUserId: string,
    file: Express.Multer.File,
    title: string,
    description: string | null,
    isActive: boolean,
  ) {
    this.assertAudioFile(file);
    const tmpPath = join(
      tmpdir(),
      `shorts-music-${randomBytes(8).toString('hex')}${extname(file.originalname || '.mp3')}`,
    );
    await writeFile(tmpPath, file.buffer);
    let durationSec: number | null = null;
    try {
      durationSec = await this.probeDurationSec(tmpPath);
    } finally {
      await unlink(tmpPath).catch(() => undefined);
    }

    const { url, publicId } = await this.cloudinary.uploadShortsMusicBuffer(
      file.buffer,
      file.originalname || 'track.mp3',
      file.mimetype || 'audio/mpeg',
    );

    return this.prisma.shortsMusicTrack.create({
      data: {
        title: title.trim().slice(0, 200),
        description: description?.trim() ? description.trim().slice(0, 4000) : null,
        fileUrl: url,
        cloudinaryPublicId: publicId,
        mimeType: file.mimetype || 'audio/mpeg',
        durationSec: durationSec ?? null,
        isActive,
        uploadedById: adminUserId,
      },
    });
  }

  listAllForAdmin() {
    return this.prisma.shortsMusicTrack.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: { select: { id: true, email: true } },
      },
    });
  }

  listActiveForPicker() {
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

  async updateTrack(id: string, body: Record<string, unknown>) {
    const existing = await this.prisma.shortsMusicTrack.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Skladba nenalezena.');
    }
    const data: {
      title?: string;
      description?: string | null;
      isActive?: boolean;
    } = {};
    if (typeof body.title === 'string' && body.title.trim()) {
      data.title = body.title.trim().slice(0, 200);
    }
    if ('description' in body) {
      if (body.description === null || body.description === '') {
        data.description = null;
      } else if (typeof body.description === 'string') {
        data.description = body.description.trim().slice(0, 4000);
      }
    }
    if (typeof body.isActive === 'boolean') {
      data.isActive = body.isActive;
    } else if (typeof body.isActive === 'string') {
      const t = body.isActive.trim().toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(t)) data.isActive = true;
      else if (['0', 'false', 'no', 'off'].includes(t)) data.isActive = false;
    }
    if (Object.keys(data).length === 0) {
      return existing;
    }
    return this.prisma.shortsMusicTrack.update({
      where: { id },
      data,
    });
  }

  async deleteTrack(id: string) {
    const existing = await this.prisma.shortsMusicTrack.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Skladba nenalezena.');
    }
    if (existing.cloudinaryPublicId) {
      try {
        await this.cloudinary.destroyByPublicId(existing.cloudinaryPublicId);
      } catch (e) {
        this.log.warn(
          `Cloudinary destroy selhalo (${existing.cloudinaryPublicId}): ${e instanceof Error ? e.message : e}`,
        );
      }
    }
    await this.prisma.shortsMusicTrack.delete({ where: { id } });
    return { ok: true as const };
  }
}
