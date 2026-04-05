import * as fs from 'node:fs';
import { join } from 'node:path';

/**
 * Absolutní cesta k `uploads` vedle `dist/` (stejně jako `join(__dirname, '..', 'uploads')` z `dist/main.js`).
 * Po buildu: tento soubor je `dist/lib/uploads-path.js` → `../../uploads` = kořen projektu/uploads.
 */
export function getUploadsPath(): string {
  return join(__dirname, '..', '..', 'uploads');
}

export function ensureUploadsPathExists(): string {
  const dir = getUploadsPath();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
