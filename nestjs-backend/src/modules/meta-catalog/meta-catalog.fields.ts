export type MetaCatalogFieldCategory = 'required' | 'optional' | 'sensitive';

export type MetaCatalogFieldDef = {
  key: string;
  label: string;
  category: MetaCatalogFieldCategory;
  defaultEnabled: boolean;
  feedKeys: string[];
};

export const META_CATALOG_FIELDS: MetaCatalogFieldDef[] = [
  { key: 'id', label: 'ID inzerátu', category: 'required', defaultEnabled: true, feedKeys: ['id', 'g:id'] },
  { key: 'title', label: 'Název', category: 'required', defaultEnabled: true, feedKeys: ['title', 'g:title'] },
  { key: 'description', label: 'Popis', category: 'required', defaultEnabled: true, feedKeys: ['description', 'g:description'] },
  { key: 'price', label: 'Cena', category: 'required', defaultEnabled: true, feedKeys: ['price', 'g:price'] },
  { key: 'url', label: 'URL detailu', category: 'required', defaultEnabled: true, feedKeys: ['url', 'link', 'g:link'] },
  { key: 'main_image', label: 'Hlavní fotografie', category: 'required', defaultEnabled: true, feedKeys: ['main_image', 'image_link', 'g:image_link'] },
  { key: 'availability', label: 'Dostupnost', category: 'required', defaultEnabled: true, feedKeys: ['availability', 'g:availability'] },

  { key: 'gallery', label: 'Galerie fotografií', category: 'optional', defaultEnabled: true, feedKeys: ['gallery', 'additional_image_link'] },
  { key: 'video', label: 'Video', category: 'optional', defaultEnabled: true, feedKeys: ['video'] },
  { key: 'offer_type', label: 'Typ nabídky', category: 'optional', defaultEnabled: true, feedKeys: ['offer_type'] },
  { key: 'property_type', label: 'Typ nemovitosti', category: 'optional', defaultEnabled: true, feedKeys: ['property_type'] },
  { key: 'category', label: 'Kategorie', category: 'optional', defaultEnabled: true, feedKeys: ['category'] },
  { key: 'disposition', label: 'Dispozice', category: 'optional', defaultEnabled: true, feedKeys: ['disposition'] },
  { key: 'city', label: 'Město', category: 'optional', defaultEnabled: true, feedKeys: ['city'] },
  { key: 'district', label: 'Okres', category: 'optional', defaultEnabled: true, feedKeys: ['district'] },
  { key: 'region', label: 'Kraj', category: 'optional', defaultEnabled: true, feedKeys: ['region'] },
  { key: 'postal_code', label: 'PSČ', category: 'optional', defaultEnabled: false, feedKeys: ['postal_code'] },
  { key: 'gps', label: 'GPS souřadnice', category: 'optional', defaultEnabled: false, feedKeys: ['gps'] },
  { key: 'area', label: 'Užitná plocha', category: 'optional', defaultEnabled: true, feedKeys: ['area'] },
  { key: 'land_area', label: 'Plocha pozemku', category: 'optional', defaultEnabled: true, feedKeys: ['land_area'] },
  { key: 'energy_label', label: 'Energetická třída', category: 'optional', defaultEnabled: true, feedKeys: ['energy_label'] },
  { key: 'year_built', label: 'Rok výstavby', category: 'optional', defaultEnabled: false, feedKeys: ['year_built'] },
  { key: 'created_at', label: 'Datum vložení', category: 'optional', defaultEnabled: true, feedKeys: ['created_at'] },
  { key: 'updated_at', label: 'Datum aktualizace', category: 'optional', defaultEnabled: true, feedKeys: ['updated_at'] },
  { key: 'premium', label: 'Premium příznak', category: 'optional', defaultEnabled: true, feedKeys: ['premium'] },
  { key: 'developer', label: 'Developer', category: 'optional', defaultEnabled: true, feedKeys: ['developer'] },
  { key: 'project', label: 'Projekt', category: 'optional', defaultEnabled: true, feedKeys: ['project'] },

  { key: 'broker_name', label: 'Jméno makléře', category: 'sensitive', defaultEnabled: false, feedKeys: ['broker', 'broker_name'] },
  { key: 'broker_phone', label: 'Telefon makléře', category: 'sensitive', defaultEnabled: false, feedKeys: ['phone', 'broker_phone'] },
  { key: 'broker_email', label: 'Email makléře', category: 'sensitive', defaultEnabled: false, feedKeys: ['email', 'broker_email'] },
  { key: 'broker_whatsapp', label: 'WhatsApp makléře', category: 'sensitive', defaultEnabled: false, feedKeys: ['whatsapp', 'broker_whatsapp'] },
  { key: 'owner_contact', label: 'Kontakt na vlastníka', category: 'sensitive', defaultEnabled: false, feedKeys: ['owner_contact'] },
  { key: 'user_id', label: 'Interní ID uživatele', category: 'sensitive', defaultEnabled: false, feedKeys: ['user_id'] },
  { key: 'crm_info', label: 'CRM informace', category: 'sensitive', defaultEnabled: false, feedKeys: ['crm_info'] },
  { key: 'internal_notes', label: 'Interní poznámky', category: 'sensitive', defaultEnabled: false, feedKeys: ['internal_notes'] },
  { key: 'paid_contacts', label: 'Placené kontakty', category: 'sensitive', defaultEnabled: false, feedKeys: ['paid_contacts'] },
];

export const SENSITIVE_FIELD_KEYS = new Set(
  META_CATALOG_FIELDS.filter((f) => f.category === 'sensitive').map((f) => f.key),
);

export const REQUIRED_FIELD_KEYS = new Set(
  META_CATALOG_FIELDS.filter((f) => f.category === 'required').map((f) => f.key),
);

export const DEFAULT_EXPORT_FIELD_FLAGS: Record<string, boolean> = Object.fromEntries(
  META_CATALOG_FIELDS.map((f) => [f.key, f.defaultEnabled]),
);

export const SYNC_INTERVAL_OPTIONS = [1, 5, 10, 15, 30, 60] as const;

export type ExportChannel = 'meta' | 'google' | 'tiktok' | 'ai';
