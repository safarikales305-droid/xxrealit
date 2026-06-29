import { CANONICAL_WWW_ORIGIN } from '@/lib/site-origin';

export const VERIFICATION_FILE_MAX_BYTES = 1024 * 1024;

const FILENAME_PATTERN = /^[a-zA-Z0-9._-]+\.(txt|html)$/;

const RESERVED_PUBLIC_PATHS = new Set(['robots.txt', 'index.html']);

export function isPublicVerificationFilePath(pathname: string): string | null {
  const match = pathname.match(/^\/([a-zA-Z0-9._-]+\.(?:txt|html))$/);
  const filename = match?.[1] ?? null;
  if (!filename) return null;
  if (RESERVED_PUBLIC_PATHS.has(filename.toLowerCase())) return null;
  return filename;
}

export function validateVerificationFilenameClient(filename: string): string | null {
  const trimmed = filename.trim();
  if (!trimmed || /[\\/]/.test(trimmed) || trimmed.includes('..')) {
    return 'Neplatný název souboru.';
  }
  if (/\s/.test(trimmed)) {
    return 'Název souboru nesmí obsahovat mezery.';
  }
  if (!FILENAME_PATTERN.test(trimmed)) {
    return 'Povoleny jsou pouze .txt nebo .html s bezpečným názvem.';
  }
  return null;
}

export function publicVerificationFileUrl(filename: string, origin?: string): string {
  const base = (origin ?? (typeof window !== 'undefined' ? window.location.origin : CANONICAL_WWW_ORIGIN)).replace(
    /\/+$/,
    '',
  );
  return `${base}/${encodeURIComponent(filename).replace(/%2F/g, '/')}`;
}

export type VerificationFileRow = {
  id: string;
  filename: string;
  mimeType: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  uploadedBy: { id: string; name: string; email: string };
};
