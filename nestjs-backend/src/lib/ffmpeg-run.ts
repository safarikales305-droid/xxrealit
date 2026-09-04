import { spawn } from 'node:child_process';

export type FfmpegRunResult = {
  code: number | null;
  stderr: string;
  signal: NodeJS.Signals | null;
};

export function runFfmpegCapture(
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

/** Zjistí ze stderr `ffmpeg -i …`, zda soubor obsahuje audio stopu. */
export function probeHasAudioStreamFromFfmpegStderr(stderr: string): boolean {
  return /\n\s*Stream #\d+:\d+[^:]*: Audio:/m.test(stderr);
}

/** Parsuje řádek `Duration: HH:MM:SS.xx` ze stderr `ffmpeg -i …`. */
export function parseDurationSecondsFromFfmpegStderr(stderr: string): number | null {
  const m = /Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d{2})/.exec(stderr);
  if (!m) return null;
  const hours = Number(m[1]);
  const min = Number(m[2]);
  const sec = Number(m[3]);
  if (![hours, min, sec].every((x) => Number.isFinite(x))) return null;
  return Math.round(hours * 3600 + min * 60 + sec);
}

/** Parsuje stderr `ffmpeg -filters` / `-version` pro dostupnost základních filtrů. */
export async function probeFfmpegCapabilities(
  executable: string,
): Promise<{
  version: string | null;
  filters: { overlay: boolean; scale: boolean; format: boolean; ass: boolean; drawtext: boolean };
}> {
  const empty = {
    version: null,
    filters: { overlay: false, scale: false, format: false, ass: false, drawtext: false },
  };
  try {
    const [versionRes, filtersRes] = await Promise.all([
      runFfmpegCapture(executable, ['-hide_banner', '-version']),
      runFfmpegCapture(executable, ['-hide_banner', '-filters']),
    ]);
    const versionLine =
      versionRes.stderr.split('\n').find((l) => l.startsWith('ffmpeg version')) ?? null;
    const filtersOut = filtersRes.stderr;
    return {
      version: versionLine,
      filters: {
        overlay: /\boverlay\b/.test(filtersOut),
        scale: /\bscale\b/.test(filtersOut),
        format: /\bformat\b/.test(filtersOut),
        ass: /\bass\b/.test(filtersOut),
        drawtext: /\bdrawtext\b/.test(filtersOut),
      },
    };
  } catch {
    return empty;
  }
}

/** Zjistí, zda ffmpeg build obsahuje filtr drawtext (volitelné — shorts overlay ho nevyžaduje). */
export async function probeFfmpegSupportsDrawtext(executable: string): Promise<boolean> {
  try {
    const { code, stderr } = await runFfmpegCapture(executable, [
      '-hide_banner',
      '-filters',
    ]);
    if (code !== 0) return false;
    return /\bdrawtext\b/.test(stderr);
  } catch {
    return false;
  }
}

export function quoteFfmpegArgv(argv: string[]): string {
  return argv
    .map((a) => {
      if (/[\s'"\\]/.test(a)) {
        return `'${a.replace(/'/g, `'\\''`)}'`;
      }
      return a;
    })
    .join(' ');
}
