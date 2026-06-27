import { SupportTicketCategory, SupportTicketStatus } from '@prisma/client';

export const SUPPORT_TICKET_STATUSES: {
  value: SupportTicketStatus;
  label: string;
}[] = [
  { value: 'NEW', label: 'Nový' },
  { value: 'WAITING_REPLY', label: 'Čeká na odpověď' },
  { value: 'IN_PROGRESS', label: 'Vyřizuje se' },
  { value: 'WAITING_CUSTOMER', label: 'Čeká na zákazníka' },
  { value: 'RESOLVED', label: 'Vyřešeno' },
  { value: 'CLOSED', label: 'Uzavřeno' },
];

export const SUPPORT_TICKET_CATEGORIES: {
  value: SupportTicketCategory;
  label: string;
}[] = [
  { value: 'TECHNICAL', label: 'Technická podpora' },
  { value: 'LISTING', label: 'Inzerce' },
  { value: 'PAYMENTS', label: 'Platby' },
  { value: 'CREDITS', label: 'Kredity' },
  { value: 'BROKERS', label: 'Makléři' },
  { value: 'CONSTRUCTION', label: 'Stavební firmy' },
  { value: 'INVESTORS', label: 'Investoři' },
  { value: 'FINANCIAL_ADVISORS', label: 'Finanční poradci' },
  { value: 'REPORT_ISSUE', label: 'Nahlášení problému' },
  { value: 'BUSINESS_COOPERATION', label: 'Obchodní spolupráce' },
  { value: 'OTHER', label: 'Jiné' },
];

export function supportCategoryLabel(category: SupportTicketCategory): string {
  return SUPPORT_TICKET_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

export function supportStatusLabel(status: SupportTicketStatus): string {
  return SUPPORT_TICKET_STATUSES.find((s) => s.value === status)?.label ?? status;
}
