const PREFERRED_PREFIXES = ['info@', 'kontakt@', 'office@', 'obchod@', 'recepce@'];

export function extractEmails(html: string): string[] {
  const matches = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  return [...new Set(matches.map((e) => e.toLowerCase()))].filter(
    (e) => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.includes('example.com'),
  );
}

export function scoreEmail(email: string, website: string): number {
  const lower = email.toLowerCase();
  let score = 0.6;
  if (PREFERRED_PREFIXES.some((p) => lower.startsWith(p))) score = 0.95;
  else if (lower.startsWith('mail@')) score = 0.85;
  else if (/^[a-z]+\.[a-z]+@/.test(lower)) score = 0.45;

  try {
    const domain = new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace(
      /^www\./,
      '',
    );
    const emailDomain = lower.split('@')[1];
    if (emailDomain && (emailDomain === domain || emailDomain.endsWith(`.${domain}`))) {
      score = Math.min(1, score + 0.05);
    } else {
      score = Math.max(0.3, score - 0.2);
    }
  } catch {
    /* ignore */
  }
  return score;
}

export function extractPhone(html: string): string | undefined {
  const match = html.match(/(?:\+420\s?)?(?:\d{3}\s?){3}/);
  return match?.[0]?.trim();
}

export function isTerminalDiscoveryState(state: string): boolean {
  return ['FOUND', 'REVIEW_REQUIRED', 'VERIFIED', 'NOT_FOUND', 'FAILED'].includes(state);
}
