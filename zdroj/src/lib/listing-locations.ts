import { getServerSideApiBaseUrl } from '@/lib/api';

export type ListingLocationOption = {
  city: string;
  district: string;
  region: string;
  label: string;
  count: number;
  slug: string;
};

export async function fetchListingLocations(
  baseUrl?: string | null,
  options?: { q?: string; limit?: number },
): Promise<ListingLocationOption[]> {
  const base = (baseUrl ?? getServerSideApiBaseUrl() ?? '').replace(/\/+$/, '');
  if (!base) return [];
  const params = new URLSearchParams();
  if (options?.q?.trim()) params.set('q', options.q.trim());
  if (Number.isFinite(options?.limit)) params.set('limit', String(options?.limit));
  const qs = params.toString() ? `?${params.toString()}` : '';
  try {
    const res = await fetch(`${base}/listings/locations${qs}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: ListingLocationOption[] };
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}
