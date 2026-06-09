/** Hodnoty role odesílané při registraci — mapují se v Nest AuthService. */
export const REGISTRATION_ACCOUNT_TYPES = [
  { value: 'USER', label: 'Soukromý prodejce' },
  { value: 'AGENT', label: 'Realitní makléř' },
  { value: 'DEVELOPER', label: 'Developer' },
  { value: 'COMPANY', label: 'Majitel stavební firmy' },
  { value: 'CRAFTSMAN', label: 'Řemeslník' },
  { value: 'FINANCIAL_ADVISOR', label: 'Finanční poradce' },
  { value: 'INVESTOR', label: 'Investor' },
  { value: 'AGENCY', label: 'Realitní kancelář' },
  { value: 'TIPSTER', label: 'Tipař' },
] as const;

export type RegistrationAccountType = (typeof REGISTRATION_ACCOUNT_TYPES)[number]['value'];

export const REGISTRATION_ACCOUNT_TYPE_VALUES = REGISTRATION_ACCOUNT_TYPES.map((t) => t.value);
