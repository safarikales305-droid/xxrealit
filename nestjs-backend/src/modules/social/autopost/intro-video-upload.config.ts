import { memoryStorage } from 'multer';

export const INTRO_VIDEO_UPLOAD_MAX_BYTES = 150 * 1024 * 1024;

export const introVideoMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: INTRO_VIDEO_UPLOAD_MAX_BYTES },
};
