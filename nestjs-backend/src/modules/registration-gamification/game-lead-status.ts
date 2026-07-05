export const GAME_LEAD_STATUSES = [
  'NEW',
  'SEEN',
  'CONTACTED',
  'REGISTERED',
  'INVALID',
] as const;

export type GameLeadStatus = (typeof GAME_LEAD_STATUSES)[number];

export function isGameLeadStatus(value: string): value is GameLeadStatus {
  return (GAME_LEAD_STATUSES as readonly string[]).includes(value);
}
