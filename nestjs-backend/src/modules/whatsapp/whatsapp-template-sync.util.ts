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

export type WhatsAppTemplateHeaderFormat = 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT';

export type WhatsAppTemplateHeaderType = 'IMAGE' | 'TEXT' | 'NONE';

export type WhatsAppTemplateComponentKind = 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';

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

export type WhatsAppTemplateUrlButton = {
  index: number;
  buttonText: string;
  urlTemplate: string;
};

export type WhatsAppTemplateComponentSummary = {
  componentTypes: WhatsAppTemplateComponentKind[];
  headerFormat: WhatsAppTemplateHeaderFormat | null;
  headerText: string;
  bodyText: string;
  footerText: string;
  buttonLabels: string[];
  bodyVariablesCount: number;
  urlButtonsWithVariable: WhatsAppTemplateUrlButton[];
  needsHeaderImage: boolean;
  needsUrlButtonParameter: boolean;
};

export function metaTemplateComponents(
  rawTemplate: unknown,
): MetaTemplateComponent[] | undefined {
  if (!rawTemplate || typeof rawTemplate !== 'object') return undefined;
  const components = (rawTemplate as MetaMessageTemplate).components;
  return Array.isArray(components) ? components : undefined;
}

export function extractTemplateBodyText(components?: MetaTemplateComponent[]): string {
  if (!components?.length) return '';
  const body = components.find((c) => c.type?.toUpperCase() === 'BODY');
  return body?.text?.trim() ?? '';
}

export function extractTemplateFooterText(components?: MetaTemplateComponent[]): string {
  if (!components?.length) return '';
  const footer = components.find((c) => c.type?.toUpperCase() === 'FOOTER');
  return footer?.text?.trim() ?? '';
}

export function detectTemplateHeaderFormat(
  components?: MetaTemplateComponent[],
): WhatsAppTemplateHeaderFormat | null {
  if (!components?.length) return null;
  const header = components.find((c) => c.type?.toUpperCase() === 'HEADER');
  if (!header) return null;
  const format = header.format?.toUpperCase();
  if (format === 'IMAGE') return 'IMAGE';
  if (format === 'VIDEO') return 'VIDEO';
  if (format === 'DOCUMENT') return 'DOCUMENT';
  if (format === 'TEXT') return 'TEXT';
  return null;
}

export function detectTemplateHeaderType(
  components?: MetaTemplateComponent[],
): WhatsAppTemplateHeaderType {
  const format = detectTemplateHeaderFormat(components);
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

const URL_BUTTON_VARIABLE_RE = /\{\{[^}]+\}\}/;

export function urlButtonHasVariable(url: string): boolean {
  return URL_BUTTON_VARIABLE_RE.test(url.trim());
}

export function extractUrlButtonsWithParameters(
  components?: MetaTemplateComponent[],
): WhatsAppTemplateUrlButton[] {
  if (!components?.length) return [];
  const buttonsComp = components.find((c) => c.type?.toUpperCase() === 'BUTTONS');
  if (!buttonsComp?.buttons?.length) return [];

  const result: WhatsAppTemplateUrlButton[] = [];
  buttonsComp.buttons.forEach((btn, index) => {
    const btnType = btn.type?.toUpperCase();
    if (btnType !== 'URL') return;
    const url = btn.url?.trim() || '';
    if (urlButtonHasVariable(url)) {
      result.push({
        index,
        buttonText: btn.text?.trim() || '',
        urlTemplate: url,
      });
    }
  });
  return result;
}

