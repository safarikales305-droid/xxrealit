'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { EditorialCenterShell } from '@/components/admin/redakce/EditorialCenterShell';
import {
  nestAdminGetYoutubePostSeo,
  nestAdminListYoutubePostsSeo,
  nestAdminPatchYoutubePostSeo,
  type YoutubePostSeoDetail,
  type YoutubePostSeoRow,
} from '@/lib/news-editorial-client';

function badgeClass(score: number): string {
  if (score >= 90) return 'bg-green-100 text-green-800';
  if (score >= 75) return 'bg-emerald-100 text-emerald-800';
  if (score >= 50) return 'bg-amber-100 text-amber-900';
  return 'bg-zinc-200 text-zinc-700';
}

function modeLabel(mode: string): string {
  if (mode === 'ARTICLE_FEATURE') return 'SEO ARTICLE';
  if (mode === 'POST_AND_SHORTS') return 'POST + SHORTS';
  return 'SHORTS ONLY';
}

export default function YoutubeSeoPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const [rows, setRows] = useState<YoutubePostSeoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<YoutubePostSeoDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [contentMode, setContentMode] = useState('');
  const [minScore, setMinScore] = useState('');
  const [indexable, setIndexable] = useState('');
  const [search, setSearch] = useState('');

  const reload = useCallback(async () => {
    if (!apiAccessToken) return;
    setLoading(true);
    const data = await nestAdminListYoutubePostsSeo(apiAccessToken, {
      contentMode: contentMode || undefined,
      minScore: minScore ? Number.parseInt(minScore, 10) : undefined,
      indexable: indexable === 'true' ? true : indexable === 'false' ? false : undefined,
      search: search.trim() || undefined,
      pageSize: 40,
    });
    setRows(data.items);
    setTotal(data.total);
    setLoading(false);
  }, [apiAccessToken, contentMode, minScore, indexable, search]);

  useEffect(() => {
    if (!isLoading && user?.role !== 'ADMIN') router.replace('/');
  }, [isLoading, user, router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openPreview = async (id: string) => {
    if (!apiAccessToken) return;
    setPreviewLoading(true);
    const detail = await nestAdminGetYoutubePostSeo(apiAccessToken, id);
    setPreview(detail);
    setPreviewLoading(false);
  };

  const patchMode = async (id: string, patch: { contentMode?: string; isIndexable?: boolean }) => {
    if (!apiAccessToken) return;
    await nestAdminPatchYoutubePostSeo(apiAccessToken, id, patch);
    await reload();
    if (preview?.id === id) await openPreview(id);
  };

  if (isLoading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-orange-600" />
      </div>
    );
  }

  return (
    <EditorialCenterShell title="YouTube SEO kvalita" subtitle="Quality gate pro importovaná videa">
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/admin/redakce/youtube" className="text-orange-700 underline">
          ← YouTube kanály
        </Link>
        <Link href="/admin/redakce/youtube/navrh" className="text-orange-700 underline">
          Návrhy kanálů
        </Link>
      </div>

      <section className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4">
        <label className="text-xs">
          Režim
          <select className="mt-1 block rounded border px-2 py-1.5 text-sm" value={contentMode} onChange={(e) => setContentMode(e.target.value)}>
            <option value="">Vše</option>
            <option value="SHORTS_ONLY">Shorts only</option>
            <option value="POST_AND_SHORTS">Post + Shorts</option>
            <option value="ARTICLE_FEATURE">SEO article</option>
          </select>
        </label>
        <label className="text-xs">
          Min. skóre
          <input type="number" min={0} max={100} className="mt-1 block w-20 rounded border px-2 py-1.5 text-sm" value={minScore} onChange={(e) => setMinScore(e.target.value)} />
        </label>
        <label className="text-xs">
          Index
          <select className="mt-1 block rounded border px-2 py-1.5 text-sm" value={indexable} onChange={(e) => setIndexable(e.target.value)}>
            <option value="">Vše</option>
            <option value="true">Index</option>
            <option value="false">Noindex</option>
          </select>
        </label>
        <label className="min-w-[12rem] flex-1 text-xs">
          Hledat
          <input type="search" className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="název kanálu / video…" />
        </label>
      </section>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-orange-600" />
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-600">Zobrazeno {rows.length} z {total} videí</p>
      )}

      <div className="mt-3 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <article key={row.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex gap-3">
              {row.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.thumbnailUrl} alt="" className="size-16 rounded-lg object-cover" />
              ) : (
                <div className="size-16 rounded-lg bg-zinc-200" />
              )}
              <div className="min-w-0 flex-1">
                <h2 className="line-clamp-2 font-semibold text-zinc-900">{row.title}</h2>
                <p className="text-xs text-zinc-500">{row.channelTitle}</p>
                <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-semibold ${badgeClass(row.seoQualityScore)}`}>
                  {row.badge} · {row.seoQualityScore}/100
                </span>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-1 text-xs text-zinc-600">
              <div>Stav: {modeLabel(row.contentMode)}</div>
              <div>SEO: {row.isIndexable ? 'INDEX' : 'NOINDEX'}</div>
              <div>Kategorie: {row.source?.category ?? '—'}</div>
              <div>Lokalita: {row.location ?? '—'}</div>
              <div>Text: {row.wordCount} slov</div>
              <div>Odkazy: {row.internalLinksCount}</div>
              <div>Related: {row.relatedCount}</div>
              <div>Téma: {row.topicCluster ?? '—'}</div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => void openPreview(row.id)}>
                Náhled SEO
              </button>
              <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => void patchMode(row.id, { isIndexable: !row.isIndexable })}>
                Index {row.isIndexable ? 'OFF' : 'ON'}
              </button>
              {row.slug ? (
                <a href={`/prispevek/${row.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs">
                  Stránka <ExternalLink className="size-3" />
                </a>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {(previewLoading || preview) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            {previewLoading ? (
              <Loader2 className="mx-auto size-8 animate-spin text-orange-600" />
            ) : preview ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-bold">Náhled SEO stránky</h3>
                  <button type="button" className="text-sm text-zinc-500" onClick={() => setPreview(null)}>
                    Zavřít
                  </button>
                </div>
                <p className="mt-2 text-sm text-zinc-600">
                  Skóre {preview.seoQualityScore}/100 · {preview.badge} · {modeLabel(preview.contentMode)}
                </p>
                <div className="mt-4 space-y-3 text-sm">
                  <div>
                    <p className="text-xs font-semibold text-zinc-500">H1</p>
                    <p>{preview.h1 ?? preview.title}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-500">Perex</p>
                    <p>{preview.perex}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-500">SEO title / description</p>
                    <p>{preview.seoTitle}</p>
                    <p className="text-zinc-600">{preview.seoDescription}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-500">Text ({preview.wordCount} slov)</p>
                    <p className="line-clamp-6 whitespace-pre-wrap text-zinc-700">{preview.bodyMarkdown}</p>
                  </div>
                </div>
                <ul className="mt-4 space-y-1 text-sm">
                  {preview.checks.map((c) => (
                    <li key={c.id} className={c.pass ? 'text-green-700' : 'text-red-700'}>
                      [{c.pass ? 'PASS' : 'FAIL'}] {c.label}
                      {c.detail ? ` — ${c.detail}` : ''}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  <select
                    className="rounded border px-2 py-1 text-sm"
                    value={preview.contentMode}
                    onChange={(e) => void patchMode(preview.id, { contentMode: e.target.value })}
                  >
                    <option value="SHORTS_ONLY">Shorts only</option>
                    <option value="POST_AND_SHORTS">Post + Shorts</option>
                    <option value="ARTICLE_FEATURE">SEO article</option>
                  </select>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </EditorialCenterShell>
  );
}
