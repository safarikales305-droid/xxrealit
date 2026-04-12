import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import {
  describeFfmpegPathForLog,
  type FfmpegBinarySource,
  resolveFfmpegBinary,
} from '../../lib/ffmpeg-binary';
import { PropertyMediaCloudinaryService } from './property-media-cloudinary.service';

import sharp = require('sharp');

const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MIN_IMAGES = 2;
const MAX_IMAGES = 15;
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

function clampTotalSeconds(imageCount: number): number {
  return Math.min(20, Math.max(8, Math.round(imageCount * 2)));
}

/** Délka jednoho snímku při concat slideshow (bez přechodů). */
function slideDurationSecUniform(imageCount: number, totalSec: number): number {
  return totalSec / imageCount;
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

/** Cesta k textfile= pro drawtext (UTF-8 obsah souboru, ASCII název v tmp). */
function escapePathForDrawtextFile(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function quoteFfmpegArgv(argv: string[]): string {
  return argv
    .map((a) => {
      if (/[\s'"\\]/.test(a)) {
        return `'${a.replace(/'/g, `'\\''`)}'`;
      }
      return a;
    })
    .join(' ');
}

type FfmpegRunResult = { code: number | null; stderr: string; signal: NodeJS.Signals | null };

function runFfmpegCapture(
  executable: string,
  args: string[],
): Promise<FfmpegRunResult> {
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
    child.on('close', (code, signal) => {
      resolve({ code, stderr, signal });
    });
  });
}

async function runFfmpegLogged(
  log: Logger,
  label: string,
  executable: string,
  args: string[],
): Promise<void> {
  const argv = [executable, ...args];
  log.log(`[shorts-generator][ffmpeg:${label}] příkaz: ${quoteFfmpegArgv(argv)}`);
  const { code, stderr, signal } = await runFfmpegCapture(executable, args);
  if (code === 0) {
    if (stderr.trim()) {
      log.log(`[shorts-generator][ffmpeg:${label}] stderr (exit 0):\n${stderr}`);
    }
    return;
  }
  log.error(
    `[shorts-generator][ffmpeg:${label}] NEÚSPĚCH exit=${code} signal=${signal ?? '—'}\n--- stderr (celé) ---\n${stderr}\n--- konec stderr ---`,
  );
  throw new Error(
    `ffmpeg skončil s kódem ${code}${signal ? ` (signal ${signal})` : ''}. Poslední část stderr: ${stderr.slice(-2000)}`,
  );
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
    await runFfmpegLogged(log, 'version', executable, ['-hide_banner', '-version']);
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

/**
 * Předzápis ffconcat v adresáři se snímky — pouze relativní ASCII názvy souborů.
 * https://ffmpeg.org/ffmpeg-formats.html#concat-1
 */
async function writeFfconcatDemuxerList(
  tmpRoot: string,
  slideRelNames: string[],
  durationEachSec: number,
): Promise<string> {
  const listPath = join(tmpRoot, 'ffconcat.txt');
  const dur = durationEachSec.toFixed(4);
  const lines = ['ffconcat version 1.0'];
  for (const name of slideRelNames) {
    lines.push(`file '${name}'`);
    lines.push(`duration ${dur}`);
  }
  if (slideRelNames.length > 0) {
    lines.push(`file '${slideRelNames[slideRelNames.length - 1]}'`);
  }
  await writeFile(listPath, `${lines.join('\n')}\n`, 'utf8');
  return listPath;
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
   * Každý vstup → stejný JPEG 1080×1920, ASCII název (žádná diakritika z původního názvu souboru).
   */
  private async normalizeSlides(
    tmpRoot: string,
    images: Express.Multer.File[],
  ): Promise<string[]> {
    const relNames: string[] = [];
    for (let i = 0; i < images.length; i += 1) {
      const f = images[i];
      const rel = `slide_${String(i + 1).padStart(4, '0')}.jpg`;
      const abs = join(tmpRoot, rel);
      this.log.log(
        `[shorts-generator] vstup #${i + 1}: originalname=${JSON.stringify(f.originalname)} mimetype=${JSON.stringify(f.mimetype)} size=${f.size}B buffer=${f.buffer.length}B → ${resolve(abs)}`,
      );
      try {
        const meta = await sharp(f.buffer, { failOn: 'none' }).metadata();
        const usePages =
          meta.format === 'gif' || (meta.format === 'tiff' && (meta.pages ?? 0) > 1);
        const pipeline = sharp(f.buffer, {
          failOn: 'none',
          ...(usePages ? { pages: 1 as const } : {}),
        }).rotate();
        await pipeline
          .resize(1080, 1920, { fit: 'cover', position: 'centre' })
          .jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: '4:2:0' })
          .toFile(abs);
        this.log.log(
          `[shorts-generator] normalizováno #${i + 1}: ${rel} (src ${meta.format ?? '?'} ${meta.width ?? '?'}×${meta.height ?? '?'})`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log.error(`[shorts-generator] Sharp selhal u snímku #${i + 1}: ${msg}`);
        throw new BadRequestException(`Obrázek #${i + 1} nelze zpracovat: ${msg.slice(0, 200)}`);
      }
      relNames.push(rel);
    }
    return relNames;
  }

  /** Jádro: concat demuxer → H.264 MP4 (bez hudby, bez textu). */
  private async encodeSlideshowCore(
    ffmpegBin: string,
    ffconcatPath: string,
    totalSec: number,
    outPath: string,
  ): Promise<void> {
    const args = [
      '-hide_banner',
      '-loglevel',
      'warning',
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      ffconcatPath,
      '-vf',
      `fps=${FPS},format=yuv420p`,
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
      '-an',
      outPath,
    ];
    await runFfmpegLogged(this.log, 'slideshow-core', ffmpegBin, args);
  }

  private async tryMuxMusic(
    ffmpegBin: string,
    musicKey: ShortsMusicKey,
    videoIn: string,
    totalSec: number,
    outPath: string,
  ): Promise<boolean> {
    if (musicKey === 'none') {
      return false;
    }
    const lavfi = lavfiAudioInput(musicKey, totalSec + 1);
    const args = [
      '-hide_banner',
      '-loglevel',
      'warning',
      '-y',
      '-i',
      videoIn,
      '-f',
      'lavfi',
      '-i',
      lavfi,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-shortest',
      outPath,
    ];
    try {
      await runFfmpegLogged(this.log, 'mux-audio', ffmpegBin, args);
      return true;
    } catch (e) {
      this.log.warn(
        `[shorts-generator] mux hudby selhal — pokračuji bez zvuku. ${e instanceof Error ? e.message : e}`,
      );
      return false;
    }
  }

  private async tryDrawTextOverlay(
    ffmpegBin: string,
    tmpRoot: string,
    videoIn: string,
    title: string,
    city: string,
    priceLine: string,
    outPath: string,
  ): Promise<boolean> {
    const titlePath = join(tmpRoot, 'ov-title.txt');
    const cityPath = join(tmpRoot, 'ov-city.txt');
    const pricePath = join(tmpRoot, 'ov-price.txt');
    await writeFile(titlePath, `${title}\n`, 'utf8');
    await writeFile(cityPath, `${city}\n`, 'utf8');
    await writeFile(pricePath, `${priceLine}\n`, 'utf8');
    const p1 = escapePathForDrawtextFile(titlePath);
    const p2 = escapePathForDrawtextFile(cityPath);
    const p3 = escapePathForDrawtextFile(pricePath);
    this.log.log(
      `[shorts-generator] overlay soubory: ${resolve(titlePath)}, ${resolve(cityPath)}, ${resolve(pricePath)}`,
    );
    const vf = [
      `[0:v]drawtext=textfile='${p1}':fontsize=52:fontcolor=white:borderw=4:bordercolor=black@0.65:x=(w-text_w)/2:y=h-260[v1]`,
      `[v1]drawtext=textfile='${p2}':fontsize=40:fontcolor=white:borderw=3:bordercolor=black@0.65:x=(w-text_w)/2:y=h-190[v2]`,
      `[v2]drawtext=textfile='${p3}':fontsize=44:fontcolor=0xFF6A00:borderw=3:bordercolor=black@0.65:x=(w-text_w)/2:y=h-120[outv]`,
    ].join(';');
    const args = [
      '-hide_banner',
      '-loglevel',
      'warning',
      '-y',
      '-i',
      videoIn,
      '-filter_complex',
      vf,
      '-map',
      '[outv]',
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
      '-an',
      outPath,
    ];
    try {
      await runFfmpegLogged(this.log, 'drawtext', ffmpegBin, args);
      return true;
    } catch (e) {
      this.log.warn(
        `[shorts-generator] text overlay selhal — použiji video bez textu. ${e instanceof Error ? e.message : e}`,
      );
      return false;
    }
  }

  /**
   * Vertikální MP4 (9:16): Sharp → JPEG snímky → concat → volitelně AAC z lavfi → volitelně drawtext.
   * Při chybě hudby/textu se použije kratší pipeline (viz logy).
   */
  async generateAndUpload(input: GenerateShortsFromPhotosInput): Promise<{ videoUrl: string }> {
    validateImages(input.images);
    const { path: ffmpegBin, source: ffmpegSource } = this.getFfmpeg();
    await assertFfmpegAvailable(this.log, ffmpegBin, ffmpegSource);

    const tmpRoot = join(tmpdir(), `shorts-${randomBytes(12).toString('hex')}`);
    await mkdir(tmpRoot, { recursive: true });

    try {
      const n = input.images.length;
      const totalSec = clampTotalSeconds(n);
      const slideDur = slideDurationSecUniform(n, totalSec);
      this.log.log(
        `[shorts-generator] start: snímků=${n}, total≈${totalSec}s, slide≈${slideDur.toFixed(3)}s, hudba=${input.musicKey}, text=${input.includeTextOverlay}, tmp=${resolve(tmpRoot)}`,
      );

      const slideRelNames = await this.normalizeSlides(tmpRoot, input.images);
      const ffconcatPath = await writeFfconcatDemuxerList(tmpRoot, slideRelNames, slideDur);
      this.log.log(
        `[shorts-generator] ffconcat: ${resolve(ffconcatPath)}\n${(await readFile(ffconcatPath, 'utf8')).trimEnd()}`,
      );

      const corePath = join(tmpRoot, 'core.mp4');
      await this.encodeSlideshowCore(ffmpegBin, ffconcatPath, totalSec, corePath);

      let currentPath = corePath;

      if (input.includeTextOverlay) {
        const title = input.title.trim().slice(0, 120);
        const city = input.city.trim().slice(0, 120);
        const priceLine = `${input.price.toLocaleString('cs-CZ')} ${(input.currency || 'CZK').trim().slice(0, 8)}`;
        const textOut = join(tmpRoot, 'with-text.mp4');
        const ok = await this.tryDrawTextOverlay(ffmpegBin, tmpRoot, currentPath, title, city, priceLine, textOut);
        if (ok) {
          currentPath = textOut;
        }
      }

      let finalPath = currentPath;
      if (input.musicKey !== 'none') {
        const audioOut = join(tmpRoot, 'with-audio.mp4');
        const ok = await this.tryMuxMusic(ffmpegBin, input.musicKey, currentPath, totalSec, audioOut);
        if (ok) {
          finalPath = audioOut;
        }
      }

      const mp4 = await readFile(finalPath);
      if (!mp4.length) {
        throw new BadRequestException('Výstupní video je prázdné.');
      }

      const videoUrl = await this.cloudinary.uploadVideoBuffer(mp4, 'listing-shorts.mp4');
      this.log.log(`[shorts-generator] hotovo, upload ${mp4.length} B → Cloudinary`);
      return { videoUrl };
    } catch (e) {
      if (e instanceof BadRequestException || e instanceof ServiceUnavailableException) {
        throw e;
      }
      this.log.error('[shorts-generator] fatální chyba generování', e);
      const msg = e instanceof Error ? e.message : String(e);
      throw new BadRequestException(
        `Generování videa se nepodařilo. ${msg.slice(0, 500)} Podrobnosti viz log backendu (celý stderr u ffmpeg).`,
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
