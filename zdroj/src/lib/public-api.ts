function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function getPublicApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim() || '';
  if (!raw) {
    throw new Error('Missing NEXT_PUBLIC_API_URL');
  }
  const normalized = trimTrailingSlash(raw);
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
}

export function toPublicApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${getPublicApiBaseUrl()}${cleanPath}`;
}
