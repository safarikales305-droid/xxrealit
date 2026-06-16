import type { MetaMessagesRequestBody } from './whatsapp-cloud-api.service';

export type WhatsAppTemplateSendConfig = {
  templateName: string;
  languageCode: string;
  bodyParameters?: string[];
  /** Když 0, do Meta se neposílají components ani parameters. */
  variablesCount?: number;
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

/** Jazyk šablony přesně jak vrací Meta (bez přemapování cs → cs_CZ). */
export function metaTemplateLanguageCode(raw?: string): string {
  const trimmed = (raw ?? '').trim();
  return trimmed || 'cs';
}

const DEFAULT_VARIABLE_SLOTS = ['{jmeno}', '{odkaz}', '{role}', '{kredit}'];

export function buildTemplateBodyParameters(
  variableTemplates: string[],
  variablesCount: number,
  renderValue: (template: string) => string,
): string[] {
  if (variablesCount <= 0) return [];

  const configured = variableTemplates.map((v) => v.trim()).filter(Boolean);
  const count = Math.max(variablesCount, configured.length);
  if (count <= 0) return [];

  const parameters: string[] = [];
  for (let i = 0; i < count; i++) {
    const slot = configured[i] || DEFAULT_VARIABLE_SLOTS[i] || `hodnota${i + 1}`;
    parameters.push(renderValue(slot));
  }
  return parameters;
}

export function buildTemplateMessageRequest(
  toDigits: string,
  config: WhatsAppTemplateSendConfig,
): MetaMessagesRequestBody {
  const templateName = config.templateName.trim();
  const languageCode = metaTemplateLanguageCode(config.languageCode);

  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: languageCode },
  };

  const variablesCount = config.variablesCount ?? (config.bodyParameters ?? []).length;
  const bodyParameters =
    variablesCount <= 0
      ? []
      : (config.bodyParameters ?? [])
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
  return `template:${templateName}@${metaTemplateLanguageCode(languageCode)}${vars}`;
}
