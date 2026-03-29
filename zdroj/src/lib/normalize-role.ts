/**
 * Normalizes role strings: trim, strip combining diacritics (NFD), lowercase.
 * So e.g. "Makléř" typed elsewhere or Czech variants still store as "makler" when matched to slugs.
 */
export function normalizeRole(raw: string): string {
  return raw
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