export function hasUrlButtonParameter(components?: MetaTemplateComponent[]): boolean {
  return extractUrlButtonsWithParameters(components).length > 0;
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
  return detectTemplateHeaderFormat(components) === 'IMAGE';
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

export function parseTemplateComponentSummary(
  rawTemplate: unknown,
): WhatsAppTemplateComponentSummary {
  const components = metaTemplateComponents(rawTemplate);
  const componentTypes: WhatsAppTemplateComponentKind[] = [];
  if (components?.length) {
    for (const comp of components) {
      const type = comp.type?.toUpperCase();
      if (type === 'HEADER' || type === 'BODY' || type === 'FOOTER' || type === 'BUTTONS') {
        if (!componentTypes.includes(type)) {
          componentTypes.push(type);
        }
      }
    }
  }

  const headerFormat = detectTemplateHeaderFormat(components);
  const bodyText = extractTemplateBodyText(components);
  const footerText = extractTemplateFooterText(components);
  const urlButtonsWithVariable = extractUrlButtonsWithParameters(components);
  const bodyVariablesCount = countTemplateBodyVariables(components);

  return {
    componentTypes,
    headerFormat,
    headerText: extractTemplateHeaderText(components),
    bodyText,
    footerText,
    buttonLabels: extractTemplateButtonLabels(components),
    bodyVariablesCount,
    urlButtonsWithVariable,
    needsHeaderImage: headerFormat === 'IMAGE',
    needsUrlButtonParameter: urlButtonsWithVariable.length > 0,
  };
}

export type WhatsAppTemplateRequirements = {
  headerType: WhatsAppTemplateHeaderType;
  headerFormat: WhatsAppTemplateHeaderFormat | null;
  variablesCount: number;
  urlButtonParamCount: number;
  needsHeaderImage: boolean;
  needsUrlButtonParameter: boolean;
  urlButtons: WhatsAppTemplateUrlButton[];
  componentsSummary: WhatsAppTemplateComponentSummary;
};

/** Požadavky šablony vždy z raw Meta JSON (ne ze zastaralých DB sloupců). */
export function resolveTemplateRequirementsFromRaw(
  rawTemplate: unknown,
): WhatsAppTemplateRequirements {
  const componentsSummary = parseTemplateComponentSummary(rawTemplate);
  const headerType = detectTemplateHeaderType(metaTemplateComponents(rawTemplate));
  return {
    headerType,
    headerFormat: componentsSummary.headerFormat,
    variablesCount: componentsSummary.bodyVariablesCount,
    urlButtonParamCount: componentsSummary.urlButtonsWithVariable.length,
    needsHeaderImage: componentsSummary.needsHeaderImage,
    needsUrlButtonParameter: componentsSummary.needsUrlButtonParameter,
    urlButtons: componentsSummary.urlButtonsWithVariable,
    componentsSummary,
  };
}

export function normalizeUrlButtonParameterInput(
  input: string,
  urlTemplate?: string,
): string {
  let value = input.trim();
  if (!value) return '';

  if (urlTemplate && value.includes('://')) {
    const staticPrefix = urlTemplate.replace(URL_BUTTON_VARIABLE_RE, '').replace(/\/$/, '');
    const normalized = value.replace(/\/$/, '');
    if (staticPrefix && normalized.startsWith(staticPrefix)) {
      value = normalized.slice(staticPrefix.length).replace(/^\//, '');
    } else {
      value = value.replace(/^https?:\/\/[^/]+\//, '').replace(/^\//, '');
    }
  } else if (value.includes('://')) {
    value = value.replace(/^https?:\/\/[^/]+\//, '').replace(/^\//, '');
  }

  return value.trim();
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
  urlButtonParamCount: number;
  variablesCount: number;
  category: string;
  hasHeaderImage: boolean;
  parameterFormat: string;
  rawTemplateJson: string;
  componentsSummary: WhatsAppTemplateComponentSummary;
} | null {
  const metaTemplateId = item.id?.trim();
  const templateName = item.name?.trim();
  const language = item.language?.trim();
  if (!metaTemplateId || !templateName || !language) return null;

  const rawStatus = item.status?.trim() || 'UNKNOWN';
  const parameterFormat = item.parameter_format?.trim() || 'POSITIONAL';
  const componentsSummary = parseTemplateComponentSummary(item);
  const headerType = detectTemplateHeaderType(item.components);
  const urlButtons = componentsSummary.urlButtonsWithVariable;

  return {
    metaTemplateId,
    templateName,
    language,
    rawStatus,
    bodyText: componentsSummary.bodyText,
    headerType,
    headerText: componentsSummary.headerText,
    buttonLabels: componentsSummary.buttonLabels,
    urlButtonParamCount: urlButtons.length,
    variablesCount: componentsSummary.bodyVariablesCount,
    category: item.category?.trim() || 'UNKNOWN',
    hasHeaderImage: componentsSummary.needsHeaderImage,
    parameterFormat,
    rawTemplateJson: JSON.stringify(item),
    componentsSummary,
  };
}

export function extractTemplatePartsFromRaw(
  rawTemplate: unknown,
): {
  headerType: WhatsAppTemplateHeaderType;
  headerText: string;
  bodyText: string;
  footerText: string;
  buttonLabels: string[];
  urlButtons: WhatsAppTemplateUrlButton[];
  componentsSummary: WhatsAppTemplateComponentSummary;
} {
  const componentsSummary = parseTemplateComponentSummary(rawTemplate);
  return {
    headerType: detectTemplateHeaderType(metaTemplateComponents(rawTemplate)),
    headerText: componentsSummary.headerText,
    bodyText: componentsSummary.bodyText,
    footerText: componentsSummary.footerText,
    buttonLabels: componentsSummary.buttonLabels,
    urlButtons: componentsSummary.urlButtonsWithVariable,
    componentsSummary,
  };
}

export function describeTemplateComponentsForLog(rawTemplate: unknown): Record<string, unknown> {
  const summary = parseTemplateComponentSummary(rawTemplate);
  return {
    componentTypes: summary.componentTypes,
    headerFormat: summary.headerFormat,
    bodyVariablesCount: summary.bodyVariablesCount,
    urlButtonsWithVariable: summary.urlButtonsWithVariable.map((b) => ({
      index: b.index,
      urlTemplate: b.urlTemplate,
    })),
    needsHeaderImage: summary.needsHeaderImage,
    needsUrlButtonParameter: summary.needsUrlButtonParameter,
  };
}
