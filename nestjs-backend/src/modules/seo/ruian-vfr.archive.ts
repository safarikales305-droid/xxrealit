import { createWriteStream } from 'node:fs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yauzl from 'yauzl';
import { formatRuianVfrError } from './ruian-vfr.errors';
import type { DownloadLogFn } from './ruian-vfr.io';

export type ExtractedVfrFile = {
  absolutePath: string;
  archivePath: string;
  size: number;
};

const MIN_ZIP_BYTES = 1024;
const DATA_EXT = /\.(xml|gml|csv)$/i;

export function validateDownloadedFile(filePath: string, minBytes = MIN_ZIP_BYTES): number {
  if (!fs.existsSync(filePath)) {
    throw Object.assign(new Error('Stažený soubor neexistuje na disku.'), {
      code: 'ENOENT',
      userMessage: 'Soubor nebyl nalezen po stažení.',
    });
  }
  const stat = fs.statSync(filePath);
  if (stat.size < minBytes) {
    throw Object.assign(new Error(`Soubor je příliš malý (${stat.size} B).`), {
      code: 'FILE_TOO_SMALL',
      userMessage: 'Stažený soubor je prázdný nebo poškozený.',
    });
  }
  return stat.size;
}

function listZipEntries(zipPath: string): Promise<yauzl.Entry[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err ?? new Error('ZIP nelze otevřít.'));
        return;
      }
      const entries: yauzl.Entry[] = [];
      zipfile.on('entry', (entry: yauzl.Entry) => {
        entries.push(entry);
        zipfile.readEntry();
      });
      zipfile.on('end', () => {
        zipfile.close();
        resolve(entries);
      });
      zipfile.on('error', reject);
    });
  });
}

function extractZipEntry(zipPath: string, entry: yauzl.Entry, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err ?? new Error('ZIP open failed'));
      zipfile.on('entry', (e: yauzl.Entry) => {
        if (e.fileName !== entry.fileName) {
          zipfile.readEntry();
          return;
        }
        zipfile.openReadStream(e, (e2, readStream) => {
          if (e2 || !readStream) return reject(e2 ?? new Error('ZIP stream failed'));
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          const writer = createWriteStream(destPath);
          readStream.pipe(writer);
          writer.on('finish', () => {
            zipfile.close();
            resolve();
          });
          writer.on('error', reject);
        });
      });
      zipfile.readEntry();
      zipfile.on('error', reject);
    });
  });
}

/**
 * Rekurzivně rozbalí všechny XML/GML/CSV ze ZIP (včetně vnořených archivů).
 */
export async function extractAllVfrDataFiles(
  zipPath: string,
  workDir: string,
  onLog: DownloadLogFn = () => undefined,
  depth = 0,
): Promise<ExtractedVfrFile[]> {
  if (depth > 5) return [];

  validateDownloadedFile(zipPath);
  const entries = await listZipEntries(zipPath);
  onLog('Obsah archivu', {
    zipPath,
    entryCount: entries.length,
    sample: entries.slice(0, 15).map((e) => e.fileName),
  });

  if (!entries.length) {
    throw Object.assign(new Error('ZIP archiv je prázdný.'), {
      code: 'ZIP_EMPTY',
      userMessage: 'Archiv byl stažen, ale neobsahuje podporovaná RÚIAN data.',
    });
  }

  const extracted: ExtractedVfrFile[] = [];
  const nestedZips: string[] = [];

  for (const entry of entries) {
    const name = entry.fileName;
    if (/\/$/.test(name)) continue;

    const baseName = path.basename(name);
    const dest = path.join(workDir, `d${depth}`, baseName.replace(/[<>:"|?*]/g, '_'));

    if (/\.zip$/i.test(name)) {
      await extractZipEntry(zipPath, entry, dest);
      nestedZips.push(dest);
      continue;
    }

    if (!DATA_EXT.test(name)) continue;

    await extractZipEntry(zipPath, entry, dest);
    const size = fs.statSync(dest).size;
    extracted.push({ absolutePath: dest, archivePath: name, size });
  }

  for (const nested of nestedZips) {
    const inner = await extractAllVfrDataFiles(nested, workDir, onLog, depth + 1);
    extracted.push(...inner);
  }

  if (!extracted.length) {
    throw Object.assign(new Error('Archiv neobsahuje XML/GML/CSV soubory.'), {
      code: 'ZIP_NO_DATA',
      userMessage: 'Archiv byl stažen, ale neobsahuje podporovaná RÚIAN data.',
    });
  }

  onLog('ZIP rozbalen', {
    dataFiles: extracted.length,
    files: extracted.slice(0, 10).map((f) => ({ path: f.archivePath, size: f.size })),
  });

  return extracted;
}
