export type RealitniEsoParsedContact = {
  companyName: string;
  email: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  website: string | null;
  city: string | null;
  address: string | null;
  sourceUrl: string;
  listingCount: number;
};

export type RealitniEsoCrawlPreview = {
  profilesFound: number;
  sample: RealitniEsoParsedContact[];
  pagesScanned: number;
  errors: string[];
};

export type RealitniEsoImportResult = {
  profilesFound: number;
  created: number;
  updated: number;
  duplicates: number;
  withoutEmail: number;
  withoutPhone: number;
  errors: string[];
  pagesScanned: number;
};

export const BROKER_CONTACT_STATUSES = [
  'NEW',
  'VERIFIED',
  'CONTACTED',
  'EMAILED',
  'WHATSAPP_SENT',
  'UNSUBSCRIBED',
  'INVALID',
  'BLOCKED',
] as const;

export type BrokerContactStatus = (typeof BROKER_CONTACT_STATUSES)[number];

export const WHATSAPP_BLOCKED_CONTACT_STATUSES: BrokerContactStatus[] = [
  'INVALID',
  'BLOCKED',
  'UNSUBSCRIBED',
];

export type BrokerDatabaseWhatsAppAudience = {
  mode: 'selected_ids' | 'filtered' | 'all_imported';
  selectedContactIds?: string[];
  filter?: {
    search?: string;
    portal?: string;
    hasEmail?: boolean;
    hasPhone?: boolean;
    profileCreated?: boolean;
    outreachStatus?: string;
    contactStatus?: string;
    sort?: string;
  };
};
