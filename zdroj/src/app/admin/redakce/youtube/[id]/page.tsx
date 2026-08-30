'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { EditorialCenterShell, StatusDot } from '@/components/admin/redakce/EditorialCenterShell';
import { API_BASE_URL } from '@/lib/api';
import { nestAuthHeaders } from '@/lib/nest-client';
import { buildShortShareUrl } from '@/lib/shorts-feed';
import type { NewsSourceRow } from '@/lib/news-editorial-client';

type SourcePost = {
  id: string;
  title: string;
  publishedAt: string | null;
  youtubeVideoId: string | null;
  youtubeThumbnailUrl: string | null;
};

export default function YoutubeChannelDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const [source, setSource] = useState<NewsSourceRow | null>(null);
  const [posts, setPosts] = useState<SourcePost[]>([]);

  useEffect(() => {
    if (!isLoading && user?.role !== 'ADMIN') router.replace('/');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!apiAccessToken || !API_BASE_URL || !params.id) return;
    void fetch(`${API_BASE_URL}/admin/news-editorial/sources`, {
      headers: { Accept: 'application/json', ...nestAuthHeaders(apiAccessToken) },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: NewsSourceRow[]) => setSource(rows.find((s) => s.id === params.id) ?? null));

    void fetch(`${API_BASE_URL}/posts?newsSourceId=${encodeURIComponent(params.id)}&limit=30`, {
      headers: { Accept: 'application/json', ...nestAuthHeaders(apiAccessToken) },
    })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items?: SourcePost[] }) => setPosts(data.items ?? []))
      .catch(() => setPosts([]));
  }, [apiAccessToken, params.id]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-orange-600" />
      </div>
    );
  }

  if (!source) {
    return (
      <EditorialCenterShell title="Kanál nenalezen">
        <Link href="/admin/redakce/youtube" className="text-orange-700 underline">
          ← Zpět na seznam
        </Link>
      </EditorialCenterShell>
    );
  }

  return (
    <EditorialCenterShell title={source.name} subtitle={source.youtubeChannelTitle ?? source.url}>
      <Link href="/admin/redakce/youtube" className="text-sm text-orange-700 underline">
        ← Všechny kanály
      </Link>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatusDot active={source.enabled} label="Zdroj aktivní" />
        <StatusDot active={source.youtubeAutoImport !== false} label="Auto import" />
        <StatusDot active={source.youtubePublishToShorts !== false} label="Shorts" />
        <StatusDot active={source.youtubeUseForReel !== false} label="Facebook Reel" />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
        <p>Poslední kontrola: {source.lastCheckedAt ? new Date(source.lastCheckedAt).toLocaleString('cs-CZ') : '—'}</p>
        <p>Poslední import: {source.lastAutoImportedAt ? new Date(source.lastAutoImportedAt).toLocaleString('cs-CZ') : '—'}</p>
        <p>Poslední Shorts: {source.lastPublishedToShortsAt ? new Date(source.lastPublishedToShortsAt).toLocaleString('cs-CZ') : '—'}</p>
        <p>Importováno videí: {source.youtubeImportedCount ?? 0}</p>
      </div>

      <h2 className="text-sm font-semibold text-zinc-900">Importovaná videa</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((p) => {
          const shortUrl =
            p.youtubeVideoId ? buildShortShareUrl(`youtube:${p.youtubeVideoId}`) : null;
          return (
            <div key={p.id} className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
              {p.youtubeThumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.youtubeThumbnailUrl} alt="" className="aspect-video w-full object-cover" />
              ) : null}
              <div className="p-3">
                <p className="line-clamp-2 text-sm font-semibold">{p.title}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {p.publishedAt ? new Date(p.publishedAt).toLocaleString('cs-CZ') : '—'}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {shortUrl ? (
                    <a href={shortUrl} target="_blank" rel="noreferrer" className="text-orange-700 underline">
                      Otevřít Short
                    </a>
                  ) : null}
                  {p.youtubeVideoId ? (
                    <a
                      href={`https://www.youtube.com/watch?v=${p.youtubeVideoId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-zinc-600 underline"
                    >
                      YouTube
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </EditorialCenterShell>
  );
}
