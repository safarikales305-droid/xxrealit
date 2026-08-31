'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MoreVertical } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  EditorialCenterShell,
  StatusDot,
} from '@/components/admin/redakce/EditorialCenterShell';
import { nestEditorialCategories, type ContentSourceCategory } from '@/lib/editorial-center-client';
import {
  nestAdminDeleteNewsSource,
  nestAdminDeleteSourcePreview,
  nestAdminUpdateNewsSource,
  nestAdminYoutubePollNow,
  type NewsSourceRow,
} from '@/lib/news-editorial-client';
import { API_BASE_URL } from '@/lib/api';
import { nestAuthHeaders } from '@/lib/nest-client';

function SourceMenu({
  source,
  token,
  onChanged,
  onDeleted,
}: {
  source: NewsSourceRow;
  token: string;
  onChanged: () => void;
  onDeleted: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preview, setPreview] = useState<{
    sourceName: string;
    videosCount: number;
    postsCount: number;
    shortsCount: number;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openDelete = async () => {
    setOpen(false);
    const p = await nestAdminDeleteSourcePreview(token, source.id);
    if (p) {
      setPreview(p);
      setConfirmOpen(true);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    const result = await nestAdminDeleteNewsSource(token, source.id);
    setDeleting(false);
    setConfirmOpen(false);
    if (result?.success) {
      onDeleted(
        `Kanál odstraněn. Z portálu bylo odstraněno ${result.videosDeleted} importovaných videí.`,
      );
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
        aria-label="Akce"
      >
        <MoreVertical className="size-4" />
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
            onClick={() => {
              setOpen(false);
              void nestAdminYoutubePollNow(token, source.id).then(onChanged);
            }}
          >
            Synchronizovat nyní
          </button>
          <Link
            href={`/admin/redakce/youtube/${source.id}`}
            className="block px-3 py-2 text-sm hover:bg-zinc-50"
            onClick={() => setOpen(false)}
          >
            Detail kanálu
          </Link>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
            onClick={() => void openDelete()}
          >
            Smazat kanál a obsah
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
            onClick={() => {
              setOpen(false);
              void nestAdminUpdateNewsSource(token, source.id, { enabled: false }).then(onChanged);
            }}
          >
            Vypnout
          </button>
        </div>
      ) : null}
      {confirmOpen && preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-zinc-900">Smazat YouTube zdroj?</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Smazáním YouTube zdroje budou z XXREALIT odstraněna také všechna videa a příspěvky
              importované z tohoto kanálu.
            </p>
            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-500">Kanál</dt>
                <dd className="font-medium">{preview.sourceName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Importovaných videí</dt>
                <dd className="font-medium">{preview.videosCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Příspěvků</dt>
                <dd className="font-medium">{preview.postsCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Shorts položek</dt>
                <dd className="font-medium">{preview.shortsCount}</dd>
              </div>
            </dl>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm"
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
              >
                Zrušit
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                onClick={() => void confirmDelete()}
                disabled={deleting}
              >
                {deleting ? 'Mažu…' : 'Smazat kanál a jeho obsah'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function RedakceYoutubePage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const [sources, setSources] = useState<NewsSourceRow[]>([]);
  const [categories, setCategories] = useState<ContentSourceCategory[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!apiAccessToken || !API_BASE_URL) return;
    setLoading(true);
    const [srcRes, cats] = await Promise.all([
      fetch(`${API_BASE_URL}/admin/news-editorial/sources`, {
        headers: { Accept: 'application/json', ...nestAuthHeaders(apiAccessToken) },
      }),
      nestEditorialCategories(apiAccessToken),
    ]);
    if (srcRes.ok) {
      const rows = (await srcRes.json()) as NewsSourceRow[];
      setSources(rows.filter((s) => s.type === 'YOUTUBE_CHANNEL'));
    }
    if (cats) setCategories(cats);
    setLoading(false);
  }, [apiAccessToken]);

  useEffect(() => {
    if (!isLoading && user?.role !== 'ADMIN') router.replace('/');
  }, [isLoading, user, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return sources.filter((s) => {
      if (search.trim() && !s.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      if (categoryFilter && s.contentCategoryId !== categoryFilter) return false;
      return true;
    });
  }, [sources, search, categoryFilter]);

  const toggle = async (id: string, patch: Parameters<typeof nestAdminUpdateNewsSource>[2]) => {
    if (!apiAccessToken) return;
    await nestAdminUpdateNewsSource(apiAccessToken, id, patch);
    void load();
  };

  if (isLoading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-orange-600" />
      </div>
    );
  }

  return (
    <EditorialCenterShell title="YouTube kanály" subtitle="Automatický import, Shorts a Facebook Reel kompilace.">
      {toast ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {toast}
        </div>
      ) : null}
      <Link
        href="/admin/redakce/youtube/navrh"
        className="inline-flex rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-800 hover:bg-orange-100"
      >
        Návrhy AI →
      </Link>
      <Link
        href="/admin/redakce/youtube/seo"
        className="inline-flex rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
      >
        SEO kvalita videí →
      </Link>
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Hledat kanál…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">Všechny kategorie</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-8 animate-spin text-orange-600" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Kanál</th>
                <th className="px-4 py-3">Kategorie</th>
                <th className="px-4 py-3">Auto import</th>
                <th className="px-4 py-3">Shorts</th>
                <th className="px-4 py-3">Reel</th>
                <th className="px-4 py-3">Poslední sync</th>
                <th className="px-4 py-3">Videa</th>
                <th className="px-4 py-3">Akce</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/admin/redakce/youtube/${s.id}`} className="font-semibold text-zinc-900 hover:text-orange-700">
                      {s.name}
                    </Link>
                    <p className="text-xs text-zinc-500">{s.youtubeChannelTitle || s.url}</p>
                    <div className="mt-1">
                      <StatusDot active={s.enabled} label={s.enabled ? 'Zdroj aktivní' : 'Vypnuto'} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={s.contentCategoryId ?? ''}
                      onChange={(e) =>
                        void toggle(s.id, { contentCategoryId: e.target.value || null })
                      }
                      className="max-w-[10rem] rounded border border-zinc-200 px-2 py-1 text-xs"
                    >
                      <option value="">—</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <label className="flex items-center gap-2" title="XXREALIT pravidelně kontroluje tento YouTube kanál. Jakmile autor zveřejní nové veřejné video, automaticky se importuje do XXREALIT.">
                      <input
                        type="checkbox"
                        checked={s.youtubeAutoImport !== false}
                        onChange={(e) => void toggle(s.id, { youtubeAutoImport: e.target.checked })}
                      />
                      <StatusDot active={s.youtubeAutoImport !== false} label="Auto import" />
                    </label>
                  </td>
                  <td className="px-4 py-3">
                    <label className="flex items-center gap-2" title="Nově importované video se automaticky zařadí do veřejného Shorts feedu.">
                      <input
                        type="checkbox"
                        checked={s.youtubePublishToShorts !== false}
                        onChange={(e) =>
                          void toggle(s.id, { youtubePublishToShorts: e.target.checked })
                        }
                      />
                      <StatusDot active={s.youtubePublishToShorts !== false} label="Shorts" />
                    </label>
                  </td>
                  <td className="px-4 py-3">
                    <label className="flex items-center gap-2" title="Video může být zařazeno do automatických Facebook Reel kompilací.">
                      <input
                        type="checkbox"
                        checked={s.youtubeUseForReel !== false}
                        onChange={(e) => void toggle(s.id, { youtubeUseForReel: e.target.checked })}
                      />
                      <StatusDot active={s.youtubeUseForReel !== false} label="Reel" />
                    </label>
                    <label className="mt-2 flex items-center gap-2 text-xs text-zinc-600">
                      <input
                        type="checkbox"
                        checked={Boolean(s.youtubeFacebookPost)}
                        onChange={(e) =>
                          void toggle(s.id, { youtubeFacebookPost: e.target.checked })
                        }
                      />
                      FB jednotlivě
                    </label>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-600">
                    <div>Kontrola: {s.lastCheckedAt ? new Date(s.lastCheckedAt).toLocaleString('cs-CZ') : '—'}</div>
                    <div>Import: {s.lastAutoImportedAt ? new Date(s.lastAutoImportedAt).toLocaleString('cs-CZ') : '—'}</div>
                    <div>Shorts: {s.lastPublishedToShortsAt ? new Date(s.lastPublishedToShortsAt).toLocaleString('cs-CZ') : '—'}</div>
                  </td>
                  <td className="px-4 py-3">{s.youtubeImportedCount ?? 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700"
                        onClick={() => apiAccessToken && void nestAdminYoutubePollNow(apiAccessToken, s.id).then(load)}
                      >
                        Sync
                      </button>
                      {apiAccessToken ? (
                        <SourceMenu
                          source={s}
                          token={apiAccessToken}
                          onChanged={load}
                          onDeleted={(msg) => {
                            setToast(msg);
                            void load();
                          }}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </EditorialCenterShell>
  );
}
