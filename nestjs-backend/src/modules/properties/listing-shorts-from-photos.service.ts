import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import {
  describeFfmpegPathForLog,
  type FfmpegBinarySource,
  resolveFfmpegBinary,
} from '../../lib/ffmpeg-binary';
import { PropertyMediaCloudinaryService } from './property-media-cloudinary.service';

const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MIN_IMAGES = 2;
const MAX_IMAGES = 15;
const FADE_SEC = 0.55;
const FPS = 30;

export type ShortsMusicKey = 'none' | 'demo_soft' | 'demo_warm' | 'demo_pulse';

export type GenerateShortsFromPhotosInput = {
  images: Express.Multer.File[];
  title: string;
  city: string;
  price: number;
  currency: string;
  musicKey: ShortsMusicKey;
  includeTextOverlay: boolean;
};

function posixPath(p: string): string {
  return p.replace(/\\/g, '/');
}

function clampTotalSeconds(imageCount: number): number {
  return Math.min(20, Math.max(8, Math.round(imageCount * 2)));
}

function slideDurationSec(imageCount: number, totalSec: number): number {
  return (totalSec + (imageCount - 1) * FADE_SEC) / imageCount;
}

function escapeDrawtextFilePathForFilter(p: string): string {
  return posixPath(p).replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function lavfiAudioInput(musicKey: ShortsMusicKey, durationSec: number): string {
  const d = durationSec.toFixed(2);
  switch (musicKey) {
    case 'demo_soft':
      return `sine=frequency=220:sample_rate=44100:duration=${d}`;
    case 'demo_warm':
      return `sine=frequency=330:sample_rate=44100:duration=${d}`;
    case 'demo_pulse':
      return `aevalsrc='0.09*sin(2*PI*220*t)+0.09*sin(2*PI*330*t)':sample_rate=44100:duration=${d}`;
    default:
      return `sine=frequency=220:sample_rate=44100:duration=${d}`;
  }
}

function runFfmpeg(executable: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      reject(err);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg skončil s kódem ${code}. ${stderr.slice(-1500)}`));
    });
  });
}

function ensureFfmpegExecutable(executable: string, source: FfmpegBinarySource): void {
  if (source !== 'ffmpeg-static' && source !== 'env') {
    return;
  }
  if (!existsSync(executable)) {
    return;
  }
  try {
    chmodSync(executable, 0o755);
  } catch {
    /* některé FS read-only */
  }
}

async function assertFfmpegAvailable(
  log: Logger,
  executable: string,
  source: FfmpegBinarySource,
): Promise<void> {
  ensureFfmpegExecutable(executable, source);
  log.log(
    `[shorts-generator] ffmpeg probe: ${describeFfmpegPathForLog(executable, source)}`,
  );
  try {
    await runFfmpeg(executable, ['-hide_banner', '-version']);
    log.log(`[shorts-generator] ffmpeg -version OK (binary=${executable})`);
  } catch (e) {
    const hint =
      source === 'system'
        ? ' Nainstalujte balíček ffmpeg-static (v projektu), systémový ffmpeg, nebo nastavte FFMPEG_PATH.'
        : ' Zkontrolujte oprávnění k binárce nebo nastavte FFMPEG_PATH na funkční ffmpeg.';
    log.error(
      `[shorts-generator] ffmpeg nedostupný nebo nefunguje (binary=${executable}, source=${source})`,
      e instanceof Error ? e.stack : e,
    );
    throw new ServiceUnavailableException(
      `Generování videa vyžaduje funkční ffmpeg.${hint}`,
    );
  }
}

function validateImages(images: Express.Multer.File[]): void {
  if (images.length < MIN_IMAGES) {
    throw new BadRequestException(`Pro generování shorts je potřeba alespoň ${MIN_IMAGES} fotky.`);
  }
  if (images.length > MAX_IMAGES) {
    throw new BadRequestException(`Pro generování shorts použijte nejvýše ${MAX_IMAGES} fotek najednou.`);
  }
  for (const file of images) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Jeden z obrázků je prázdný nebo nebyl správně nahrán.');
    }
    const ext = extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_IMAGE_EXT.has(ext)) {
      throw new BadRequestException(`Nepovolený formát obrázku: ${ext || '(bez přípony)'}`);
    }
  }
}

function isMusicKey(v: string): v is ShortsMusicKey {
  return v === 'none' || v === 'demo_soft' || v === 'demo_warm' || v === 'demo_pulse';
}

@Injectable()
export class ListingShortsFromPhotosService {
  private readonly log = new Logger(ListingShortsFromPhotosService.name);
  private loggedFfmpegResolution = false;

  constructor(private readonly cloudinary: PropertyMediaCloudinaryService) {}

  private getFfmpeg(): { path: string; source: FfmpegBinarySource } {
    const resolved = resolveFfmpegBinary();
    if (!this.loggedFfmpegResolution) {
      this.loggedFfmpegResolution = true;
      this.log.log(
        `[shorts-generator] používám ffmpeg: ${describeFfmpegPathForLog(resolved.path, resolved.source)}`,
      );
    }
    return resolved;
  }

  /**
   * Složí vertikální MP4 (9:16) z fotek, volitelně s jednoduchým audiem (lavfi demo stopy).
   * Výsledek nahraje na Cloudinary stejně jako uživatelské video → kompatibilní `videoUrl` pro shorts.
   */
  async generateAndUpload(input: GenerateShortsFromPhotosInput): Promise<{ videoUrl: string }> {
    validateImages(input.images);
    const { path: ffmpegBin, source: ffmpegSource } = this.getFfmpeg();
    await assertFfmpegAvailable(this.log, ffmpegBin, ffmpegSource);

    const tmpRoot = join(tmpdir(), `shorts-${randomBytes(12).toString('hex')}`);
    await mkdir(tmpRoot, { recursive: true });

    const imagePaths: string[] = [];
    try {
      const n = input.images.length;
      const totalSec = clampTotalSeconds(n);
      const slideDur = slideDurationSec(n, totalSec);
      this.log.log(
        `Shorts generace: ${n} obrázků, slide≈${slideDur.toFixed(2)}s, celkem≈${totalSec}s, hudba=${input.musicKey}, text=${input.includeTextOverlay}`,
      );

      for (let i = 0; i < n; i += 1) {
        const ext = extname(input.images[i].originalname || '').toLowerCase() || '.jpg';
        const safeExt = ALLOWED_IMAGE_EXT.has(ext) ? ext : '.jpg';
        const ip = join(tmpRoot, `img-${i}${safeExt}`);
        await writeFile(ip, input.images[i].buffer);
        imagePaths.push(ip);
      }

      const outPath = join(tmpRoot, 'shorts-out.mp4');

      const filterParts: string[] = [];
      for (let i = 0; i < n; i += 1) {
        filterParts.push(
          `[${i}:v]fps=${FPS},scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,format=yuv420p,setpts=PTS-STARTPTS[v${i}]`,
        );
      }

      let lastLabel = 'v0';
      for (let i = 1; i < n; i += 1) {
        const outLabel = i === n - 1 ? 'vmerged' : `vx${i}`;
        const offset = (i * (slideDur - FADE_SEC)).toFixed(3);
        filterParts.push(
          `[${lastLabel}][v${i}]xfade=transition=fade:duration=${FADE_SEC}:offset=${offset}[${outLabel}]`,
        );
        lastLabel = outLabel;
      }

      let videoOutLabel = 'vmerged';
      if (input.includeTextOverlay) {
        const titlePath = join(tmpRoot, 'overlay-title.txt');
        const cityPath = join(tmpRoot, 'overlay-city.txt');
        const pricePath = join(tmpRoot, 'overlay-price.txt');
        await writeFile(titlePath, input.title.trim().slice(0, 120), 'utf8');
        await writeFile(cityPath, input.city.trim().slice(0, 120), 'utf8');
        const priceLine = `${input.price.toLocaleString('cs-CZ')} ${(input.currency || 'CZK').trim().slice(0, 8)}`;
        await writeFile(pricePath, priceLine.slice(0, 120), 'utf8');

        const t1 = escapeDrawtextFilePathForFilter(titlePath);
        const t2 = escapeDrawtextFilePathForFilter(cityPath);
        const t3 = escapeDrawtextFilePathForFilter(pricePath);

        filterParts.push(
          `[vmerged]drawtext=textfile='${t1}':fontsize=52:fontcolor=white:borderw=4:bordercolor=black@0.65:x=(w-text_w)/2:y=h-260[vtitle]`,
        );
        filterParts.push(
          `[vtitle]drawtext=textfile='${t2}':fontsize=40:fontcolor=white:borderw=3:bordercolor=black@0.65:x=(w-text_w)/2:y=h-190[vsub]`,
        );
        filterParts.push(
          `[vsub]drawtext=textfile='${t3}':fontsize=44:fontcolor=0xFF6A00:borderw=3:bordercolor=black@0.65:x=(w-text_w)/2:y=h-120[vout]`,
        );
        videoOutLabel = 'vout';
      }

      const filterComplex = filterParts.join(';');
      const args: string[] = ['-y'];
      const tSlide = slideDur.toFixed(3);
      for (const p of imagePaths) {
        args.push('-loop', '1', '-t', tSlide, '-i', p);
      }

      const audioInputIndex = n;
      const useAudio = input.musicKey !== 'none';
      if (useAudio) {
        args.push('-f', 'lavfi', '-i', lavfiAudioInput(input.musicKey, totalSec + 0.5));
      }

      args.push('-filter_complex', filterComplex);
      args.push('-map', `[${videoOutLabel}]`);
      if (useAudio) {
        args.push('-map', `${audioInputIndex}:a`, '-c:a', 'aac', '-b:a', '160k', '-shortest');
      } else {
        args.push('-an');
      }

      args.push(
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        '-t',
        totalSec.toFixed(2),
        outPath,
      );

      this.log.log(
        `[shorts-generator] spouštím ffmpeg binary=${ffmpegBin} výstup=${posixPath(outPath)}`,
      );
      this.log.debug(`ffmpeg args (začátek): ${[ffmpegBin, ...args].slice(0, 14).join(' ')} …`);
      await runFfmpeg(ffmpegBin, args);

      const mp4 = await readFile(outPath);
      if (!mp4.length) {
        throw new BadRequestException('Výstupní video je prázdné.');
      }

      const videoUrl = await this.cloudinary.uploadVideoBuffer(mp4, 'listing-shorts.mp4');
      this.log.log(`Shorts upload dokončen, délka bufferu ${mp4.length} B`);
      return { videoUrl };
    } catch (e) {
      if (e instanceof BadRequestException || e instanceof ServiceUnavailableException) {
        throw e;
      }
      this.log.error('Generování shorts selhalo', e);
      const msg = e instanceof Error ? e.message : String(e);
      throw new BadRequestException(
        `Generování videa se nepodařilo. ${msg.slice(0, 400)}`,
      );
    } finally {
      await rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  static parseMusicKey(raw: unknown): ShortsMusicKey {
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (isMusicKey(s)) return s;
    return 'none';
  }

  static parseBool(raw: unknown): boolean {
    if (raw === true) return true;
    if (typeof raw === 'string') {
      const t = raw.trim().toLowerCase();
      return t === '1' || t === 'true' || t === 'yes' || t === 'on';
    }
    return false;
  }
}
