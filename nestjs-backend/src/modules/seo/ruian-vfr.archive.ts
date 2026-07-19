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
  ext: string;
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

function fileExt(name: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m?.[1]?.toLowerCase() ?? 'unknown';
}

/** Jednoprůchodová extrakce — ZIP se otevře jen jednou (vhodné pro velké státní soubory). */
function extractZipSinglePass(
  zipPath: string,
  workDir: string,
  depth: number,
  onLog: DownloadLogFn,
): Promise<{ extracted: ExtractedVfrFile[]; nestedZips: string[]; entryCount: number }> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        const info = formatRuianVfrError(err ?? new Error('ZIP nelze otevřít.'));
        reject(Object.assign(new Error(info.userMessage), { code: 'ZIP_ERROR', userMessage: info.userMessage }));
        return;
      }

      const extracted: ExtractedVfrFile[] = [];
      const nestedZips: string[] = [];
      let entryCount = 0;
      let pending = 0;
      let ended = false;

      const finish = () => {
        if (!ended || pending > 0) return;
        zipfile.close();
        resolve({ extracted, nestedZips, entryCount });
      };

      const fail = (e: unknown) => {
        try {
          zipfile.close();
        } catch {
          /* ignore */
        }
        reject(e);
      };

      zipfile.on('entry', (entry: yauzl.Entry) => {
        entryCount += 1;
        const name = entry.fileName;
        if (/\/$/.test(name)) {
          zipfile.readEntry();
          return;
        }

        const baseName = path.basename(name);
        const dest = path.join(workDir, `d${depth}`, baseName.replace(/[<>:"|?*]/g, '_'));
        const isNestedZip = /\.zip$/i.test(name);
        const isData = DATA_EXT.test(name);

        if (!isNestedZip && !isData) {
          zipfile.readEntry();
          return;
        }

        pending += 1;
        zipfile.openReadStream(entry, (e2, readStream) => {
          if (e2 || !readStream) {
            pending -= 1;
            fail(e2 ?? new Error('ZIP stream failed'));
            return;
          }

          fs.mkdirSync(path.dirname(dest), { recursive: true });
          const writer = createWriteStream(dest);
          readStream.pipe(writer);
          writer.on('finish', () => {
            pending -= 1;
            if (isNestedZip) {
              nestedZips.push(dest);
            } else {
              const size = fs.statSync(dest).size;
              extracted.push({
                absolutePath: dest,
                archivePath: name,
                size,
                ext: fileExt(name),
              });
              onLog('Extrahován soubor', { name, size, ext: fileExt(name) });
            }
            finish();
            zipfile.readEntry();
          });
          writer.on('error', (we) => {
            pending -= 1;
            fail(we);
          });
          readStream.on('error', (re) => {
            pending -= 1;
            fail(re);
          });
        });
      });

      zipfile.on('end', () => {
        ended = true;
        finish();
      });
      zipfile.on('error', fail);
      zipfile.readEntry();
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
  onStep?: (message: string, meta?: Record<string, unknown>) => void,
): Promise<ExtractedVfrFile[]> {
  if (depth > 5) return [];

  validateDownloadedFile(zipPath);
  onStep?.('Vyhledávám XML...', { zipPath, depth });

  const { extracted, nestedZips, entryCount } = await extractZipSinglePass(zipPath, workDir, depth, onLog);

  onLog('Obsah archivu', {
    zipPath,
    entryCount,
    dataFiles: extracted.length,
    nestedZips: nestedZips.length,
    sample: extracted.slice(0, 15).map((f) => ({ path: f.archivePath, size: f.size, ext: f.ext })),
  });

  if (entryCount === 0) {
    throw Object.assign(new Error('ZIP archiv je prázdný.'), {
      code: 'ZIP_EMPTY',
      userMessage: 'Archiv byl stažen, ale neobsahuje podporovaná RÚIAN data.',
    });
  }

  const allExtracted = [...extracted];

  for (const nested of nestedZips) {
    const inner = await extractAllVfrDataFiles(nested, workDir, onLog, depth + 1, onStep);
    allExtracted.push(...inner);
  }

  if (!allExtracted.length) {
    const nonData = entryCount - nestedZips.length;
    throw Object.assign(
      new Error(
        `Archiv neobsahuje XML/GML/CSV soubory (${entryCount} položek, ${nestedZips.length} vnořených ZIP).`,
      ),
      {
        code: 'ZIP_NO_DATA',
        userMessage: 'Archiv byl stažen, ale neobsahuje podporovaná RÚIAN data.',
        detail: `Položek v archivu: ${entryCount}, bez datových souborů: ${nonData}`,
      },
    );
  }

  onStep?.('Archiv rozbalen', {
    dataFiles: allExtracted.length,
    files: allExtracted.map((f) => ({
      path: f.archivePath,
      size: f.size,
      ext: f.ext,
      sizeMb: Math.round((f.size / 1024 / 1024) * 10) / 10,
    })),
  });

  onLog('ZIP rozbalen', {
    dataFiles: allExtracted.length,
    files: allExtracted.slice(0, 10).map((f) => ({ path: f.archivePath, size: f.size, ext: f.ext })),
  });

  return allExtracted;
}
