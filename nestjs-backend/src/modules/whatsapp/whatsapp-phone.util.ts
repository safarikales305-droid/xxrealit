const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export function isValidWhatsAppPhone(phone: string): boolean {
  return E164_REGEX.test(phone.trim());
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
