import { createWriteStream } from 'node:fs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import axios from 'axios';
import * as yauzl from 'yauzl';
import { getUploadsPath, ensureUploadsPathExists } from '../../lib/uploads-path';
import { assertSafeRemoteUrl } from './seo-location-import.util';
import { formatRuianVfrError } from './ruian-vfr.errors';

export type RemoteHeadResult = {
  ok: boolean;
  status: number;
  contentLength?: number;
  error?: string;
  userMessage?: string;
};

/** Ověří existenci souboru HEAD požadavkem před stažením. */
export async function verifyRemoteFileHead(url: string, timeoutMs = 30000): Promise<RemoteHeadResult> {
  try {
    const safe = assertSafeRemoteUrl(url);
    const res = await axios.head(safe.toString(), {
      timeout: timeoutMs,
      maxRedirects: 3,
      validateStatus: () => true,
    });
    if (res.status === 404) {
      return {
        ok: false,
        status: 404,
        error: 'HTTP 404',
        userMessage: 'Soubor nebyl nalezen na serveru ČÚZK (HTTP 404).',
      };
    }
    if (res.status >= 400) {
      return {
        ok: false,
        status: res.status,
        error: `HTTP ${res.status}`,
        userMessage: `Soubor není dostupný (HTTP ${res.status}).`,
      };
    }
    const len = res.headers['content-length'];
    return {
      ok: true,
      status: res.status,
      contentLength: len ? Number.parseInt(String(len), 10) : undefined,
    };
  } catch (err) {
    const info = formatRuianVfrError(err);
    return {
      ok: false,
      status: 0,
      error: info.message,
      userMessage: info.userMessage,
    };
  }
}

export async function downloadToFile(url: string, destPath: string, timeoutMs = 300000): Promise<number> {
  const head = await verifyRemoteFileHead(url, Math.min(timeoutMs, 60000));
  if (!head.ok) {
    throw Object.assign(new Error(head.userMessage ?? head.error ?? 'Nelze stáhnout VFR.'), {
      code: head.status === 404 ? 'HTTP_404' : 'DOWNLOAD_HEAD_FAILED',
      userMessage: head.userMessage,
    });
  }

  const safe = assertSafeRemoteUrl(url);
  const dir = path.dirname(destPath);
  fs.mkdirSync(dir, { recursive: true });
  try {
    const res = await axios.get(safe.toString(), {
      responseType: 'stream',
      timeout: timeoutMs,
      maxContentLength: 2 * 1024 * 1024 * 1024,
      maxRedirects: 3,
      validateStatus: (s: number) => s < 400,
    });
    const writer = createWriteStream(destPath);
    await pipeline(res.data, writer);
    const stat = fs.statSync(destPath);
    return stat.size;
  } catch (err) {
    const info = formatRuianVfrError(err);
    throw Object.assign(new Error(info.userMessage), { code: info.code, userMessage: info.userMessage });
  }
}

export function createRuianWorkDir(): string {
  ensureUploadsPathExists();
  const dir = path.join(getUploadsPath(), 'ruian-vfr', `job_${Date.now()}`);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    const info = formatRuianVfrError(err);
    throw Object.assign(new Error(info.userMessage), { code: info.code, userMessage: info.userMessage });
  }
  return dir;
}

/** Extrahuje první XML/GML ze ZIP do cílové cesty (stream, bez načtení celého archivu do RAM). */
export async function extractFirstXmlFromZip(zipPath: string, destXmlPath: string): Promise<string> {
  if (!fs.existsSync(zipPath)) {
    throw Object.assign(new Error('ZIP soubor nebyl nalezen na disku.'), {
      code: 'ENOENT',
      userMessage: 'Soubor nebyl nalezen.',
    });
  }
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        const info = formatRuianVfrError(err ?? new Error('ZIP nelze otevřít.'));
        reject(Object.assign(new Error(info.userMessage), { code: 'ZIP_ERROR', userMessage: info.userMessage }));
        return;
      }
      zipfile.readEntry();
      zipfile.on('entry', (entry: yauzl.Entry) => {
        const name = entry.fileName;
        if (/\/$/.test(name) || !/\.(xml|gml)$/i.test(name)) {
          zipfile.readEntry();
          return;
        }
        zipfile.openReadStream(entry, (e, readStream) => {
          if (e || !readStream) {
            const info = formatRuianVfrError(e ?? new Error('ZIP stream chyba'));
            reject(Object.assign(new Error(info.userMessage), { code: 'ZIP_ERROR', userMessage: info.userMessage }));
            return;
          }
          const writer = createWriteStream(destXmlPath);
          readStream.pipe(writer);
          writer.on('finish', () => {
            zipfile.close();
            resolve(name);
          });
          writer.on('error', (we) => {
            const info = formatRuianVfrError(we);
            reject(Object.assign(new Error(info.userMessage), { code: 'ZIP_ERROR', userMessage: info.userMessage }));
          });
        });
      });
      zipfile.on('end', () => {
        reject(
          Object.assign(new Error('ZIP je poškozen nebo neobsahuje XML/GML soubor.'), {
            code: 'ZIP_NO_XML',
            userMessage: 'ZIP je poškozen nebo neobsahuje XML.',
          }),
        );
      });
      zipfile.on('error', (ze) => {
        const info = formatRuianVfrError(ze);
        reject(Object.assign(new Error(info.userMessage), { code: 'ZIP_ERROR', userMessage: info.userMessage }));
      });
    });
  });
}

export function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
