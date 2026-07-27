const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function validateEmailAddress(value: string): { ok: true; email: string } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, error: 'E-mailová adresa je povinná.' };
  if (/\s/.test(trimmed)) return { ok: false, error: 'E-mail nesmí obsahovat mezery.' };
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:')) {
    return { ok: false, error: 'Zadejte platnou e-mailovou adresu, ne URL.' };
  }
  if (!EMAIL_RE.test(lower)) return { ok: false, error: 'Neplatný formát e-mailové adresy.' };
  return { ok: true, email: lower };
}

export function extractDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1) : '';
}
