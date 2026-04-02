import { API_BASE_URL } from './api';

export function getPublicApiBaseUrl(): string {
  if (!API_BASE_URL) {
    throw new Error('Missing NEXT_PUBLIC_API_URL');
  }
  return API_BASE_URL;
}

export function toPublicApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${getPublicApiBaseUrl()}${cleanPath}`;
}
