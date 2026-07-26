/** Maskuje API klíč pro bezpečné zobrazení v administraci. */
export function maskApiKey(apiKey: string | null | undefined): string | null {
  if (!apiKey?.trim()) return null;
  const key = apiKey.trim();
  if (key.length <= 8) return 'sk-...';
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

/** Odstraní potenciální API klíče z textu před logováním. */
export function redactSecrets(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{10,}/g, 'sk-[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
}
