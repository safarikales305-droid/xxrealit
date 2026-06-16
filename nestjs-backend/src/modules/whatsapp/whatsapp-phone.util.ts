const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export function isValidWhatsAppPhone(phone: string): boolean {
  return E164_REGEX.test(phone.trim());
}

/** Normalizuje české i mezinárodní číslo na E.164 (+420…). */
export function normalizeToE164(raw: string, defaultCountryCode = '420'): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('+')) {
    return isValidWhatsAppPhone(trimmed) ? trimmed : null;
  }

  const digits = whatsAppDigits(trimmed);
  if (!digits) return null;

  // 9 číslic bez předvolby → CZ mobil
  if (digits.length === 9) {
    const e164 = `+${defaultCountryCode}${digits}`;
    return isValidWhatsAppPhone(e164) ? e164 : null;
  }

  const e164 = `+${digits}`;
  return isValidWhatsAppPhone(e164) ? e164 : null;
}

/** wa.me vyžaduje číslo bez + a mezer. */
export function whatsAppDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function buildWaMeUrl(phone: string, text: string): string {
  const digits = whatsAppDigits(phone);
  const params = new URLSearchParams({ text });
  return `https://wa.me/${digits}?${params.toString()}`;
}
