import { existsSync } from 'node:fs';

export type FfmpegBinarySource = 'env' | 'ffmpeg-static' | 'system';

let cached: { path: string; source: FfmpegBinarySource } | null = null;

/**
 * Cesta k ffmpeg pro generování shorts (a případně další media).
 *
 * Pořadí:
 * 1. `FFMPEG_PATH` — explicitní cesta (Docker / vlastní build).
 * 2. `ffmpeg-static` — volitelná závislost (`optionalDependencies`); při úspěšné instalaci je v `node_modules`.
 *    Na některých hostinzích (např. Railway) může `npm ci` balíček přeskočit — pak se použije krok 3.
 * 3. `ffmpeg` z PATH — lokální vývoj, nebo image s nainstalovaným ffmpeg (viz `nixpacks.toml`).
 *
 * Pro S3 / vlastní worker později: nastavte jen `FFMPEG_PATH` nebo nahraďte volání vlastním adapterem.
 */
export function resolveFfmpegBinary(): { path: string; source: FfmpegBinarySource } {
  if (cached) {
    return cached;
  }

  const fromEnv = process.env.FFMPEG_PATH?.trim();
  if (fromEnv) {
    cached = { path: fromEnv, source: 'env' };
    return cached;
  }

  try {
    // Volitelná závislost — při absenci sestřelíme až na „system“.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const ffmpegStatic = require('ffmpeg-static') as string | null | undefined;
    if (typeof ffmpegStatic === 'string' && ffmpegStatic.length > 0) {
      cached = { path: ffmpegStatic, source: 'ffmpeg-static' };
      return cached;
    }
  } catch {
    /* modul není nainstalován */
  }

  cached = { path: 'ffmpeg', source: 'system' };
  return cached;
}

/** Reset cache (jen testy). */
export function resetFfmpegBinaryCacheForTests(): void {
  cached = null;
}

export function describeFfmpegPathForLog(resolvedPath: string, source: FfmpegBinarySource): string {
  const exists = source === 'system' ? '(PATH)' : existsSync(resolvedPath) ? '(file exists)' : '(file MISSING)';
  return `${resolvedPath} [${source}] ${exists}`;
}
