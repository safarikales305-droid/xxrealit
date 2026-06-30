import { API_BASE_URL } from '@/lib/api';
import { getOrCreateVisitorId } from '@/lib/visitor-id';

export type ListingViewSource = 'SHORTS' | 'CLASSIC' | 'DETAIL';

const reportedKeys = new Set<string>();

export async function recordListingView(
  listingId: string,
  source: ListingViewSource,
  opts?: { accessToken?: string | null },
): Promise<void> {
  const id = listingId?.trim();
  if (!id) return;

  const sessionKey = `${id}:${source}`;
  if (reportedKeys.has(sessionKey)) return;

  const visitorId = getOrCreateVisitorId();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = opts?.accessToken?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE_URL}/listings/${encodeURIComponent(id)}/view`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ source, visitorId }),
      credentials: 'include',
    });
    if (!res.ok) return;
    const data = (await res.json()) as { recorded?: boolean };
    if (data.recorded !== false) {
      reportedKeys.add(sessionKey);
    }
  } catch {
    // ignore tracking errors
  }
}
