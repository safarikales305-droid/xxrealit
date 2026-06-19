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
  headerImageMediaId?: string;
  urlButtonParameters?: Array<{ index: number; text: string }>;
  urlButtonParamCount?: number;
};

export const WHATSAPP_URL_BUTTON_PARAMETER_HELP =
  'Pokud šablona obsahuje URL tlačítko s proměnnou, je nutné vyplnit koncovou část odkazu.';

export const WHATSAPP_URL_BUTTON_PARAMETER_REQUIRED_MSG =
  'Šablona má URL tlačítko s proměnnou — vyplňte parametr odkazu (např. registrace nebo makleri).';

export class WhatsAppTemplatePayloadError extends BadRequestException {
  constructor(message: string) {
    super(message);
  }
}

export const WHATSAPP_MARKETING_TEMPLATE_REQUIRED_MSG =
  'WhatsApp nepovoluje první marketingovou zprávu jako vlastní text. Vyberte schválenou šablonu zprávy.';

export const WHATSAPP_IMAGE_HEADER_REQUIRES_MEDIA_ID_MSG =
  'Obrázkové kampaně musí používat Meta media_id.';

export function formatMetaApiError(metaError?: {
  message?: string;
  code?: number;
  type?: string;
  fbtrace_id?: string;
  error_data?: unknown;
} | null): string {
  if (!metaError) return 'Meta nevrátilo ID zprávy.';
  const parts = [metaError.message?.trim() || 'Meta API chyba'];
  if (metaError.code != null) parts.push(`code: ${metaError.code}`);
  if (metaError.error_data != null) {
    parts.push(`error_data: ${JSON.stringify(metaError.error_data)}`);
  }
  if (metaError.fbtrace_id) parts.push(`fbtrace_id: ${metaError.fbtrace_id}`);
  return parts.join(' | ');
}

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

/** WhatsApp media_id musí být vždy string v image.id. */
export function normalizeHeaderImageMediaId(raw: unknown): string {
  if (raw == null) return '';
  return String(raw).trim();
}

function buildHeaderImageComponent(mediaIdRaw: unknown): Record<string, unknown> | null {
  const mediaId = normalizeHeaderImageMediaId(mediaIdRaw);
  if (!mediaId) return null;
  return {
    type: 'header',
    parameters: [{ type: 'image', image: { id: mediaId } }],
  };
}

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

function buildUrlButtonComponent(index: number, text: string): Record<string, unknown> {
  return {
    type: 'button',
    sub_type: 'url',
    index: String(index),
    parameters: [{ type: 'text', text: String(text).trim().slice(0, 1024) }],
  };
}

