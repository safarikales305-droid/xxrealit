export type MetaTemplateComponent = {
  type?: string;
  format?: string;
  text?: string;
  example?: unknown;
  buttons?: unknown[];
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

export function hasHeaderImageComponent(components?: MetaTemplateComponent[]): boolean {
  if (!components?.length) return false;
  return components.some(
    (c) =>
      c.type?.toUpperCase() === 'HEADER' &&
      (c.format?.toUpperCase() === 'IMAGE' || c.format?.toUpperCase() === 'VIDEO' || c.format?.toUpperCase() === 'DOCUMENT'),
  );
}

/** Počítá proměnné jen z BODY textu — HEADER/IMAGE a parameter_format NAMED neovlivní počet, pokud BODY nemá placeholdery. */
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

  return {
    metaTemplateId,
    templateName,
    language,
    rawStatus,
    bodyText,
    variablesCount: countTemplateBodyVariables(item.components, parameterFormat),
    category: item.category?.trim() || 'UNKNOWN',
    hasHeaderImage: hasHeaderImageComponent(item.components),
    parameterFormat,
    rawTemplateJson: JSON.stringify(item),
  };
}
