/**
 * Parsuje cenu z textu (scraper / SOAP) — bez fallbacku 1 Kč.
 */
export function safeParsePrice(value: string | null | undefined): number | null {
  if (value == null) return null;
  const cleaned = String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, '')
    .replace(/Kč/gi, '')
    .replace(/CZK/gi, '')
    .replace(/[^\d]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) && num > 0 ? num : null;
}
