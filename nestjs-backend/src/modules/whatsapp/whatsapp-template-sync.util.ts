export type MetaTemplateComponent = {
  type?: string;
  format?: string;
  text?: string;
  example?: unknown;
  buttons?: Array<{ type?: string; text?: string; url?: string; phone_number?: string }>;
};

export type MetaMessageTemplate = {
  id?: string;
  name?: string;
  language?: string;
  status?: string;
  category?: string;
  parameter_format?: string;
  components?: MetaTemplateComponent[];
};

export type MetaTemplatesPage = {
  data?: MetaMessageTemplate[];
  paging?: { cursors?: { after?: string }; next?: string };
  error?: { message?: string; code?: number; type?: string };
};

export type WhatsAppTemplateHeaderType = 'IMAGE' | 'TEXT' | 'NONE';

export type WhatsAppTemplateSkipReason = {
  name: string;
  language?: string;
  metaTemplateId?: string;
  reason: string;
};

export type WhatsAppTemplateSyncDebug = {
  rawCount: number;
  normalizedCount: number;
  savedCount: number;
  visibleCount: number;
  reasonSkipped: WhatsAppTemplateSkipReason[];
};

export function extractTemplateBodyText(components?: MetaTemplateComponent[]): string {
  if (!components?.length) return '';
  const body = components.find((c) => c.type?.toUpperCase() === 'BODY');
  return body?.text?.trim() ?? '';
}

export function detectTemplateHeaderType(
  components?: MetaTemplateComponent[],
): WhatsAppTemplateHeaderType {
  if (!components?.length) return 'NONE';
  const header = components.find((c) => c.type?.toUpperCase() === 'HEADER');
  if (!header) return 'NONE';
  const format = header.format?.toUpperCase();
  if (format === 'IMAGE') return 'IMAGE';
  if (format === 'TEXT') return 'TEXT';
  return 'NONE';
}

export function extractTemplateHeaderText(components?: MetaTemplateComponent[]): string {
  if (!components?.length) return '';
  const header = components.find((c) => c.type?.toUpperCase() === 'HEADER');
  if (header?.format?.toUpperCase() === 'TEXT') return header.text?.trim() ?? '';
  return '';
}

export function extractTemplateButtonLabels(components?: MetaTemplateComponent[]): string[] {
  if (!components?.length) return [];
  const buttonsComp = components.find((c) => c.type?.toUpperCase() === 'BUTTONS');
  if (!buttonsComp?.buttons?.length) return [];
  return buttonsComp.buttons
    .map((b) => b.text?.trim() || '')
    .filter(Boolean);
}

export function hasHeaderImageComponent(components?: MetaTemplateComponent[]): boolean {
  return detectTemplateHeaderType(components) === 'IMAGE';
}

/** Počítá proměnné jen z BODY textu. */
export function countTemplateBodyVariables(
  components?: MetaTemplateComponent[],
  _parameterFormat?: string,
): number {
  const bodyText = extractTemplateBodyText(components);
  if (!bodyText) return 0;

  if (!/\{\{[^}]+\}\}/.test(bodyText)) return 0;

  let maxPositional = 0;
  for (const match of bodyText.matchAll(/\{\{(\d+)\}\}/g)) {
    const index = Number.parseInt(match[1] ?? '', 10);
    if (Number.isFinite(index) && index > maxPositional) {
      maxPositional = index;
    }
  }
  if (maxPositional > 0) return maxPositional;

  const named = bodyText.match(/\{\{[^}]+\}\}/g);
  return named?.length ?? 0;
}

export function parseMetaTemplateItem(item: MetaMessageTemplate): {
  metaTemplateId: string;
  templateName: string;
  language: string;
  rawStatus: string;
  bodyText: string;
  headerType: WhatsAppTemplateHeaderType;
  headerText: string;
  buttonLabels: string[];
  variablesCount: number;
  category: string;
  hasHeaderImage: boolean;
  parameterFormat: string;
  rawTemplateJson: string;
} | null {
  const metaTemplateId = item.id?.trim();
  const templateName = item.name?.trim();
  const language = item.language?.trim();
  if (!metaTemplateId || !templateName || !language) return null;

  const rawStatus = item.status?.trim() || 'UNKNOWN';
  const bodyText = extractTemplateBodyText(item.components);
  const parameterFormat = item.parameter_format?.trim() || 'POSITIONAL';
  const headerType = detectTemplateHeaderType(item.components);

  return {
    metaTemplateId,
    templateName,
    language,
    rawStatus,
    bodyText,
    headerType,
    headerText: extractTemplateHeaderText(item.components),
    buttonLabels: extractTemplateButtonLabels(item.components),
    variablesCount: countTemplateBodyVariables(item.components, parameterFormat),
    category: item.category?.trim() || 'UNKNOWN',
    hasHeaderImage: headerType === 'IMAGE',
    parameterFormat,
    rawTemplateJson: JSON.stringify(item),
  };
}

export function extractTemplatePartsFromRaw(
  rawTemplate: unknown,
): {
  headerType: WhatsAppTemplateHeaderType;
  headerText: string;
  bodyText: string;
  buttonLabels: string[];
} {
  if (!rawTemplate || typeof rawTemplate !== 'object') {
    return { headerType: 'NONE', headerText: '', bodyText: '', buttonLabels: [] };
  }
  const components = (rawTemplate as MetaMessageTemplate).components;
  return {
    headerType: detectTemplateHeaderType(components),
    headerText: extractTemplateHeaderText(components),
    bodyText: extractTemplateBodyText(components),
    buttonLabels: extractTemplateButtonLabels(components),
  };
}
