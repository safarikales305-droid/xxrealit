import { createWriteStream } from 'node:fs';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import axios from 'axios';
import * as yauzl from 'yauzl';
import { assertSafeRemoteUrl } from './seo-location-import.util';
import { formatRuianVfrError } from './ruian-vfr.errors';

export type DownloadLogFn = (message: string, meta?: Record<string, unknown>) => void;

export type RemoteHeadResult = {
  ok: boolean;
  status: number;
  contentLength?: number;
  contentType?: string;
  error?: string;
  userMessage?: string;
};

function defaultLog(message: string, meta?: Record<string, unknown>): void {
  if (meta) {
    console.log(`[RUIAN VFR] ${message}`, JSON.stringify(meta));
  } else {
    console.log(`[RUIAN VFR] ${message}`);
  }
}

/** Dočasný pracovní adresář — na Railway vždy pod os.tmpdir() (/tmp). */
export function createRuianWorkDir(): string {
  const dir = path.join(os.tmpdir(), 'xxrealit-ruian-vfr', `job_${Date.now()}`);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    const info = formatRuianVfrError(err);
    throw Object.assign(new Error(info.userMessage), { code: info.code, userMessage: info.userMessage });
  }
  return dir;
}

/** Ověří existenci souboru HEAD požadavkem před stažením. */
export async function verifyRemoteFileHead(
  url: string,
  timeoutMs = 30000,
  onLog: DownloadLogFn = defaultLog,
): Promise<RemoteHeadResult> {
  try {
    const safe = assertSafeRemoteUrl(url);
    onLog('Ověřuji dostupnost souboru (HEAD)...', { url: safe.toString() });
    const res = await axios.head(safe.toString(), {
      timeout: timeoutMs,
      maxRedirects: 3,
      validateStatus: () => true,
    });
    const contentLength = res.headers['content-length'];
    const contentType = res.headers['content-type'];
    onLog('HEAD odpověď', {
      url: safe.toString(),
      status: res.status,
      contentLength: contentLength ?? null,
      contentType: contentType ?? null,
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
    return {
      ok: true,
      status: res.status,
      contentLength: contentLength ? Number.parseInt(String(contentLength), 10) : undefined,
      contentType: contentType ? String(contentType) : undefined,
    };
  } catch (err) {
    const info = formatRuianVfrError(err);
    onLog('HEAD selhal', { error: info.message });
    return {
      ok: false,
      status: 0,
      error: info.message,
      userMessage: info.userMessage,
    };
  }
}

export async function downloadToFile(
  url: string,
  destPath: string,
  timeoutMs = 300000,
  onLog: DownloadLogFn = defaultLog,
): Promise<number> {
  const head = await verifyRemoteFileHead(url, Math.min(timeoutMs, 60000), onLog);
  if (!head.ok) {
    throw Object.assign(new Error(head.userMessage ?? head.error ?? 'Nelze stáhnout VFR.'), {
      code: head.status === 404 ? 'HTTP_404' : 'DOWNLOAD_HEAD_FAILED',
      userMessage: head.userMessage,
    });
  }

  const safe = assertSafeRemoteUrl(url);
  const dir = path.dirname(destPath);
  fs.mkdirSync(dir, { recursive: true });

  onLog('Začínám stahovat...', {
    url: safe.toString(),
    destPath,
    expectedSize: head.contentLength ?? null,
    contentType: head.contentType ?? null,
  });

  try {
    const res = await axios.get(safe.toString(), {
      responseType: 'stream',
      timeout: timeoutMs,
      maxContentLength: 2 * 1024 * 1024 * 1024,
      maxRedirects: 3,
      validateStatus: (s: number) => s < 400,
    });

    onLog('HTTP odpověď přijata', {
      status: res.status,
      contentLength: res.headers['content-length'] ?? null,
      contentType: res.headers['content-type'] ?? null,
      hasBody: Boolean(res.data),
      bodyType: res.data == null ? 'null' : typeof res.data,
    });

    if (!res.data) {
      throw Object.assign(new Error('Response body je prázdný.'), {
        code: 'EMPTY_BODY',
        userMessage: 'Nelze stáhnout VFR — server vrátil prázdnou odpověď.',
      });
    }

    if (typeof (res.data as NodeJS.ReadableStream).pipe !== 'function') {
      throw Object.assign(new Error('Response body není stream.'), {
        code: 'INVALID_STREAM',
        userMessage: 'Nelze stáhnout VFR — neplatný formát odpovědi serveru.',
      });
    }

    const writer = createWriteStream(destPath);
    await pipeline(res.data as NodeJS.ReadableStream, writer);
    const stat = fs.statSync(destPath);
    onLog('Soubor uložen', { destPath, bytes: stat.size });
    return stat.size;
  } catch (err) {
    onLog('Stažení selhalo', {
      url: safe.toString(),
      destPath,
      error: err instanceof Error ? err.message : String(err),
    });
    const info = formatRuianVfrError(err);
    throw Object.assign(new Error(info.userMessage), { code: info.code, userMessage: info.userMessage });
  }
}

/** Extrahuje první XML/GML ze ZIP do cílové cesty (stream, bez načtení celého archivu do RAM). */
export async function extractFirstXmlFromZip(
  zipPath: string,
  destXmlPath: string,
  onLog: DownloadLogFn = defaultLog,
): Promise<string> {
  if (!fs.existsSync(zipPath)) {
    throw Object.assign(new Error('ZIP soubor nebyl nalezen na disku.'), {
      code: 'ENOENT',
      userMessage: 'Soubor nebyl nalezen.',
    });
  }
  onLog('Rozbaluji ZIP...', { zipPath, destXmlPath });
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
            onLog('ZIP rozbalen', { innerFile: name, destXmlPath });
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
