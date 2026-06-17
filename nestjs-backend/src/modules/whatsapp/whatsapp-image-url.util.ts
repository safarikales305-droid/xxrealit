import { BadRequestException } from '@nestjs/common';
import { portalBaseUrl } from './whatsapp-message-template.util';

export const WHATSAPP_HEADER_IMAGE_HELP =
  'Obrázek ve schválené Meta šabloně je pouze ukázka. Pro každou kampaň nahrajte obrázek nebo použijte media_id.';

export const WHATSAPP_HEADER_IMAGE_REQUIRED_MSG =
  'Tato šablona má HEADER IMAGE — nahrajte obrázek kampaně nebo zadejte Meta media_id.';

export const WHATSAPP_IMAGE_NOT_PUBLIC_MSG =
  'Obrázek kampaně není veřejně dostupný přes HTTPS.';

const ALLOWED_IMAGE_CONTENT_TYPES = new Set(['image/jpeg', 'image/png']);

function publicApiOrigin(): string {
  const raw = (
    process.env.PUBLIC_API_URL?.trim() ||
    process.env.API_PUBLIC_URL?.trim() ||
    process.env.RAILWAY_PUBLIC_DOMAIN?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    portalBaseUrl()
  )
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '');

  if (!raw) return portalBaseUrl();
  return raw.startsWith('http') ? raw : `https://${raw}`;
}

/** Převede relativní /uploads/… nebo http na veřejnou HTTPS URL pro Meta. */
export function resolvePublicHttpsImageUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new BadRequestException(WHATSAPP_HEADER_IMAGE_REQUIRED_MSG);
  }

  let absolute = trimmed;
  if (trimmed.startsWith('/')) {
    absolute = `${publicApiOrigin().replace(/\/+$/, '')}${trimmed}`;
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

/** Ověří, že obrázek je veřejně dostupný (HTTPS, HTTP 200, image/jpeg|png). */
export async function verifyPublicCampaignImageUrl(raw: string): Promise<string> {
  const url = resolvePublicHttpsImageUrl(raw);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    });

    if (response.status === 405 || response.status === 501 || response.status === 404) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { Range: 'bytes=0-1023' },
      });
    }

    if (response.status !== 200) {
      throw new BadRequestException(WHATSAPP_IMAGE_NOT_PUBLIC_MSG);
    }

    const contentType = (response.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase();

    if (!ALLOWED_IMAGE_CONTENT_TYPES.has(contentType)) {
      throw new BadRequestException(
        `Obrázek kampaně musí mít Content-Type image/jpeg nebo image/png (aktuálně: ${contentType || 'neznámý'}).`,
      );
    }

    return url;
  } catch (error: unknown) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException(WHATSAPP_IMAGE_NOT_PUBLIC_MSG);
  } finally {
    clearTimeout(timeout);
  }
}
