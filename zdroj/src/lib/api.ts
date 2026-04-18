import { upgradeHttpToHttps } from './public-urls';

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function withApiPrefix(url: string): string {
  const normalized = trimTrailingSlash(url);
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
}

const rawPublicApiInput =
  typeof process.env.NEXT_PUBLIC_API_URL === 'string'
    ? process.env.NEXT_PUBLIC_API_URL.trim()
    : '';
const rawServerApiInput =
  typeof process.env.API_URL === 'string'
    ? process.env.API_URL.trim()
    : '';
const rawPublicApi = rawPublicApiInput
  ? upgradeHttpToHttps(trimTrailingSlash(rawPublicApiInput))
  : '';
const rawServerApi = rawServerApiInput
  ? upgradeHttpToHttps(trimTrailingSlash(rawServerApiInput))
  : '';

/** Poslední záchrana: stejný origin + `/api` (jen když není nastavené žádné API URL v env). */
function getRuntimeSameOriginApiBase(): string {
  if (typeof window === 'undefined') return '';
  try {
    const origin = trimTrailingSlash(window.location.origin || '');
    return origin ? `${origin}/api` : '';
  } catch {
    return '';
  }
}

/**
 * Jednotná Nest API base (prefix `/api` odpovídá `app.setGlobalPrefix('api')` v backendu).
 * Priorita: NEXT_PUBLIC_API_URL → API_URL (SSR) → same-origin `/api` jen bez env.
 * Nevynucujeme same-origin na produkci — Next na www často nemá Nest pod `/api` (404).
 */
function resolveApiBaseUrl(): string {
  if (rawPublicApi) return withApiPrefix(rawPublicApi);
  if (rawServerApi) return withApiPrefix(rawServerApi);
  return getRuntimeSameOriginApiBase();
}

/**
 * Public Nest API base. In production, only `NEXT_PUBLIC_API_URL` (no localhost).
 */
export const API_BASE_URL = resolveApiBaseUrl();

if (
  typeof window !== 'undefined' &&
  process.env.NEXT_PUBLIC_DEBUG_API === '1' &&
  API_BASE_URL
) {
  // eslint-disable-next-line no-console
  console.info('[API] resolved API_BASE_URL =', API_BASE_URL, {
    NEXT_PUBLIC_API_URL: rawPublicApiInput || '(unset)',
    API_URL: rawServerApiInput || '(unset)',
  });
}

/** POST /properties on Nest; empty string if API is not configured (guard in forms). */
export const propertiesEndpoint = API_BASE_URL
  ? `${API_BASE_URL}/properties`
  : '';

/** Server-side API base for RSC. */
export function getServerSideApiBaseUrl(): string | null {
  if (rawPublicApi) return withApiPrefix(rawPublicApi);
  if (rawServerApi) return withApiPrefix(rawServerApi);
  return null;
}

/** Origin bez `/api` — pro statické soubory Nest (`/uploads/...`). */
export function getNestPublicOrigin(): string {
  if (!API_BASE_URL) return '';
  try {
    const u = new URL(API_BASE_URL);
    return trimTrailingSlash(u.origin);
  } catch {
    return '';
  }
}

function isHttpAssetUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Absolutní URL pro média inzerátu — toleruje čárky v query (CDN). */
export function nestAbsoluteAssetUrl(path: string): string {
  if (!path) return '';
  const t = path.trim();
  if (!t) return '';
  if (t.startsWith('http://') || t.startsWith('https://')) {
    const upgraded = upgradeHttpToHttps(t);
    return isHttpAssetUrl(upgraded) ? upgraded : '';
  }
  const origin = getNestPublicOrigin();
  if (!origin) return t;
  const joined = upgradeHttpToHttps(`${origin}${t.startsWith('/') ? t : `/${t}`}`);
  return isHttpAssetUrl(joined) ? joined : '';
}

export function getClientTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const raw = document.cookie || '';
  const parts = raw.split(';').map((x) => x.trim());
  const tokenEntry =
    parts.find((x) => x.startsWith('token=')) ??
    parts.find((x) => x.startsWith('access_token='));
  if (!tokenEntry) return null;
  const value = tokenEntry.split('=').slice(1).join('=').trim();
  return value.length > 0 ? decodeURIComponent(value) : null;
}

export async function apiFetch(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers ?? {});
  const bodyIsFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!headers.has('Content-Type') && !bodyIsFormData) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getClientTokenFromCookie();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, {
    ...options,
    headers,
  });
}


