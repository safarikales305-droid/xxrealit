/** Values sent to `/api/auth/register` (API normalizes diacritics + case). */
export const REGISTER_ROLE_OPTIONS = [
  { value: 'makler', label: 'Makléř' },
  { value: 'kancelar', label: 'Kancelář' },
  { value: 'remeslnik', label: 'Řemeslník' },
  { value: 'firma', label: 'Firma' },
  { value: 'uzivatel', label: 'Uživatel' },
  { value: 'sledujici', label: 'Sledující' },
] as const;

export type RegisterRoleValue = (typeof REGISTER_ROLE_OPTIONS)[number]['value'];
