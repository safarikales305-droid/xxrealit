import { Injectable, Logger } from '@nestjs/common';
import { readFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { resolveFfmpegBinary } from '../../lib/ffmpeg-binary';
import { runFfmpegCapture } from '../../lib/ffmpeg-run';
import { PropertyMediaCloudinaryService } from './property-media-cloudinary.service';

@Injectable()
export class VideoOgThumbnailService {
  private readonly log = new Logger(VideoOgThumbnailService.name);

  constructor(private readonly cloudinary: PropertyMediaCloudinaryService) {}

  /** Extrahuje snímek 1200×630 z lokálního MP4 a nahraje na Cloudinary. */
  async extractAndUploadFromFile(videoPath: string): Promise<string | null> {
    const ffmpeg = resolveFfmpegBinary();
    if (!ffmpeg.path) {
      this.log.warn('ffmpeg nedostupný — přeskočeno generování OG thumbnailu z videa');
      return null;
    }

    const tmpRoot = join(tmpdir(), `og-thumb-${randomBytes(8).toString('hex')}`);
    await mkdir(tmpRoot, { recursive: true });
    const outPath = join(tmpRoot, 'og-thumb.jpg');

    try {
      const args = [
        '-hide_banner',
        '-loglevel',
        'error',
        '-ss',
        '1',
        '-i',
        videoPath,
        '-vframes',
        '1',
        '-vf',
        'scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630',
        '-q:v',
        '3',
        '-y',
        outPath,
      ];
      const { code, stderr } = await runFfmpegCapture(ffmpeg.path, args);
      if (code !== 0) {
        this.log.warn(`ffmpeg OG thumbnail selhal: ${stderr.slice(-500)}`);
        return null;
      }
      const buffer = await readFile(outPath);
      if (!buffer.length) return null;
      return await this.cloudinary.uploadImageBuffer(buffer, 'og-thumbnail.jpg');
    } catch (e) {
      this.log.warn(
        `OG thumbnail z videa selhal: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    } finally {
      await rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
