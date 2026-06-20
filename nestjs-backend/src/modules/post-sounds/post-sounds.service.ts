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
const ALLOWED_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg']);
const ALLOWED_MIME = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/x-m4a',
  'audio/mp4',
  'audio/m4a',
  'audio/aac',
  'audio/ogg',
]);

@Injectable()
export class PostSoundsService {
  private readonly log = new Logger(PostSoundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: PropertyMediaCloudinaryService,
  ) {}

  assertAudioFile(file: Express.Multer.File): void {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Soubor zvuku je prázdný.');
    }
    if (file.size > MAX_AUDIO_BYTES) {
      throw new BadRequestException(
        `Maximální velikost audio souboru je ${Math.floor(MAX_AUDIO_BYTES / (1024 * 1024))} MB.`,
      );
    }
    const ext = extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      this.log.warn(
        `[post-sound-upload] rejected ext=${ext} mimetype=${file.mimetype} size=${file.size}`,
      );
      throw new BadRequestException('Povolené formáty: MP3, WAV, M4A, AAC, OGG.');
    }
    const mime = (file.mimetype || '').toLowerCase();
    if (!ALLOWED_MIME.has(mime) && !mime.startsWith('audio/')) {
      this.log.warn(
        `[post-sound-upload] rejected mimetype=${mime} size=${file.size} name=${file.originalname}`,
      );
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
      if (code !== 1 && code !== 0) return null;
      return parseDurationSecondsFromFfmpegStderr(stderr);
    } catch {
      return null;
    }
  }

  async createFromUpload(
    adminUserId: string,
    file: Express.Multer.File,
    title: string,
    artist: string,
    description: string | null,
    isActive: boolean,
  ) {
    this.assertAudioFile(file);
    const tmpPath = join(
      tmpdir(),
      `post-sound-${randomBytes(8).toString('hex')}${extname(file.originalname || '.mp3')}`,
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
      file.originalname || 'sound.mp3',
      file.mimetype || 'audio/mpeg',
    );

    return this.prisma.shortsMusicTrack.create({
      data: {
        title: title.trim().slice(0, 200),
        artist: artist.trim().slice(0, 120),
        description: description?.trim() ? description.trim().slice(0, 4000) : null,
        fileUrl: url,
        previewUrl: url,
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
        artist: true,
        fileUrl: true,
        previewUrl: true,
        durationSec: true,
      },
    });
  }

  async updateTrack(id: string, body: Record<string, unknown>) {
    const existing = await this.prisma.shortsMusicTrack.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Zvuk nenalezen.');
    const data: Record<string, unknown> = {};
    if (typeof body.title === 'string') data.title = body.title.trim().slice(0, 200);
    if (typeof body.artist === 'string') data.artist = body.artist.trim().slice(0, 120);
    if (typeof body.description === 'string') {
      data.description = body.description.trim().slice(0, 4000) || null;
    }
    if (typeof body.isActive === 'boolean') data.isActive = body.isActive;
    return this.prisma.shortsMusicTrack.update({ where: { id }, data });
  }

  async deleteTrack(id: string) {
    const existing = await this.prisma.shortsMusicTrack.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Zvuk nenalezen.');
    await this.prisma.shortsMusicTrack.delete({ where: { id } });
    return { success: true };
  }
}
