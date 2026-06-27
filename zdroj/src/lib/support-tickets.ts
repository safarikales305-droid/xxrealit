export const SUPPORT_TICKET_CATEGORIES = [
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
] as const;

export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number]['value'];

export type SupportOpenOptions = {
  subject?: string;
  category?: SupportTicketCategory;
};

export const SUPPORT_TICKET_STATUSES = [
  { value: 'NEW', label: 'Nový' },
  { value: 'WAITING_REPLY', label: 'Čeká na odpověď' },
  { value: 'IN_PROGRESS', label: 'Vyřizuje se' },
  { value: 'WAITING_CUSTOMER', label: 'Čeká na zákazníka' },
  { value: 'RESOLVED', label: 'Vyřešeno' },
  { value: 'CLOSED', label: 'Uzavřeno' },
] as const;

export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number]['value'];

export type SupportTicketMessage = {
  id: string;
  authorType: 'CUSTOMER' | 'STAFF' | 'SYSTEM';
  body: string;
  createdAt: string;
  authorName?: string | null;
  isInternalNote?: boolean;
};

export type SupportTicket = {
  id: string;
  publicId: string;
  userId: string | null;
  firstName: string;
  lastName: string | null;
  phone: string;
  whatsapp: string;
  email: string;
  subject: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  assignedToId: string | null;
  ipAddress?: string | null;
  createdAt: string;
  lastMessageAt: string;
  isRegistered: boolean;
  user?: { id: string; name: string; email: string; role: string } | null;
  assignedTo?: { id: string; name: string; email: string } | null;
  messages: SupportTicketMessage[];
};

export function supportCategoryLabel(value: string): string {
  return SUPPORT_TICKET_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function supportStatusLabel(value: string): string {
  return SUPPORT_TICKET_STATUSES.find((s) => s.value === value)?.label ?? value;
}
