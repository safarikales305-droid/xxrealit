export type TiparPayoutSummary = {
  lifetimeEarnings: number;
  paidOutTotal: number;
  earningsBalance: number;
  reservedInRequests: number;
  availableForPayout: number;
  bonusCredit: number;
  realCreditBalance: number;
  bankAccount: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  whatsappVerified: boolean;
  canRequest: boolean;
  blockers: string[];
};

export type TiparPayoutHistoryItem = {
  id: string;
  amount: number;
  status: string;
  adminNote: string | null;
  requestedAt: string;
  resolvedAt: string | null;
};

export type TiparPayoutAdminRow = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone: string | null;
  userRole: string;
  bankAccount: string | null;
  amount: number;
  status: string;
  adminNote: string | null;
  requestedAt: string;
  resolvedAt: string | null;
};

async function tiparPayoutFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(`/api/nest/tipar/payouts/${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function fetchTiparPayoutSummary(): Promise<TiparPayoutSummary | null> {
  return tiparPayoutFetch<TiparPayoutSummary>('summary');
}

export async function fetchTiparPayoutHistory(): Promise<TiparPayoutHistoryItem[]> {
  const data = await tiparPayoutFetch<{ items?: TiparPayoutHistoryItem[] }>('history');
  return data?.items ?? [];
}

export async function requestTiparPayout(amount: number): Promise<{ ok: boolean; message?: string; error?: string }> {
  const res = await fetch('/api/nest/tipar/payouts/request', {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return {
    ok: res.ok,
    message: data.message,
    error: res.ok ? undefined : (data.message ?? 'Žádost o výplatu selhala'),
  };
}

export async function fetchAdminTiparPayouts(status?: string): Promise<TiparPayoutAdminRow[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetch(`/api/nest/admin/tipar-payouts${qs}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: TiparPayoutAdminRow[] };
  return data.items ?? [];
}

export async function updateAdminTiparPayoutStatus(
  id: string,
  status: string,
  adminNote?: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/nest/admin/tipar-payouts/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, adminNote: adminNote?.trim() || undefined }),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return { ok: res.ok, error: res.ok ? undefined : (data.message ?? 'Uložení selhalo') };
}

export const TIPAR_PAYOUT_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Čeká',
  APPROVED: 'Schváleno',
  REJECTED: 'Zamítnuto',
  PAID: 'Vyplaceno',
};
