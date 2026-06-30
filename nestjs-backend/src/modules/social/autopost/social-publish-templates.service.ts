import { Injectable } from '@nestjs/common';
import type { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

export type SocialPublishTemplateRole =
  | 'AGENT'
  | 'COMPANY'
  | 'AGENCY'
  | 'FINANCIAL_ADVISOR'
  | 'INVESTOR'
  | 'PRIVATE_SELLER';

export type SocialPublishTemplatesSettings = Record<SocialPublishTemplateRole, string>;

export const SOCIAL_PUBLISH_TEMPLATE_ROLE_LABELS: Record<SocialPublishTemplateRole, string> = {
  AGENT: 'Makléř',
  COMPANY: 'Stavební firma',
  AGENCY: 'Realitní kancelář',
  FINANCIAL_ADVISOR: 'Finanční poradce',
  INVESTOR: 'Investor',
  PRIVATE_SELLER: 'Soukromý prodejce',
};

const SETTINGS_KEY = 'social_publish_templates';

export const DEFAULT_SOCIAL_PUBLISH_TEMPLATES: SocialPublishTemplatesSettings = {
  AGENT:
    '💡 Tip od makléře\n\n{listingTitle}\n📍 {city}\n\n{postText}\n\n👉 {portalUrl}\n\n#xxrealit #reality #nemovitosti',
  COMPANY:
    '🔨 Tip na stavbu\n\n{listingTitle}\n📍 {city}\n\n{postText}\n\n👉 {portalUrl}\n\n#xxrealit #stavba #nemovitosti',
  INVESTOR:
    '💰 Investiční příležitost\n\n{listingTitle}\n📍 {city}\n\n{postText}\n\n👉 {portalUrl}\n\n#xxrealit #investice #reality',
  FINANCIAL_ADVISOR:
    '🏦 Financování nemovitosti\n\n{listingTitle}\n📍 {city}\n\n{postText}\n\n👉 {portalUrl}\n\n#xxrealit #financovani #reality',
  AGENCY:
    '🏢 Nabídka realitní kanceláře\n\n{listingTitle}\n📍 {city}\n\n{postText}\n\n👉 {portalUrl}\n\n#xxrealit #reality #nemovitosti',
  PRIVATE_SELLER:
    '🏠 Přímý prodej od majitele\n\n{listingTitle}\n📍 {city}\n\n{postText}\n\n👉 {portalUrl}\n\n#xxrealit #reality #prodej',
};

export type SocialPublishTemplateVariables = {
  authorName?: string;
  authorRole?: string;
  listingTitle?: string;
  city?: string;
  portalUrl?: string;
  postText?: string;
};

export function applySocialPublishTemplate(
  template: string,
  vars: SocialPublishTemplateVariables,
): string {
  const map: Record<string, string> = {
    authorName: vars.authorName?.trim() || '',
    authorRole: vars.authorRole?.trim() || '',
    listingTitle: vars.listingTitle?.trim() || '',
    city: vars.city?.trim() || '',
    portalUrl: vars.portalUrl?.trim() || '',
    postText: vars.postText?.trim() || '',
  };
  let out = template;
  for (const [key, value] of Object.entries(map)) {
    out = out.replaceAll(`{${key}}`, value);
  }
  return out
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

export function mapUserRoleToTemplateRole(role: UserRole | string | null | undefined): SocialPublishTemplateRole {
  const r = String(role ?? '').toUpperCase();
  if (r === 'COMPANY' || r === 'DEVELOPER' || r === 'CRAFTSMAN') return 'COMPANY';
  if (r === 'AGENCY') return 'AGENCY';
  if (r === 'FINANCIAL_ADVISOR') return 'FINANCIAL_ADVISOR';
  if (r === 'INVESTOR') return 'INVESTOR';
  if (r === 'PRIVATE_SELLER') return 'PRIVATE_SELLER';
  return 'AGENT';
}

@Injectable()
export class SocialPublishTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  private str(v: unknown, fallback: string): string {
    return typeof v === 'string' && v.trim() ? v.trim() : fallback;
  }

  normalize(raw: unknown): SocialPublishTemplatesSettings {
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const d = DEFAULT_SOCIAL_PUBLISH_TEMPLATES;
    return {
      AGENT: this.str(o.AGENT, d.AGENT),
      COMPANY: this.str(o.COMPANY, d.COMPANY),
      AGENCY: this.str(o.AGENCY, d.AGENCY),
      FINANCIAL_ADVISOR: this.str(o.FINANCIAL_ADVISOR, d.FINANCIAL_ADVISOR),
      INVESTOR: this.str(o.INVESTOR, d.INVESTOR),
      PRIVATE_SELLER: this.str(o.PRIVATE_SELLER, d.PRIVATE_SELLER),
    };
  }

  async getSettings(): Promise<SocialPublishTemplatesSettings> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
    if (!row) return { ...DEFAULT_SOCIAL_PUBLISH_TEMPLATES };
    return this.normalize(row.valueJson);
  }

  async updateSettings(
    patch: Partial<SocialPublishTemplatesSettings>,
  ): Promise<SocialPublishTemplatesSettings> {
    const current = await this.getSettings();
    const next = this.normalize({ ...current, ...patch });
    await this.prisma.appSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, valueJson: next as unknown as Prisma.InputJsonValue },
      update: { valueJson: next as unknown as Prisma.InputJsonValue },
    });
    return next;
  }

  async buildPropertyFacebookMessage(input: {
    role: UserRole | string | null | undefined;
    authorName?: string | null;
    title?: string | null;
    city?: string | null;
    address?: string | null;
    description?: string | null;
    portalUrl: string;
    hidePublicPrice?: boolean;
  }): Promise<string> {
    const templates = await this.getSettings();
    const roleKey = mapUserRoleToTemplateRole(input.role);
    const template = templates[roleKey] ?? DEFAULT_SOCIAL_PUBLISH_TEMPLATES.AGENT;
    const city =
      [input.address?.trim(), input.city?.trim()].filter(Boolean).join(', ') || 'Neuvedeno';
    const postText = (input.description?.trim() || '').slice(0, 500);
    let message = applySocialPublishTemplate(template, {
      authorName: input.authorName ?? '',
      authorRole: SOCIAL_PUBLISH_TEMPLATE_ROLE_LABELS[roleKey],
      listingTitle: input.title?.trim() || 'Inzerát',
      city,
      portalUrl: input.portalUrl,
      postText,
    });
    if (input.hidePublicPrice !== false && !message.includes('Cena')) {
      message = `${message}\n\n💰 Cena je dostupná po přihlášení na portálu XXREALIT.`;
    }
    return message;
  }
}
