import * as fs from 'node:fs';
import { join } from 'node:path';

/**
 * Absolutní cesta ke kořenové složce `uploads` (stejná jako u `app.useStaticAssets` v `main.ts`).
 * Po buildu: `dist/lib/uploads-path.js` → `../../uploads` = `nestjs-backend/uploads`.
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

/** Podadresáře pro statické `/uploads/...` i pro zápis avatarů / cover / inzerátů. */
export function ensureStandardUploadSubdirs(): void {
  const root = ensureUploadsPathExists();
  for (const sub of ['properties', 'videos', 'avatars', 'covers']) {
    const p = join(root, sub);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
    }
  }
}
