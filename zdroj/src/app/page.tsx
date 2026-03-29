import { HomeLayout } from '@/components/home/home-layout';
import { API_BASE_URL } from '@/lib/api';
import {
  normalizeProperty,
  type PropertyFromApi,
} from '@/types/property';

/** Server-render on every request (API + listing UI). */
export const dynamic = 'force-dynamic';

async function fetchProperties(): Promise<PropertyFromApi[]> {
  const url = `${API_BASE_URL}/properties`;

  const res = await fetch(url, {
    cache: 'no-store',
  });

  if (!res.ok) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Home] GET properties failed', url, res.status);
    }
    return [];
  }

  const data: unknown = await res.json();
  if (!Array.isArray(data)) {
    return [];
  }

  const rows = data as PropertyFromApi[];
  if (process.env.NODE_ENV === 'development') {
    console.log(
      '[Home] Fresh properties from API',
      url,
      rows.map((p) => ({ id: p.id, videoUrl: p.videoUrl })),
    );
  }

  return rows;
}

export default async function Home() {
  const raw = await fetchProperties();
  const items = raw.map(normalizeProperty);
  return <HomeLayout items={items} />;
}
