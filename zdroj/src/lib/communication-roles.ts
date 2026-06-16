export const COMMUNICATION_ROLES = [
  'AGENT',
  'AGENCY',
  'COMPANY',
  'INVESTOR',
  'FINANCIAL_ADVISOR',
  'CRAFTSMAN',
  'ADMIN',
] as const;

export function canAccessCommunication(role: string | null | undefined): boolean {
  if (!role) return false;
  return (COMMUNICATION_ROLES as readonly string[]).includes(role);
}
