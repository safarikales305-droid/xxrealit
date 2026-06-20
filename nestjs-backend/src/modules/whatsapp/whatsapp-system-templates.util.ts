export const WHATSAPP_VERIFY_TEMPLATE_ADMIN_MSG =
  'Ověření telefonu vyžaduje schválenou šablonu s 1 proměnnou.';

export const WHATSAPP_VERIFY_NOT_SAVED_MSG =
  'Nejprve uložte šablonu pro ověření telefonního čísla.';

export type SystemTemplateSlot =
  | 'verify'
  | 'postUploaded'
  | 'newPost'
  | 'welcome';

export type SystemTemplateMetaRow = {
  templateName: string;
  language: string;
  variablesCount: number;
  usable?: boolean;
  isStale?: boolean;
};

/** Rozsah povolených proměnných v těle šablony (null = bez omezení). */
export const SYSTEM_TEMPLATE_VARIABLE_RANGE: Record<
  SystemTemplateSlot,
  { min: number; max: number | null } | null
> = {
  verify: { min: 1, max: 1 },
  postUploaded: { min: 0, max: 1 },
  newPost: { min: 0, max: null },
  welcome: { min: 0, max: null },
};

export const SYSTEM_TEMPLATE_SLOT_LABELS: Record<SystemTemplateSlot, string> = {
  verify: 'Ověření telefonního čísla',
  postUploaded: 'Potvrzení nahrání příspěvku autorovi',
  newPost: 'Upozornění na nový příspěvek',
  welcome: 'Uvítací zpráva po registraci',
};

export function validateSystemTemplateForSlot(
  slot: SystemTemplateSlot,
  template: SystemTemplateMetaRow,
): string | null {
  if (template.isStale) {
    return `Šablona „${template.templateName}“ je zastaralá — synchronizujte šablony z Meta.`;
  }
  if (template.usable === false) {
    return `Šablona „${template.templateName}“ (${template.language}) není schválená.`;
  }

  if (slot === 'verify') {
    if (template.variablesCount !== 1) {
      return `Šablona „${template.templateName}“ musí mít přesně 1 proměnnou (ověřovací kód).`;
    }
    return null;
  }

  const range = SYSTEM_TEMPLATE_VARIABLE_RANGE[slot];
  if (!range) return null;

  if (template.variablesCount < range.min) {
    if (slot === 'postUploaded') {
      return `Šablona „${template.templateName}“ může mít 0 nebo 1 proměnnou, má ${template.variablesCount}.`;
    }
    return `Šablona „${template.templateName}“ musí mít alespoň ${range.min} proměnných, má ${template.variablesCount}.`;
  }

  if (range.max != null && template.variablesCount > range.max) {
    if (slot === 'postUploaded') {
      return `Šablona „${template.templateName}“ může mít 0 nebo 1 proměnnou, má ${template.variablesCount}.`;
    }
    return `Šablona „${template.templateName}“ smí mít nejvýše ${range.max} proměnných, má ${template.variablesCount}.`;
  }

  return null;
}

export function formatSystemTemplateOptionLabel(template: {
  templateName: string;
  language: string;
  category: string;
  variablesCount: number;
}): string {
  return `${template.templateName} · ${template.language} · ${template.category} · ${template.variablesCount} prom.`;
}
