import type { MetaMessagesRequestBody } from './whatsapp-cloud-api.service';

export type WhatsAppTemplateSendConfig = {
  templateName: string;
  languageCode: string;
  bodyParameters?: string[];
};

export const WHATSAPP_MARKETING_TEMPLATE_REQUIRED_MSG =
  'WhatsApp nepovoluje první marketingovou zprávu jako vlastní text. Vyberte schválenou šablonu zprávy.';

/** Normalizuje jazyk šablony — výchozí cs, podpora cs_CZ a en_US. */
export function normalizeTemplateLanguageCode(raw?: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return 'cs';
  const lower = trimmed.toLowerCase().replace(/-/g, '_');
  if (lower === 'cs' || lower === 'cz') return 'cs';
  if (lower === 'cs_cz') return 'cs_CZ';
  if (lower === 'en' || lower === 'en_us') return 'en_US';
  return trimmed;
}

export function buildTemplateMessageRequest(
  toDigits: string,
  config: WhatsAppTemplateSendConfig,
): MetaMessagesRequestBody {
  const templateName = config.templateName.trim();
  const languageCode = normalizeTemplateLanguageCode(config.languageCode);

  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: languageCode },
  };

  const bodyParameters = (config.bodyParameters ?? [])
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);

  if (bodyParameters.length > 0) {
    template.components = [
      {
        type: 'body',
        parameters: bodyParameters.map((text) => ({
          type: 'text',
          text: text.slice(0, 1024),
        })),
      },
    ];
  }

  return {
    messaging_product: 'whatsapp',
    to: toDigits,
    type: 'template',
    template,
  };
}

export function formatTemplateLogLabel(
  templateName: string,
  languageCode: string,
  bodyParameters: string[],
): string {
  const vars =
    bodyParameters.length > 0
      ? ` vars=[${bodyParameters.map((v) => JSON.stringify(v)).join(', ')}]`
      : '';
  return `template:${templateName}@${normalizeTemplateLanguageCode(languageCode)}${vars}`;
}
