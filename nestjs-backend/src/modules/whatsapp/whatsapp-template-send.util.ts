import { BadRequestException } from '@nestjs/common';
import type { MetaMessagesRequestBody } from './whatsapp-cloud-api.service';

export type WhatsAppTemplateSendConfig = {
  templateName: string;
  languageCode: string;
  bodyParameters?: string[];
  /** Počet proměnných šablony z Meta — při 0 se neposílají components ani parameters. */
  variablesCount: number;
};

export class WhatsAppTemplatePayloadError extends BadRequestException {
  constructor(message: string) {
    super(message);
  }
}

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

/** Ověří, že payload pro šablonu bez proměnných neobsahuje parametry ani components. */
export function assertZeroVariableTemplatePayload(
  requestBody: MetaMessagesRequestBody,
  variablesCount: number,
): void {
  if (variablesCount > 0) return;

  const topForbidden = ['components', 'parameters', 'body', 'text', 'message', 'previewMessage'];
  for (const key of topForbidden) {
    if (key in requestBody && requestBody[key] != null) {
      throw new WhatsAppTemplatePayloadError(
        `Šablona bez proměnných: Meta payload nesmí obsahovat pole „${key}“.`,
      );
    }
  }

  const template = requestBody.template;
  if (!template || typeof template !== 'object') {
    throw new WhatsAppTemplatePayloadError('Meta payload musí obsahovat objekt template.');
  }

  const templateObj = template as Record<string, unknown>;
  const templateForbidden = ['components', 'parameters', 'body', 'text'];
  for (const key of templateForbidden) {
    if (key in templateObj && templateObj[key] != null) {
      throw new WhatsAppTemplatePayloadError(
        `Šablona bez proměnných: template nesmí obsahovat „${key}“. Aktuální payload: ${JSON.stringify(requestBody)}`,
      );
    }
  }

  const components = templateObj.components;
  if (Array.isArray(components) && components.length > 0) {
    throw new WhatsAppTemplatePayloadError(
      `Šablona bez proměnných: template.components musí být prázdné nebo chybět. Aktuální payload: ${JSON.stringify(requestBody)}`,
    );
  }
}

export function buildTemplateMessageRequest(
  toDigits: string,
  config: WhatsAppTemplateSendConfig,
): MetaMessagesRequestBody {
  const templateName = config.templateName.trim();
  const languageCode = metaTemplateLanguageCode(config.languageCode);
  const to = toDigits.replace(/\D/g, '');

  if (config.variablesCount <= 0) {
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
      },
    };
  }

  const bodyParameters = (config.bodyParameters ?? [])
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);

  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: languageCode },
  };

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

  const requestBody: MetaMessagesRequestBody = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template,
  };

  return requestBody;
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
