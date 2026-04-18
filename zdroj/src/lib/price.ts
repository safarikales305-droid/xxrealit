function parseDisplayPrice(price: unknown): number | null {
  if (price === null || price === undefined) return null;
  if (typeof price === 'bigint') {
    const n = Number(price);
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
  }
  if (typeof price === 'number') {
    if (!Number.isFinite(price) || price < 0) return null;
    return Math.trunc(price);
  }
  if (typeof price === 'string') {
    const s = price.trim();
    if (!s) return null;
    const low = s.toLowerCase();
    if (
      /na\s*dotaz|cena\s+na\s*dotaz|dohodou|price\s+on\s+request|on\s+request/i.test(low) &&
      !/\d{4,}/.test(s.replace(/[\s.\u00a0\u202f]/g, ''))
    ) {
      return null;
    }
    if (/^\d{1,3}(\.\d{3})+(\,\d+)?$/.test(s.replace(/[\s\u00a0\u202f]/g, ''))) {
      const compact = s.replace(/[\s\u00a0\u202f]/g, '').replace(/\./g, '').replace(',', '.');
      const n = Number(compact);
      return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
    }
    const digits = s
      .replace(/Kč/gi, '')
      .replace(/CZK/gi, '')
      .replace(/[^\d]/g, '');
    if (!digits) return null;
    const n = Number(digits);
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
  }
  const n = Number(price);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

/** Jednotná normalizace ceny z API (číslo / řetězec). */
export function normalizePrice(value: unknown): number | null {
  return parseDisplayPrice(value);
}

/**
 * Formát ceny pro UI: null/„na dotaz“ → text, 0 → „0 Kč“, kladná čísla s mezerami.
 */
export function formatListingPrice(price: number | string | null | undefined): string {
  const n = parseDisplayPrice(price);
  if (n === null) return 'Cena na dotaz';
  if (n === 0) return '0 Kč';
  return `${new Intl.NumberFormat('cs-CZ').format(n)} Kč`;
}
