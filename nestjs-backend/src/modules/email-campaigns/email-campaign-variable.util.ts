import { ConfigService } from '@nestjs/config';
import { resolveFrontendUrl } from '../../common/resolve-frontend-url';

export type CampaignRecipientVars = {
  fullName?: string | null;
  firstName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  role?: string | null;
  registrationLink?: string | null;
  unsubscribeLink?: string | null;
  senderName?: string | null;
};

export function splitFirstName(fullName: string): string {
  const t = fullName.trim();
  if (!t) return '';
  return t.split(/\s+/)[0] ?? t;
}

export function renderCampaignContent(
  template: string,
  vars: CampaignRecipientVars,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const value = vars[key as keyof CampaignRecipientVars];
    return value == null ? '' : String(value);
  });
}

export function buildRecipientVariables(
  input: CampaignRecipientVars,
  config: ConfigService,
  campaignId: string,
  recipientId: string,
): CampaignRecipientVars {
  const baseUrl = resolveFrontendUrl(config);
  const email = (input.email ?? '').trim().toLowerCase();
  const fullName = (input.fullName ?? '').trim() || 'kolego';
  const firstName = (input.firstName ?? '').trim() || splitFirstName(fullName) || 'kolego';
  return {
    fullName,
    firstName,
    email,
    phone: (input.phone ?? '').trim(),
    company: (input.company ?? '').trim(),
    role: (input.role ?? '').trim(),
    registrationLink: `${baseUrl}/registrace?ref=campaign&campaign=${encodeURIComponent(campaignId)}&recipient=${encodeURIComponent(recipientId)}`,
    unsubscribeLink: `${baseUrl}/odhlasit-marketing?email=${encodeURIComponent(email)}&campaign=${encodeURIComponent(campaignId)}`,
    senderName: (input.senderName ?? 'Tým XXrealit').trim(),
  };
}
