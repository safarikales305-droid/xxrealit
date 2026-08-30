'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { EditorialCenterShell } from '@/components/admin/redakce/EditorialCenterShell';
import { nestEditorialCategories, type ContentSourceCategory } from '@/lib/editorial-center-client';
import {
  nestAdminApproveYoutubeSuggestion,
  nestAdminBulkApproveYoutubeSuggestions,
  nestAdminGetYoutubeDiscoveryStats,
  nestAdminListYoutubeSuggestions,
  nestAdminRejectYoutubeSuggestion,
  nestAdminRunYoutubeDiscovery,
  type YoutubeDiscoveryRunDiagnostics,
  type YoutubeDiscoveryStats,
  type YoutubeSourceSuggestionRow,
} from '@/lib/news-editorial-client';

type StatusFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
type SortFilter = 'score' | 'newest' | 'activity' | 'videos';

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function scoreLabel(score: number): string {
  if (score >= 60) return 'Doporučený';
  if (score >= 40) return 'Nižší shoda';
  return 'Slabá shoda';
}

export default function YoutubeNavrhPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();

  const [rows, setRows] = useState<YoutubeSourceSuggestionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [categories, setCategories] = useState<ContentSourceCategory[]>([]);
  const [stats, setStats] = useState<YoutubeDiscoveryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [discoveryMessage, setDiscoveryMessage] = useState<string | null>(null);
  const [lastDiagnostics, setLastDiagnostics] = useState<YoutubeDiscoveryRunDiagnostics | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [minScoreFilter, setMinScoreFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [sortFilter, setSortFilter] = useState<SortFilter>('score');
  const [testCategorySlug, setTestCategorySlug] = useState('');

  const pageSize = 30;

  const reload = useCallback(
    async (opts?: { append?: boolean }) => {
      if (!apiAccessToken) return;
      setLoading(true);
      const [list, cats, statRows] = await Promise.all([
        nestAdminListYoutubeSuggestions(apiAccessToken, {
          status: statusFilter === 'ALL' ? undefined : statusFilter,
          categoryId: categoryFilter || undefined,
          minScore: minScoreFilter ? Number.parseInt(minScoreFilter, 10) : undefined,
          search: searchFilter.trim() || undefined,
          sort: sortFilter,
          page,
          pageSize,
        }),
        categories.length ? Promise.resolve(categories) : nestEditorialCategories(apiAccessToken),
        nestAdminGetYoutubeDiscoveryStats(apiAccessToken),
      ]);
      setRows((prev) => (opts?.append ? [...prev, ...list.items] : list.items));
      setTotal(list.total);
      setHasMore(list.hasMore);
      if (!categories.length) setCategories(cats ?? []);
      setStats(statRows);
      setLoading(false);
    },
    [
      apiAccessToken,
      statusFilter,
      categoryFilter,
      minScoreFilter,
      searchFilter,
      sortFilter,
      page,
      categories.length,
    ],
  );

  useEffect(() => {
    if (!isLoading && user?.role !== 'ADMIN') router.replace('/');
  }, [isLoading, user, router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [statusFilter, categoryFilter, minScoreFilter, searchFilter, sortFilter]);

  const allSelected = useMemo(
    () => rows.length > 0 && rows.every((r) => selected.has(r.id)),
    [rows, selected],
  );

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(rows.map((r) => r.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runDiscovery = async (categorySlug?: string) => {
    if (!apiAccessToken) return;
    setDiscoveryBusy(true);
    setDiscoveryMessage('Hledám nové YouTube kanály…');
    setLastDiagnostics(null);
    const result = await nestAdminRunYoutubeDiscovery(apiAccessToken, categorySlug);
    if (!result.ok) {
      setDiscoveryMessage(result.error ?? 'Discovery selhalo.');
    } else {
      setLastDiagnostics(result.diagnostics ?? null);
      const d = result.diagnostics;
      setDiscoveryMessage(
        d
          ? `Discovery dokončeno. Dotazů: ${d.queriesExecuted}, výsledků: ${d.rawResults}, unikátních kanálů: ${d.uniqueChannelIds}, nových kandidátů: ${d.newCandidates}.`
          : 'Discovery dokončeno.',
      );
    }
    setDiscoveryBusy(false);
    setPage(1);
    await reload();
  };

  const approve = async (row: YoutubeSourceSuggestionRow, categoryId?: string) => {
    if (!apiAccessToken) return;
    setBusyId(row.id);
    await nestAdminApproveYoutubeSuggestion(apiAccessToken, row.id, categoryId ?? row.category.id);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(row.id);
      return next;
    });
    await reload();
    setBusyId(null);
  };

  const reject = async (id: string) => {
    if (!apiAccessToken) return;
    setBusyId(id);
    await nestAdminRejectYoutubeSuggestion(apiAccessToken, id);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    await reload();
    setBusyId(null);
  };

  const bulkApprove = async () => {
    if (!apiAccessToken || selected.size === 0) return;
    setBulkBusy(true);
    const ids = [...selected];
    const results = await nestAdminBulkApproveYoutubeSuggestions(apiAccessToken, ids);
    const okCount = results.filter((r) => r.ok).length;
    setDiscoveryMessage(`Hromadně schváleno: ${okCount} z ${ids.length}.`);
    setSelected(new Set());
    await reload();
    setBulkBusy(false);
  };

  if (isLoading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-orange-600" />
      </div>
    );
  }

  return (
    <EditorialCenterShell
      title="Návrhy AI — YouTube kanály"
      subtitle="Schvalte kanály před připojením do importu"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/redakce/youtube" className="text-sm text-orange-700 underline">
          ← YouTube kanály
        </Link>
        <button
          type="button"
          disabled={discoveryBusy}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          onClick={() => void runDiscovery()}
        >
          {discoveryBusy ? 'Probíhá discovery…' : 'Spustit discovery'}
        </button>
      </div>

      {stats ? (
        <section className="mt-4 grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <p className="text-xs text-zinc-500">Nalezeno kandidátů</p>
            <p className="text-lg font-bold text-zinc-900">{stats.total}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Čeká na schválení</p>
            <p className="text-lg font-bold text-orange-700">{stats.pending}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Schváleno</p>
            <p className="text-lg font-bold text-green-700">{stats.approved}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Zamítnuto</p>
            <p className="text-lg font-bold text-zinc-700">{stats.rejected}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Dnes nalezeno</p>
            <p className="text-lg font-bold text-zinc-900">+{stats.foundToday}</p>
          </div>
        </section>
      ) : null}

      <section className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm">
        <p className="font-medium text-zinc-800">
          Discovery: {stats?.discoveryEnabled ? 'AKTIVNÍ' : 'vypnuto'}
        </p>
        <p className="mt-1 text-zinc-600">
          Poslední běh: {formatDateTime(stats?.lastRunAt ?? stats?.lastRun?.startedAt)}
          {stats?.lastRun?.newCandidates != null
            ? ` · nových kandidátů: ${stats.lastRun.newCandidates}`
            : ''}
        </p>
        {discoveryMessage ? (
          <p className="mt-2 rounded-lg bg-white px-3 py-2 text-zinc-800">{discoveryMessage}</p>
        ) : null}
        {lastDiagnostics ? (
          <dl className="mt-3 grid gap-1 text-xs text-zinc-600 sm:grid-cols-2 lg:grid-cols-4">
            <div>Prohledáno dotazů: {lastDiagnostics.queriesExecuted}</div>
            <div>Nalezeno výsledků: {lastDiagnostics.rawResults}</div>
            <div>Unikátních kanálů: {lastDiagnostics.uniqueChannelIds}</div>
            <div>Již existujících zdrojů: {lastDiagnostics.existingSources}</div>
            <div>Již existujících kandidátů: {lastDiagnostics.existingCandidates}</div>
            <div>Nevhodných (skóre): {lastDiagnostics.rejectedByRelevance}</div>
            <div>Duplicit: {lastDiagnostics.duplicates}</div>
            <div>Nových kandidátů: {lastDiagnostics.newCandidates}</div>
            <div>Čeká v DB: {lastDiagnostics.pendingInDb}</div>
            <div>API requestů: {lastDiagnostics.searchRequests}</div>
          </dl>
        ) : null}
      </section>

      <section className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4">
        <label className="text-xs">
          Kategorie
          <select
            className="mt-1 block rounded border border-zinc-300 px-2 py-1.5 text-sm"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">Vše</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Stav
          <select
            className="mt-1 block rounded border border-zinc-300 px-2 py-1.5 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="PENDING">Čeká na schválení</option>
            <option value="APPROVED">Schváleno</option>
            <option value="REJECTED">Zamítnuto</option>
            <option value="ALL">Vše</option>
          </select>
        </label>
        <label className="text-xs">
          Skóre min.
          <select
            className="mt-1 block rounded border border-zinc-300 px-2 py-1.5 text-sm"
            value={minScoreFilter}
            onChange={(e) => setMinScoreFilter(e.target.value)}
          >
            <option value="">Vše</option>
            <option value="60">≥ 60 (doporučený)</option>
            <option value="40">≥ 40 (nižší shoda)</option>
          </select>
        </label>
        <label className="text-xs">
          Řazení
          <select
            className="mt-1 block rounded border border-zinc-300 px-2 py-1.5 text-sm"
            value={sortFilter}
            onChange={(e) => setSortFilter(e.target.value as SortFilter)}
          >
            <option value="score">Nejvyšší shoda</option>
            <option value="newest">Nejnovější</option>
            <option value="activity">Nejaktivnější</option>
            <option value="videos">Nejvíce videí</option>
          </select>
        </label>
        <label className="min-w-[12rem] flex-1 text-xs">
          Hledat
          <input
            type="search"
            placeholder="název kanálu…"
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
        </label>
      </section>

      <section className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-orange-200 bg-orange-50/50 p-4">
        <label className="text-xs">
          Test jedné kategorie
          <select
            className="mt-1 block rounded border border-zinc-300 px-2 py-1.5 text-sm"
            value={testCategorySlug}
            onChange={(e) => setTestCategorySlug(e.target.value)}
          >
            <option value="">Vyberte kategorii…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!testCategorySlug || discoveryBusy}
          className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          onClick={() => void runDiscovery(testCategorySlug)}
        >
          Vyhledat teď
        </button>
      </section>

      {selected.size > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-zinc-600">Vybráno: {selected.size}</span>
          <button
            type="button"
            disabled={bulkBusy}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() => void bulkApprove()}
          >
            Schválit vybrané
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-orange-600" />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
          Žádné návrhy pro zvolené filtry. Spusťte discovery nebo upravte filtry.
        </p>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Vybrat vše na stránce"
            />
            <span>
              Zobrazeno {rows.length} z {total} kandidátů
            </span>
          </div>
          <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <article key={row.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="flex gap-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(row.id)}
                    onChange={() => toggleOne(row.id)}
                    aria-label={`Vybrat ${row.channelTitle}`}
                  />
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
                      Skóre {row.relevanceScore}% · {scoreLabel(row.relevanceScore)}
                      {row.subscriberCount != null
                        ? ` · ${row.subscriberCount.toLocaleString('cs-CZ')} odběratelů`
                        : ''}
                      {row.videoCount != null ? ` · ${row.videoCount} videí` : ''}
                      {row.lastVideoAt
                        ? ` · aktivita ${formatDateTime(row.lastVideoAt)}`
                        : ''}
                    </p>
                  </div>
                </div>
                {row.description ? (
                  <p className="mt-2 line-clamp-3 text-sm text-zinc-600">{row.description}</p>
                ) : null}
                {row.reason ? <p className="mt-2 text-xs text-zinc-500">{row.reason}</p> : null}
                {row.status === 'PENDING' ? (
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
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {row.status === 'PENDING' ? (
                    <>
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
                    </>
                  ) : null}
                  <a
                    href={row.channelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
                  >
                    YouTube <ExternalLink className="size-3.5" />
                  </a>
                </div>
              </article>
            ))}
          </div>
          {hasMore ? (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium"
                onClick={() => {
                  const nextPage = page + 1;
                  setPage(nextPage);
                  if (!apiAccessToken) return;
                  setLoading(true);
                  void nestAdminListYoutubeSuggestions(apiAccessToken, {
                    status: statusFilter === 'ALL' ? undefined : statusFilter,
                    categoryId: categoryFilter || undefined,
                    minScore: minScoreFilter ? Number.parseInt(minScoreFilter, 10) : undefined,
                    search: searchFilter.trim() || undefined,
                    sort: sortFilter,
                    page: nextPage,
                    pageSize,
                  }).then((list) => {
                    setRows((prev) => [...prev, ...list.items]);
                    setTotal(list.total);
                    setHasMore(list.hasMore);
                    setLoading(false);
                  });
                }}
              >
                Načíst další
              </button>
            </div>
          ) : null}
        </>
      )}
    </EditorialCenterShell>
  );
}
