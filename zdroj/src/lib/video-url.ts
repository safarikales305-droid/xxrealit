/**
 * Normalizes video URLs for `<video src>` so files under `public/videos/` resolve
 * correctly and legacy paths like `/video/...` map to `/videos/...`.
 */
export function normalizePublicVideoUrl(
  input: string | null | undefined,
): string | null {
  if (input == null) return null;
  let u = input.trim();
  if (!u) return null;

  u = u.replace(/^\.\/video\//i, '/videos/').replace(/^\/video\//i, '/videos/');

  if (/^https?:\/\//i.test(u) || u.startsWith('//')) {
    return u;
  }

  if (!u.startsWith('/')) {
    u = `/videos/${u.replace(/^\.?\/?videos\/?/i, '')}`;
  }

  return u;
}
