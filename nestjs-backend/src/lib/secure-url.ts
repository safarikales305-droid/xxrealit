/**
 * Převod http→https v odpovědích API (data z DB / Cloudinary často mají http://).
 * V produkci na HTTPS webu by jinak vznikl mixed content.
 */
export function upgradeHttpToHttpsForApi(
  url: string | null | undefined,
): string | null {
  if (url == null) return null;
  const t = String(url).trim();
  if (!t) return null;
  if (!/^http:\/\//i.test(t)) return t;
  if (process.env.NODE_ENV !== 'production') {
    return t;
  }
  try {
    const u = new URL(t);
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') {
      return t;
    }
  } catch {
    return t;
  }
  return `https://${t.slice(7)}`;
}
