import { Injectable, Logger } from '@nestjs/common';
import { readFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { resolveFfmpegBinary } from '../../lib/ffmpeg-binary';
import { runFfmpegCapture } from '../../lib/ffmpeg-run';
import { isImageBufferWhiteOrBlank } from './og-image-probe.util';
import { PropertyMediaCloudinaryService } from './property-media-cloudinary.service';

@Injectable()
export class VideoOgThumbnailService {
  private readonly log = new Logger(VideoOgThumbnailService.name);

  constructor(private readonly cloudinary: PropertyMediaCloudinaryService) {}

  /** Extrahuje snímek 1200×630 JPG z času ~2s (ne bílý úvod videa). */
  async extractAndUploadFromFile(videoPath: string): Promise<string | null> {
    const ffmpeg = resolveFfmpegBinary();
    if (!ffmpeg.path) {
      this.log.warn('ffmpeg nedostupný — přeskočeno generování OG thumbnailu z videa');
      return null;
    }

    const seekSeconds = [2, 3, 1.5];
    for (const ss of seekSeconds) {
      const url = await this.tryExtractFrame(ffmpeg.path, videoPath, ss);
      if (url) return url;
    }
    return null;
  }

  private async tryExtractFrame(
    ffmpegPath: string,
    videoPath: string,
    seekSec: number,
  ): Promise<string | null> {
    const tmpRoot = join(tmpdir(), `og-thumb-${randomBytes(8).toString('hex')}`);
    await mkdir(tmpRoot, { recursive: true });
    const outPath = join(tmpRoot, 'og-thumb.jpg');

    try {
      const args = [
        '-hide_banner',
        '-loglevel',
        'error',
        '-ss',
        String(seekSec),
        '-i',
        videoPath,
        '-frames:v',
        '1',
        '-vf',
        'scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630',
        '-q:v',
        '2',
        '-y',
        outPath,
      ];
      const { code, stderr } = await runFfmpegCapture(ffmpegPath, args);
      if (code !== 0) {
        this.log.warn(`ffmpeg OG thumbnail (ss=${seekSec}) selhal: ${stderr.slice(-500)}`);
        return null;
      }
      const buffer = await readFile(outPath);
      if (!buffer.length) return null;
      if (await isImageBufferWhiteOrBlank(buffer)) {
        this.log.warn(`OG thumbnail ss=${seekSec}s je bílý — zkouším další čas`);
        return null;
      }
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
