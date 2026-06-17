import { BadRequestException } from '@nestjs/common';
import type { MetaMessagesRequestBody } from './whatsapp-cloud-api.service';
import type { WhatsAppTemplateHeaderType } from './whatsapp-template-sync.util';

export type WhatsAppTemplateSendConfig = {
  templateName: string;
  languageCode: string;
  bodyParameters?: string[];
  /** Počet proměnných šablony z Meta — při 0 se neposílají body parameters. */
  variablesCount: number;
  headerType?: WhatsAppTemplateHeaderType;
  /** Veřejná HTTPS URL — fallback image.link, pokud není media_id. */
  headerImageUrl?: string;
  headerImageMediaId?: string;
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

function templateComponents(
  config: WhatsAppTemplateSendConfig,
): Array<Record<string, unknown>> {
  const components: Array<Record<string, unknown>> = [];

  if (config.headerType === 'IMAGE') {
    const mediaId = config.headerImageMediaId?.trim();
    const imageUrl = config.headerImageUrl?.trim();
    if (mediaId) {
      components.push({
        type: 'header',
        parameters: [{ type: 'image', image: { id: mediaId } }],
      });
    } else if (imageUrl) {
      components.push({
        type: 'header',
        parameters: [{ type: 'image', image: { link: imageUrl } }],
      });
    }
  }

  if (config.variablesCount > 0) {
    const bodyParameters = (config.bodyParameters ?? [])
      .map((v) => String(v).trim())
      .filter((v) => v.length > 0);
    if (bodyParameters.length > 0) {
      components.push({
        type: 'body',
        parameters: bodyParameters.map((text) => ({
          type: 'text',
          text: text.slice(0, 1024),
        })),
      });
    }
  }

  return components;
}

/** Ověří payload — šablona bez proměnných nesmí mít body components. */
export function assertTemplatePayload(
  requestBody: MetaMessagesRequestBody,
  config: Pick<WhatsAppTemplateSendConfig, 'variablesCount' | 'headerType'>,
): void {
  const topForbidden = [
    'parameters',
    'body',
    'text',
    'message',
    'previewMessage',
    'preview',
    'campaignMessage',
    'imageUrl',
    'headerType',
  ];
  for (const key of topForbidden) {
    if (key in requestBody && requestBody[key] != null) {
      throw new WhatsAppTemplatePayloadError(
        `Meta payload nesmí obsahovat pole „${key}“.`,
      );
    }
  }

  const template = requestBody.template;
  if (!template || typeof template !== 'object') {
    throw new WhatsAppTemplatePayloadError('Meta payload musí obsahovat objekt template.');
  }

  const templateObj = template as Record<string, unknown>;
  const templateForbidden = ['parameters', 'body', 'text'];
  for (const key of templateForbidden) {
    if (key in templateObj && templateObj[key] != null) {
      throw new WhatsAppTemplatePayloadError(`template nesmí obsahovat „${key}“.`);
    }
  }

  const components = Array.isArray(templateObj.components) ? templateObj.components : [];
  if (config.variablesCount <= 0) {
    for (const comp of components) {
      const type = String((comp as { type?: string }).type ?? '').toLowerCase();
      if (type === 'body') {
        throw new WhatsAppTemplatePayloadError(
          'Šablona bez proměnných: template nesmí obsahovat body components.',
        );
      }
    }
  }

  if (config.headerType === 'IMAGE') {
    assertImageHeaderInPayload(requestBody);
  }
}

/** Ověří, že Meta payload obsahuje header image v template.components. */
export function assertImageHeaderInPayload(
  requestBody: MetaMessagesRequestBody,
  expectedLink?: string,
): void {
  const template = requestBody.template as Record<string, unknown> | undefined;
  const components = Array.isArray(template?.components)
    ? (template.components as Array<Record<string, unknown>>)
    : [];
  const header = components.find((c) => String(c.type ?? '').toLowerCase() === 'header');
  if (!header) {
    throw new WhatsAppTemplatePayloadError(
      'Šablona s HEADER IMAGE musí obsahovat template.components[type=header].',
    );
  }

  const parameters = Array.isArray(header.parameters)
    ? (header.parameters as Array<Record<string, unknown>>)
    : [];
  const imageParam = parameters.find((p) => String(p.type ?? '').toLowerCase() === 'image');
  const image = imageParam?.image as { link?: string; id?: string } | undefined;
  const link = image?.link?.trim();
  const id = image?.id?.trim();

  if (!link && !id) {
    throw new WhatsAppTemplatePayloadError(
      'HEADER IMAGE musí mít image.link nebo image.id uvnitř template.components.',
    );
  }

  if (expectedLink && link && link !== expectedLink) {
    throw new WhatsAppTemplatePayloadError(
      `image.link v payloadu (${link}) neodpovídá ověřené URL (${expectedLink}).`,
    );
  }
}

export function extractHeaderImageLinkFromPayload(
  requestBody: MetaMessagesRequestBody,
): string | null {
  const template = requestBody.template as Record<string, unknown> | undefined;
  const components = Array.isArray(template?.components)
    ? (template.components as Array<Record<string, unknown>>)
    : [];
  const header = components.find((c) => String(c.type ?? '').toLowerCase() === 'header');
  const parameters = Array.isArray(header?.parameters)
    ? (header.parameters as Array<Record<string, unknown>>)
    : [];
  const imageParam = parameters.find((p) => String(p.type ?? '').toLowerCase() === 'image');
  const image = imageParam?.image as { link?: string } | undefined;
  return image?.link?.trim() || null;
}

/** @deprecated použij assertTemplatePayload */
export function assertZeroVariableTemplatePayload(
  requestBody: MetaMessagesRequestBody,
  variablesCount: number,
): void {
  assertTemplatePayload(requestBody, { variablesCount, headerType: 'NONE' });
}

export function buildTemplateMessageRequest(
  toDigits: string,
  config: WhatsAppTemplateSendConfig,
): MetaMessagesRequestBody {
  const templateName = config.templateName.trim();
  const languageCode = metaTemplateLanguageCode(config.languageCode);
  const to = toDigits.replace(/\D/g, '');

  const components = templateComponents(config);
  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: languageCode },
  };

  if (components.length > 0) {
    template.components = components;
  }

  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template,
  };
}

export function formatTemplateLogLabel(
  templateName: string,
  languageCode: string,
  bodyParameters: string[],
  headerType?: WhatsAppTemplateHeaderType,
  imageUrl?: string | null,
): string {
  const vars =
    bodyParameters.length > 0
      ? ` vars=[${bodyParameters.map((v) => JSON.stringify(v)).join(', ')}]`
      : '';
  const header =
    headerType === 'IMAGE'
      ? ` header=IMAGE${imageUrl ? ` url=${imageUrl}` : ''}`
      : '';
  return `template:${templateName}@${metaTemplateLanguageCode(languageCode)}${header}${vars}`;
}
