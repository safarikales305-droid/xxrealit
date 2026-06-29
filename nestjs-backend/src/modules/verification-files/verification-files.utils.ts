export const VERIFICATION_FILE_MAX_BYTES = 1024 * 1024;

export const VERIFICATION_FILE_ALLOWED_EXTENSIONS = new Set(['.txt', '.html']);

/** Soubory, které nesmí být přepsány ověřovacím uploadem. */
export const RESERVED_VERIFICATION_FILENAMES = new Set([
  'robots.txt',
  'index.html',
  'manifest.html',
  'sitemap.html',
  'favicon.html',
  'sw.html',
  'sw.txt',
]);

const FILENAME_PATTERN = /^[a-zA-Z0-9._-]+\.(txt|html)$/;

export function normalizeVerificationFilename(raw: string): string {
  const trimmed = raw.trim().replace(/\\/g, '/');
  const base = trimmed.includes('/') ? trimmed.split('/').pop()! : trimmed;
  return base;
}

export function validateVerificationFilename(filename: string): {
  ok: boolean;
  error?: string;
  normalized?: string;
} {
  const normalized = normalizeVerificationFilename(filename);

  if (!normalized) {
    return { ok: false, error: 'Název souboru je prázdný.' };
  }
  if (normalized !== filename.trim() || /[\\/]/.test(filename) || filename.includes('..')) {
    return { ok: false, error: 'Název souboru nesmí obsahovat cesty ani ..' };
  }
  if (/\s/.test(normalized)) {
    return { ok: false, error: 'Název souboru nesmí obsahovat mezery.' };
  }
  if (!FILENAME_PATTERN.test(normalized)) {
    return {
      ok: false,
      error: 'Povoleny jsou pouze soubory .txt nebo .html s názvem z písmen, číslic, pomlčky, podtržítka a tečky.',
    };
  }
  if (normalized.length > 200) {
    return { ok: false, error: 'Název souboru je příliš dlouhý.' };
  }
  if (RESERVED_VERIFICATION_FILENAMES.has(normalized.toLowerCase())) {
    return { ok: false, error: 'Tento název souboru je rezervovaný systémem.' };
  }

  const ext = normalized.slice(normalized.lastIndexOf('.')).toLowerCase();
  if (!VERIFICATION_FILE_ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, error: 'Povolené přípony: .txt, .html' };
  }

  return { ok: true, normalized };
}

export function mimeTypeForVerificationFilename(filename: string): string {
  return filename.toLowerCase().endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
}

export function isPublicVerificationFilePath(pathname: string): string | null {
  const match = pathname.match(/^\/([a-zA-Z0-9._-]+\.(?:txt|html))$/);
  const filename = match?.[1] ?? null;
  if (!filename) return null;
  if (RESERVED_VERIFICATION_FILENAMES.has(filename.toLowerCase())) return null;
  return filename;
}
