import { BadRequestException } from '@nestjs/common';
import { portalBaseUrl } from './whatsapp-message-template.util';

export type WhatsAppTemplateHeaderType = 'IMAGE' | 'TEXT' | 'NONE';

export const WHATSAPP_HEADER_IMAGE_REQUIRED_MSG =
  'Tato WhatsApp šablona vyžaduje obrázek v hlavičce. Nahrajte obrázek kampaně nebo vložte veřejnou HTTPS URL.';

/** Převede relativní /uploads/… nebo http na veřejnou HTTPS URL pro Meta. */
export function resolvePublicHttpsImageUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new BadRequestException(WHATSAPP_HEADER_IMAGE_REQUIRED_MSG);
  }

  let absolute = trimmed;
  if (trimmed.startsWith('/')) {
    const base = (
      process.env.PUBLIC_API_URL?.trim() ||
      process.env.API_PUBLIC_URL?.trim() ||
      process.env.NEXT_PUBLIC_API_URL?.trim() ||
      portalBaseUrl()
    )
      .replace(/\/+$/, '')
      .replace(/\/api$/i, '');
    const origin = base.startsWith('http') ? base : `https://${base}`;
    absolute = `${origin.replace(/\/+$/, '')}${trimmed}`;
  } else if (/^http:\/\//i.test(trimmed)) {
    absolute = trimmed.replace(/^http:/i, 'https:');
  }

  let parsed: URL;
  try {
    parsed = new URL(absolute);
  } catch {
    throw new BadRequestException('Neplatná URL obrázku kampaně.');
  }

  if (parsed.protocol !== 'https:') {
    throw new BadRequestException('Obrázek kampaně musí být veřejně dostupný přes HTTPS.');
  }

  return parsed.toString();
}

export function hasCampaignHeaderImageSource(input: {
  headerImageUrl?: string | null;
  headerImageMediaId?: string | null;
}): boolean {
  return Boolean(input.headerImageUrl?.trim() || input.headerImageMediaId?.trim());
}
