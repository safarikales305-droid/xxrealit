/** Odstraní mezery; ponechá úvodní +420 apod. */
export function normalizeTiparPhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const hasPlus = trimmed.startsWith('+');
  const cleaned = trimmed.replace(/[^\d+]/g, '');
  if (hasPlus) {
    return `+${cleaned.replace(/\+/g, '')}`.slice(0, 40);
  }
  return cleaned.replace(/\+/g, '').slice(0, 40);
}

export function isValidTiparPhone(raw: string): boolean {
  const phone = normalizeTiparPhone(raw);
  return phone.replace(/\D/g, '').length >= 9;
}
