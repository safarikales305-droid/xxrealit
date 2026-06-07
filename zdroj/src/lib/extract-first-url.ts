const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/i;

/** První http(s) URL v textu (bez koncové interpunkce). */
export function extractFirstUrl(text: string): string | null {
  const m = text.match(URL_REGEX);
  if (!m?.[0]) return null;
  return m[0].replace(/[.,;:!?)]+$/u, '');
}

export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}
