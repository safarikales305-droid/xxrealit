/** Normalizuje stav šablony z Meta / WhatsApp Manageru. */
export function normalizeTemplateStatus(raw?: string | null): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return 'UNKNOWN';

  const upper = trimmed.toUpperCase().replace(/\s+/g, '_');
  if (upper === 'APPROVED') return 'APPROVED';
  if (upper === 'ACTIVE') return 'ACTIVE';

  const ascii = trimmed
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

  if (ascii.includes('aktivni')) return 'ACTIVE';

  return upper;
}

export function isUsableTemplateStatus(normalizedStatus: string): boolean {
  const n = normalizedStatus.trim().toUpperCase();
  return n === 'APPROVED' || n === 'ACTIVE';
}
