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
