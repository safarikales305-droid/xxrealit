import { existsSync, mkdirSync } from 'node:fs';
import { diskStorage, memoryStorage } from 'multer';
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

/** Multipart inzerátů — buffery pro Cloudinary (upload_stream). */
export const propertyMediaMemoryMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024, files: 31 },
};

/** Admin — hudba pro shorts (jeden soubor, MP3/WAV/M4A). */
export const shortsMusicMemoryMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
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
};
