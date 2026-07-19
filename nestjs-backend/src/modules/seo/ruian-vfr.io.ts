import { createWriteStream } from 'node:fs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import axios from 'axios';
import * as yauzl from 'yauzl';
import { getUploadsPath } from '../../lib/uploads-path';
import { assertSafeRemoteUrl } from './seo-location-import.util';

export async function downloadToFile(url: string, destPath: string, timeoutMs = 300000): Promise<number> {
  const safe = assertSafeRemoteUrl(url);
  const dir = path.dirname(destPath);
  fs.mkdirSync(dir, { recursive: true });
  const res = await axios.get(safe.toString(), {
    responseType: 'stream',
    timeout: timeoutMs,
    maxContentLength: 2 * 1024 * 1024 * 1024,
    maxRedirects: 3,
  });
  const writer = createWriteStream(destPath);
  await pipeline(res.data, writer);
  const stat = fs.statSync(destPath);
  return stat.size;
}

export function createRuianWorkDir(): string {
  const dir = path.join(getUploadsPath(), 'ruian-vfr', `job_${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Extrahuje první XML/GML ze ZIP do cílové cesty (stream, bez načtení celého archivu do RAM). */
export async function extractFirstXmlFromZip(zipPath: string, destXmlPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err ?? new Error('ZIP nelze otevřít.'));
      zipfile.readEntry();
      zipfile.on('entry', (entry: yauzl.Entry) => {
        const name = entry.fileName;
        if (/\/$/.test(name) || !/\.(xml|gml)$/i.test(name)) {
          zipfile.readEntry();
          return;
        }
        zipfile.openReadStream(entry, (e, readStream) => {
          if (e || !readStream) return reject(e ?? new Error('ZIP stream chyba'));
          const writer = createWriteStream(destXmlPath);
          readStream.pipe(writer);
          writer.on('finish', () => {
            zipfile.close();
            resolve(name);
          });
          writer.on('error', reject);
        });
      });
      zipfile.on('end', () => reject(new Error('ZIP neobsahuje XML/GML soubor.')));
      zipfile.on('error', reject);
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
