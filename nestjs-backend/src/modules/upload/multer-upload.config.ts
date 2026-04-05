import { existsSync, mkdirSync } from 'node:fs';
import { diskStorage } from 'multer';
import { extname, join } from 'node:path';
import { getUploadsPath } from '../../lib/uploads-path';

export function getUploadsRoot(): string {
  return getUploadsPath();
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

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
};