function templateComponents(
  config: WhatsAppTemplateSendConfig,
): Array<Record<string, unknown>> {
  const components: Array<Record<string, unknown>> = [];

  if (config.headerType === 'IMAGE') {
    const header = buildHeaderImageComponent(config.headerImageMediaId);
    if (header) components.push(header);
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

  for (const btn of config.urlButtonParameters ?? []) {
    const text = String(btn.text ?? '').trim();
    if (text) {
      components.push(buildUrlButtonComponent(btn.index, text));
    }
  }

  return components;
}

/** Ověří payload — šablona bez proměnných nesmí mít body components. */
export function assertTemplatePayload(
  requestBody: MetaMessagesRequestBody,
  config: Pick<
    WhatsAppTemplateSendConfig,
    'variablesCount' | 'headerType' | 'urlButtonParamCount'
  >,
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
    'media_id',
    'mediaId',
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
  if ('components' in templateObj && Array.isArray(templateObj.components) && templateObj.components.length === 0) {
    throw new WhatsAppTemplatePayloadError('template.components nesmí být prázdné pole.');
  }
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

  if ((config.urlButtonParamCount ?? 0) > 0) {
    assertUrlButtonInPayload(requestBody, config.urlButtonParamCount ?? 0);
  }
}

export function assertUrlButtonInPayload(
  requestBody: MetaMessagesRequestBody,
  expectedCount: number,
): void {
  const template = requestBody.template as Record<string, unknown> | undefined;
  const components = Array.isArray(template?.components)
    ? (template.components as Array<Record<string, unknown>>)
    : [];
  const buttons = components.filter((c) => String(c.type ?? '').toLowerCase() === 'button');
  if (buttons.length < expectedCount) {
    throw new WhatsAppTemplatePayloadError(WHATSAPP_URL_BUTTON_PARAMETER_REQUIRED_MSG);
  }
  for (const btn of buttons) {
    const subType = String((btn as { sub_type?: string }).sub_type ?? '').toLowerCase();
    if (subType !== 'url') continue;
    const parameters = Array.isArray(btn.parameters)
      ? (btn.parameters as Array<Record<string, unknown>>)
      : [];
    const textParam = parameters.find((p) => String(p.type ?? '').toLowerCase() === 'text');
    const text = String((textParam as { text?: string })?.text ?? '').trim();
    if (!text) {
      throw new WhatsAppTemplatePayloadError(WHATSAPP_URL_BUTTON_PARAMETER_REQUIRED_MSG);
    }
  }
}

/** Ověří, že Meta payload obsahuje header image.id (bez image.link). */
export function assertImageHeaderInPayload(requestBody: MetaMessagesRequestBody): void {
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

  if (link) {
    throw new WhatsAppTemplatePayloadError(WHATSAPP_IMAGE_HEADER_REQUIRES_MEDIA_ID_MSG);
  }

  if (!id) {
    throw new WhatsAppTemplatePayloadError(
      'HEADER IMAGE musí mít image.id (WhatsApp media_id) uvnitř template.components.',
    );
  }
}

export function extractHeaderImageMediaIdFromPayload(
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
  const image = imageParam?.image as { id?: string } | undefined;
  return image?.id?.trim() || null;
}

export function payloadUsesHeaderImageLink(requestBody: MetaMessagesRequestBody): boolean {
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
  return Boolean(image?.link?.trim());
}

export function finalizeMetaTemplateRequestBody(
  input: MetaMessagesRequestBody,
): MetaMessagesRequestBody {
  const to = String(input.to ?? '').replace(/\D/g, '');
  const rawTemplate = input.template as Record<string, unknown> | undefined;
  if (!rawTemplate || typeof rawTemplate !== 'object') {
    throw new WhatsAppTemplatePayloadError('Meta payload musí obsahovat objekt template.');
  }

  const name = String(rawTemplate.name ?? '').trim();
  const langRaw = rawTemplate.language as { code?: string } | undefined;
  const languageCode = String(langRaw?.code ?? 'cs').trim() || 'cs';

  const template: Record<string, unknown> = {
    name,
    language: { code: languageCode },
  };

  const rawComponents = Array.isArray(rawTemplate.components)
    ? (rawTemplate.components as Array<Record<string, unknown>>)
    : [];

  const components: Array<Record<string, unknown>> = [];

  for (const comp of rawComponents) {
    const type = String(comp.type ?? '').toLowerCase();
    if (type === 'header') {
      const parameters = Array.isArray(comp.parameters)
        ? (comp.parameters as Array<Record<string, unknown>>)
        : [];
      const imageParam = parameters.find((p) => String(p.type ?? '').toLowerCase() === 'image');
      const image = imageParam?.image as Record<string, unknown> | undefined;
      if (image?.link != null && String(image.link).trim()) {
        throw new WhatsAppTemplatePayloadError(WHATSAPP_IMAGE_HEADER_REQUIRES_MEDIA_ID_MSG);
      }
      if (image?.media_id != null && String(image.media_id).trim()) {
        throw new WhatsAppTemplatePayloadError(
          'HEADER IMAGE nesmí používat image.media_id — pouze image.id jako string.',
        );
      }
      const header = buildHeaderImageComponent(image?.id);
      if (header) components.push(header);
    } else if (type === 'body') {
      const parameters = Array.isArray(comp.parameters)
        ? (comp.parameters as Array<Record<string, unknown>>)
        : [];
      const textParams = parameters
        .filter((p) => String(p.type ?? '').toLowerCase() === 'text')
        .map((p) => ({
          type: 'text',
          text: String((p as { text?: string }).text ?? '').slice(0, 1024),
        }))
        .filter((p) => p.text.length > 0);
      if (textParams.length > 0) {
        components.push({ type: 'body', parameters: textParams });
      }
    } else if (type === 'button') {
      const subType = String(comp.sub_type ?? '').toLowerCase();
      if (subType !== 'url') continue;
      const index = Number.parseInt(String(comp.index ?? '0'), 10);
      const parameters = Array.isArray(comp.parameters)
        ? (comp.parameters as Array<Record<string, unknown>>)
        : [];
      const textParam = parameters.find((p) => String(p.type ?? '').toLowerCase() === 'text');
      const text = String((textParam as { text?: string })?.text ?? '').trim();
      if (text) {
        components.push(buildUrlButtonComponent(Number.isFinite(index) ? index : 0, text));
      }
    }
  }

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
  const draft: MetaMessagesRequestBody = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length > 0 ? { components } : {}),
    },
  };

  return finalizeMetaTemplateRequestBody(draft);
}

export function formatTemplateLogLabel(
  templateName: string,
  languageCode: string,
  bodyParameters: string[],
  headerType?: WhatsAppTemplateHeaderType,
  imageMediaId?: string | null,
): string {
  const vars =
    bodyParameters.length > 0
      ? ` vars=[${bodyParameters.map((v) => JSON.stringify(v)).join(', ')}]`
      : '';
  const header =
    headerType === 'IMAGE'
      ? ` header=IMAGE${imageMediaId ? ` media_id=${imageMediaId}` : ''}`
      : '';
  return `template:${templateName}@${metaTemplateLanguageCode(languageCode)}${header}${vars}`;
}
