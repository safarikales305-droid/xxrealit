'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { EditorialCenterShell } from '@/components/admin/redakce/EditorialCenterShell';
import { nestEditorialCategories, type ContentSourceCategory } from '@/lib/editorial-center-client';
import {
  nestAdminApproveYoutubeSuggestion,
  nestAdminListYoutubeSuggestions,
  nestAdminRejectYoutubeSuggestion,
  nestAdminRunYoutubeDiscovery,
  type YoutubeSourceSuggestionRow,
} from '@/lib/news-editorial-client';

export default function YoutubeNavrhPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const [rows, setRows] = useState<YoutubeSourceSuggestionRow[]>([]);
  const [categories, setCategories] = useState<ContentSourceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!apiAccessToken) return;
    setLoading(true);
    const [list, cats] = await Promise.all([
      nestAdminListYoutubeSuggestions(apiAccessToken, 'PENDING'),
      nestEditorialCategories(apiAccessToken),
    ]);
    setRows(list);
    setCategories(cats ?? []);
    setLoading(false);
  }, [apiAccessToken]);

  useEffect(() => {
    if (!isLoading && user?.role !== 'ADMIN') router.replace('/');
  }, [isLoading, user, router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const approve = async (row: YoutubeSourceSuggestionRow, categoryId?: string) => {
    if (!apiAccessToken) return;
    setBusyId(row.id);
    await nestAdminApproveYoutubeSuggestion(apiAccessToken, row.id, categoryId ?? row.category.id);
    await reload();
    setBusyId(null);
  };

  const reject = async (id: string) => {
    if (!apiAccessToken) return;
    setBusyId(id);
    await nestAdminRejectYoutubeSuggestion(apiAccessToken, id);
    await reload();
    setBusyId(null);
  };

  if (isLoading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-orange-600" />
      </div>
    );
  }

  return (
    <EditorialCenterShell title="Návrhy AI — YouTube kanály" subtitle="Schvalte kanály před připojením do importu">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/redakce/youtube" className="text-sm text-orange-700 underline">
          ← YouTube kanály
        </Link>
        <button
          type="button"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium"
          onClick={() => apiAccessToken && void nestAdminRunYoutubeDiscovery(apiAccessToken).then(() => reload())}
        >
          Spustit discovery
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-orange-600" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
          Žádné návrhy ke schválení. Spusťte discovery nebo počkejte na plánovaný běh.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((row) => (
            <article key={row.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex gap-3">
                {row.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.thumbnailUrl} alt="" className="size-14 rounded-lg object-cover" />
                ) : (
                  <div className="size-14 rounded-lg bg-zinc-200" />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold text-zinc-900">{row.channelTitle}</h2>
                  <p className="text-xs text-orange-700">{row.category.label}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Skóre {row.relevanceScore}%
                    {row.subscriberCount != null ? ` · ${row.subscriberCount.toLocaleString('cs-CZ')} odběratelů` : ''}
                    {row.videoCount != null ? ` · ${row.videoCount} videí` : ''}
                  </p>
                </div>
              </div>
              {row.description ? (
                <p className="mt-2 line-clamp-2 text-sm text-zinc-600">{row.description}</p>
              ) : null}
              {row.reason ? <p className="mt-2 text-xs text-zinc-500">{row.reason}</p> : null}
              <label className="mt-3 block text-xs">
                Kategorie před schválením
                <select
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                  defaultValue={row.category.id}
                  id={`cat-${row.id}`}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === row.id}
                  className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  onClick={() => {
                    const sel = document.getElementById(`cat-${row.id}`) as HTMLSelectElement | null;
                    void approve(row, sel?.value);
                  }}
                >
                  Schválit
                </button>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
                  onClick={() => void reject(row.id)}
                >
                  Zamítnout
                </button>
                <a
                  href={row.channelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
                >
                  Otevřít YouTube <ExternalLink className="size-3.5" />
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </EditorialCenterShell>
  );
}
