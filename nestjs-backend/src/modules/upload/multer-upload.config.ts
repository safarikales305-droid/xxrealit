import { existsSync, mkdirSync } from 'node:fs';
import { diskStorage } from 'multer';
import { extname, join } from 'node:path';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

/** Stejná kořenová složka jako v `main.ts` (`process.cwd()/uploads`). */
export function getUploadsRoot(): string {
  return join(process.cwd(), 'uploads');
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function imageFileFilter(
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) {
  const ext = extname(file.originalname || '').toLowerCase() || '.jpg';
  if (!IMAGE_EXT.has(ext)) {
    cb(new Error('Nepovolený formát souboru (použijte JPG, PNG, WebP, GIF)'), false);
    return;
  }
  cb(null, true);
}

export const avatarMulterOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      const dir = getUploadsRoot();
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = extname(file.originalname || '').toLowerCase() || '.jpg';
      cb(null, `${unique}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: imageFileFilter,
};

export const propertyImagesMulterOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      const dir = join(getUploadsRoot(), 'properties');
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = extname(file.originalname || '').toLowerCase() || '.jpg';
      cb(null, `${unique}${ext}`);
    },
  }),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: imageFileFilter,
};
