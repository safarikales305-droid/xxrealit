import { normalizeToE164, whatsAppDigits } from './whatsapp-phone.util';

/** Rozdělí vstup na tokeny oddělené čárkou, středníkem, mezerou nebo novým řádkem. */
export function splitManualPhoneTokens(text: string): string[] {
  return text
    .split(/[\n,;\s]+/)
    .map((part) => part.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

/** Normalizuje číslo na mezinárodní číslice bez + (např. 420602882100). */
export function normalizeCampaignPhoneDigits(
  raw: string,
  defaultCountryCode = '420',
): string | null {
  const e164 = normalizeToE164(raw, defaultCountryCode);
  if (!e164) return null;
  return whatsAppDigits(e164);
}

export function phoneDigitsToE164(digits: string): string | null {
  const trimmed = digits.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('+')) return normalizeToE164(trimmed);
  return normalizeToE164(trimmed);
}

export type ParsedManualPhonesResult = {
  phones: string[];
  invalid: string[];
};

/** Z pole řetězců (nebo vnořených tokenů) vrátí unikátní normalizovaná čísla. */
export function parseManualPhoneInputs(
  inputs: string[] | undefined | null,
  defaultCountryCode = '420',
): ParsedManualPhonesResult {
  const tokens = (inputs ?? []).flatMap((entry) => splitManualPhoneTokens(entry));
  const phones: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const digits = normalizeCampaignPhoneDigits(token, defaultCountryCode);
    if (!digits) {
      invalid.push(token);
      continue;
    }
    if (seen.has(digits)) continue;
    seen.add(digits);
    phones.push(digits);
  }

  return { phones, invalid };
}

export function formatInvalidManualPhonesMessage(invalid: string[]): string {
  return `Neplatná čísla: ${invalid.join(', ')}`;
}
