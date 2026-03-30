/**
 * Normalizes role strings to canonical lowercase ASCII slugs:
 * - trim
 * - remove diacritics (NFD + strip combining marks)
 * - lowercase
 */
export function normalizeRole(raw: string): string {
  return raw
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

