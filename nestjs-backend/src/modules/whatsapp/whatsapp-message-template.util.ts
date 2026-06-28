import { UserRole } from '@prisma/client';

const ROLE_LABELS: Record<string, string> = {
  USER: 'uživatel',
  AGENT: 'makléř',
  COMPANY: 'firma',
  AGENCY: 'realitní kancelář',
  INVESTOR: 'investor',
  FINANCIAL_ADVISOR: 'finanční poradce',
  DEVELOPER: 'developer',
  PRIVATE_SELLER: 'soukromý prodejce',
  CRAFTSMAN: 'řemeslník',
  TIPSTER: 'tipař',
  ADMIN: 'administrátor',
};

export type WhatsAppTemplateVars = {
  jmeno?: string;
  role?: string;
  odkaz?: string;
  kredit?: string | number;
};

export function roleLabel(role: UserRole | string): string {
  return ROLE_LABELS[role] ?? String(role);
}

export function renderWhatsAppTemplate(
  template: string,
  vars: WhatsAppTemplateVars,
): string {
  const map: Record<string, string> = {
    jmeno: vars.jmeno?.trim() || 'uživateli',
    role: vars.role?.trim() || '',
    odkaz: vars.odkaz?.trim() || 'https://xxrealit.cz',
    kredit:
      vars.kredit != null && String(vars.kredit).trim() !== ''
        ? String(vars.kredit)
        : '0',
  };

  return template.replace(/\{(\w+)\}/g, (_, key: string) => map[key] ?? `{${key}}`);
}

export function portalBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.FRONTEND_URL?.trim() ||
    'https://xxrealit.cz';
  return raw.replace(/\/+$/, '');
}
