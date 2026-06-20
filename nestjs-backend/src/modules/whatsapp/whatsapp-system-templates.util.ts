export const WHATSAPP_VERIFY_TEMPLATE_NAME = 'whatsapp_verify_code';

export const WHATSAPP_VERIFY_TEMPLATE_ADMIN_MSG =
  'Vyberte WhatsApp šablonu pro ověření čísla v administraci.';

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

/** Očekávaný počet proměnných v těle šablony (null = pouze kontrola > 0). */
export const SYSTEM_TEMPLATE_EXPECTED_VARS: Record<
  SystemTemplateSlot,
  number | null
> = {
  verify: 1,
  postUploaded: 1,
  newPost: 2,
  welcome: null,
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
    if (template.templateName.trim().toLowerCase() !== WHATSAPP_VERIFY_TEMPLATE_NAME) {
      return `Pro ověření telefonu musí být šablona „${WHATSAPP_VERIFY_TEMPLATE_NAME}“.`;
    }
    if (template.variablesCount !== 1) {
      return `Šablona „${WHATSAPP_VERIFY_TEMPLATE_NAME}“ musí mít přesně 1 proměnnou (ověřovací kód).`;
    }
    return null;
  }

  const expected = SYSTEM_TEMPLATE_EXPECTED_VARS[slot];
  if (expected != null && template.variablesCount !== expected) {
    return `Šablona „${template.templateName}“ musí mít ${expected} proměnných, má ${template.variablesCount}.`;
  }
  if (slot === 'welcome' && template.variablesCount < 1) {
    return `Uvítací šablona musí mít alespoň 1 proměnnou.`;
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
