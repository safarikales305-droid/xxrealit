/**
 * Vytáhne skalární cenu z Reality/JSON struktur (`{ value, currency }`, pole, …).
 */
export function unwrapImportedPriceValue(raw: unknown): string | number | null {
  if (raw == null) return null;
  if (typeof raw === 'number' || typeof raw === 'string') return raw;
  if (typeof raw === 'bigint') return Number(raw);
  if (Array.isArray(raw)) {
    for (const el of raw) {
      const u = unwrapImportedPriceValue(el);
      if (u != null) return u;
    }
    return null;
  }
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const keys = [
      'value',
      'amount',
      'price',
      'priceCzk',
      'totalPrice',
      'salePrice',
      'advertisedPrice',
      'listingPrice',
      'gross',
      'net',
      'text',
      'raw',
      'number',
    ];
    for (const k of keys) {
      if (!(k in o) || o[k] === undefined) continue;
      const u = unwrapImportedPriceValue(o[k]);
      if (u != null) return u;
    }
  }
  return null;
}

/**
 * Parsuje cenu z textu (scraper / SOAP) — bez fallbacku 1 Kč.
 */
export function safeParsePrice(value: string | null | undefined): number | null {
  if (value == null) return null;
  let s = String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\u202f/g, ' ')
    .trim();
  if (!s) return null;
  const low = s.toLowerCase();
  if (
    /\b(na\s*dotaz|cena\s+na\s*dotaz|dotazem|price\s+on\s+request|on\s+request|dohodou|p\.?\s*o\.?\s*r\.?)\b/i.test(
      low,
    ) &&
    !/\d[\d\s.\u00a0\u202f]{3,}/.test(s)
  ) {
    return null;
  }
  const cleaned = s
    .replace(/Kč/gi, '')
    .replace(/CZK/gi, '')
    .replace(/\s+/g, '')
    .replace(/[^\d]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) && num > 0 ? num : null;
}
