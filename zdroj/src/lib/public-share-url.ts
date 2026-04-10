/** Absolutní URL pro sdílení (Facebook atd.). */
export function getShareOrigin(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '');
  return env ?? '';
}

export function absoluteShareUrl(path: string): string {
  const origin = getShareOrigin();
  const p = path.startsWith('/') ? path : `/${path}`;
  if (!origin) return p;
  return `${origin}${p}`;
}
