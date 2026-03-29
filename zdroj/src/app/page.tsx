import { Suspense } from 'react';
import { HomeLayout } from '@/components/home/home-layout';
import { API_BASE_URL } from '@/lib/api';
import {
  normalizeProperty,
  type PropertyFromApi,
} from '@/types/property';

/** Always run on the server per request — no static cache of listing data. */
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

function PageSkeleton() {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden overflow-x-hidden bg-[#fafafa]">
      <div className="h-14 shrink-0 border-b border-zinc-200 bg-white md:h-16" />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-2 md:grid-cols-[260px_1fr] md:p-4 xl:grid-cols-[260px_1fr_300px]">
        <div className="hidden min-h-0 overflow-x-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm md:block" />
        <div className="min-h-0 overflow-hidden rounded-2xl bg-black shadow-lg">
          <div className="mx-auto mt-10 h-[65%] max-w-md animate-pulse rounded-xl bg-zinc-800/80" />
        </div>
        <div className="hidden rounded-2xl border border-zinc-200 bg-white shadow-sm xl:block" />
      </div>
    </div>
  );
}

async function HomeWithData() {
  const raw = await fetchProperties();
  const items = raw.map(normalizeProperty);
  return <HomeLayout items={items} />;
}

export default function Home() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HomeWithData />
    </Suspense>
  );
}
