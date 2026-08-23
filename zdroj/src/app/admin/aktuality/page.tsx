'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  DASHBOARD_STAT_LABELS,
  NEWS_ARTICLE_CATEGORIES,
  nestAdminBackfillNewsImages,
  nestAdminBackfillNewsPosts,
  nestAdminBackfillBadArticles,
  nestAdminCreateNewsFromUrl,
  nestAdminCreateNewsSource,
  nestAdminDeleteNewsSource,
  nestAdminNewsArticles,
  nestAdminNewsAuditLog,
  nestAdminNewsDashboard,
  nestAdminNewsSettings,
  nestAdminNewsSources,
  nestAdminNewsWorker,
  nestAdminNewsAutomationDiagnostics,
  nestAdminTestAutoPublish,
  nestAdminPublishNewsArticle,
  nestAdminRegenerateNewsArticle,
  nestAdminRejectNewsArticle,
  nestAdminRunNewsFetch,
  nestAdminTestNewsImportOne,
  nestAdminTestNewsPipeline,
  nestAdminTestNewsRss,
  nestAdminTestYoutubeChannel,
  nestAdminTestYoutubeImportOne,
  nestAdminTestYoutubePipeline,
  nestAdminYoutubeBackfill,
  nestAdminYoutubeDiagnose,
  nestAdminYoutubeStatus,
  nestAdminTestYoutubeApi,
  nestAdminYoutubePollNow,
  nestAdminSyncNewsPortalPost,
  nestAdminRepublishNewsFacebook,
  nestAdminUpdateNewsArticle,
  nestAdminUpdateNewsSettings,
  nestAdminUpdateNewsSource,
  newsCategoryLabel,
  newsStatusLabel,
  newsWaitReasonLabel,
  type NewsArticleRow,
  type NewsAuditLogRow,
  type NewsAutomationDiagnostics,
  type NewsAutomationSettings,
  type NewsDashboardStats,
  type NewsSourceRow,
  type NewsSourceType,
  type NewsYoutubePublishMode,
  type NewsWorkerStatus,
  type NewsRssTestResponse,
  type NewsRssImportTestResponse,
  type YoutubeChannelTestResponse,
  type YoutubeImportTestResponse,
  type YoutubeDiagnoseResponse,
  type YoutubeBackfillResponse,
  type YoutubeAdminStatus,
  type YoutubeApiTestResponse,
} from '@/lib/news-editorial-client';

type Tab =
  | 'dashboard'
  | 'sources'
  | 'ai'
  | 'pending'
  | 'published'
  | 'categories'
  | 'automation'
  | 'seo'
  | 'settings'
  | 'history';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'sources', label: 'Zdroje' },
  { key: 'ai', label: 'AI redakce' },
  { key: 'pending', label: 'Čeká na publikaci' },
  { key: 'published', label: 'Publikované' },
  { key: 'categories', label: 'Kategorie' },
  { key: 'automation', label: 'Automatizace' },
  { key: 'seo', label: 'SEO' },
  { key: 'settings', label: 'Nastavení' },
  { key: 'history', label: 'Historie' },
];

const SOURCE_TYPE_LABELS: Record<NewsSourceType, string> = {
  RSS: 'RSS',
  ATOM: 'ATOM',
  API: 'API',
  OPEN_DATA: 'Open data',
  WEB_SOURCE: 'Web zdroj',
  YOUTUBE_CHANNEL: 'YouTube kanál',
};

const SOURCE_TYPES: NewsSourceType[] = ['RSS', 'ATOM', 'API', 'OPEN_DATA', 'WEB_SOURCE', 'YOUTUBE_CHANNEL'];

function sourceTypeLabel(type: NewsSourceType): string {
  if (type === 'YOUTUBE_CHANNEL') return 'YOUTUBE';
  return SOURCE_TYPE_LABELS[type] ?? type;
}

function isStaleYoutubeApiKeyError(message?: string | null): boolean {
  if (!message?.trim()) return false;
  return /YOUTUBE_API_KEY|API key chybí|API key není/i.test(message);
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('cs-CZ');
}

function ScoreBadge({ value, label }: { value?: number | null; label: string }) {
  if (value == null) return null;
  const tone =
    value >= 80 ? 'bg-emerald-100 text-emerald-800' : value >= 60 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`} title={label}>
      {label}: {value}
    </span>
  );
}

export default function AdminAktualityPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [tab, setTab] = useState<Tab>('dashboard');
  const [msg, setMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [dashboardStats, setDashboardStats] = useState<NewsDashboardStats | null>(null);
  const [moduleEnabled, setModuleEnabled] = useState(true);
  const [sources, setSources] = useState<NewsSourceRow[]>([]);
  const [settings, setSettings] = useState<NewsAutomationSettings | null>(null);
  const [worker, setWorker] = useState<NewsWorkerStatus | null>(null);
  const [automationDiag, setAutomationDiag] = useState<NewsAutomationDiagnostics | null>(null);
  const [autoPublishTest, setAutoPublishTest] = useState<string | null>(null);
  const [draftArticles, setDraftArticles] = useState<NewsArticleRow[]>([]);
  const [pendingArticles, setPendingArticles] = useState<NewsArticleRow[]>([]);
  const [publishedArticles, setPublishedArticles] = useState<NewsArticleRow[]>([]);
  const [auditLog, setAuditLog] = useState<NewsAuditLogRow[]>([]);

  const [sourceForm, setSourceForm] = useState({
    name: '',
    url: '',
    type: 'RSS' as NewsSourceType,
    category: 'reality',
    enabled: true,
    trustScore: 70,
    priority: 50,
    checkIntervalMinutes: 60,
    note: '',
    channelId: '',
    youtubePublishMode: 'RELEVANT_ONLY' as NewsYoutubePublishMode,
    youtubeCreatePost: true,
    youtubeFacebookPost: false,
    minRelevanceScore: 70,
  });

  const [importUrl, setImportUrl] = useState('');
  const [rejectModal, setRejectModal] = useState<{ id: string; title: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('Nerelevantní pro portál');
  const [rssTestResult, setRssTestResult] = useState<
    (NewsRssTestResponse | NewsRssImportTestResponse | YoutubeChannelTestResponse | YoutubeImportTestResponse | YoutubeDiagnoseResponse | YoutubeBackfillResponse) | null
  >(null);
  const [rssTestSourceName, setRssTestSourceName] = useState<string | null>(null);
  const [youtubeStatus, setYoutubeStatus] = useState<YoutubeAdminStatus | null>(null);
  const [youtubeApiTest, setYoutubeApiTest] = useState<YoutubeApiTestResponse | null>(null);
  const [backfillModal, setBackfillModal] = useState<{ sourceId: string; name: string } | null>(null);
  const [backfillCount, setBackfillCount] = useState(10);
  const [backfillIgnoreRelevance, setBackfillIgnoreRelevance] = useState(false);

  const refreshDashboard = useCallback(async () => {
    if (!token) return;
    const dash = await nestAdminNewsDashboard(token);
    if (dash) {
      setDashboardStats(dash.stats);
      setModuleEnabled(dash.enabled);
      setSettings(dash.settings);
    }
  }, [token]);

  const refreshSources = useCallback(async () => {
    if (!token) return;
    const [rows, ytStatus] = await Promise.all([
      nestAdminNewsSources(token),
      nestAdminYoutubeStatus(token),
    ]);
    setSources(rows ?? []);
    setYoutubeStatus(ytStatus);
  }, [token]);

  const refreshSettings = useCallback(async () => {
    if (!token) return;
    const s = await nestAdminNewsSettings(token);
    if (s) setSettings(s);
  }, [token]);

  const refreshWorker = useCallback(async () => {
    if (!token) return;
    const [w, diag] = await Promise.all([
      nestAdminNewsWorker(token),
      nestAdminNewsAutomationDiagnostics(token),
    ]);
    setWorker(w);
    setAutomationDiag(diag);
  }, [token]);

  const refreshArticles = useCallback(async () => {
    if (!token) return;
    const [drafts, pending, published] = await Promise.all([
      nestAdminNewsArticles(token, { status: 'DRAFT', limit: 50 }),
      nestAdminNewsArticles(token, { limit: 50 }),
      nestAdminNewsArticles(token, { status: 'PUBLISHED', limit: 50 }),
    ]);
    setDraftArticles(drafts?.items ?? []);
    const pendingItems = (pending?.items ?? []).filter((a) =>
      ['DRAFT', 'REVIEW', 'SCHEDULED'].includes(a.status),
    );
    setPendingArticles(pendingItems);
    setPublishedArticles(published?.items ?? []);
  }, [token]);

  const refreshAudit = useCallback(async () => {
    if (!token) return;
    const rows = await nestAdminNewsAuditLog(token, { limit: 100 });
    setAuditLog(rows ?? []);
  }, [token]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshDashboard(),
      refreshSources(),
      refreshSettings(),
      refreshWorker(),
      refreshArticles(),
      refreshAudit(),
    ]);
  }, [refreshDashboard, refreshSources, refreshSettings, refreshWorker, refreshArticles, refreshAudit]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void refreshAll();
  }, [token, user, refreshAll]);

  const seoStats = useMemo(() => {
    const published = publishedArticles.length;
    const indexable = publishedArticles.filter((a) => a.indexable !== false).length;
    const avgSeo =
      publishedArticles.length > 0
        ? Math.round(
            publishedArticles.reduce((sum, a) => sum + (a.seoScore ?? 0), 0) / publishedArticles.length,
          )
        : 0;
    return { published, indexable, avgSeo };
  }, [publishedArticles]);

  async function handleCreateSource(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setErrMsg(null);
    const created = await nestAdminCreateNewsSource(token, {
      ...sourceForm,
      note: sourceForm.note.trim() || undefined,
      channelId: sourceForm.channelId.trim() || undefined,
      minRelevanceScore: sourceForm.minRelevanceScore,
    });
    setBusy(false);
    if (!created) {
      setErrMsg('Zdroj se nepodařilo vytvořit.');
      return;
    }
    setMsg(`Zdroj „${created.name}" přidán.`);
    setSourceForm((f) => ({ ...f, name: '', url: '', note: '' }));
    void refreshSources();
  }

  async function handleImportUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !importUrl.trim()) return;
    setBusy(true);
    setErrMsg(null);
    const res = await nestAdminCreateNewsFromUrl(token, importUrl.trim());
    setBusy(false);
    if (!res.ok) {
      setErrMsg(res.message);
      return;
    }
    setMsg(`Článek vytvořen: ${res.data.title}`);
    setImportUrl('');
    void refreshArticles();
    setTab('ai');
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !settings) return;
    setBusy(true);
    const updated = await nestAdminUpdateNewsSettings(token, settings);
    setBusy(false);
    if (!updated) {
      setErrMsg('Nastavení se nepodařilo uložit.');
      return;
    }
    setSettings(updated);
    setMsg('Nastavení aktualit uloženo.');
  }

  async function handlePublish(id: string) {
    if (!token) return;
    setBusy(true);
    const res = await nestAdminPublishNewsArticle(token, id);
    setBusy(false);
    if (!res.ok) {
      setErrMsg(res.message);
      return;
    }
    setMsg(`Publikováno: ${res.data.title}`);
    void refreshAll();
  }

  async function handleReject() {
    if (!token || !rejectModal) return;
    setBusy(true);
    const res = await nestAdminRejectNewsArticle(token, rejectModal.id, rejectReason);
    setBusy(false);
    if (!res) {
      setErrMsg('Zamítnutí selhalo.');
      return;
    }
    setMsg(`Zamítnuto: ${rejectModal.title}`);
    setRejectModal(null);
    void refreshAll();
  }

  async function handleRegenerate(id: string) {
    if (!token) return;
    setBusy(true);
    const res = await nestAdminRegenerateNewsArticle(token, id);
    setBusy(false);
    if (!res) {
      setErrMsg('Regenerace selhala.');
      return;
    }
    setMsg('Článek regenerován.');
    void refreshArticles();
  }

  async function handleRunFetch() {
    if (!token) return;
    setBusy(true);
    const res = await nestAdminRunNewsFetch(token);
    setBusy(false);
    if (!res) {
      setErrMsg('Fetch zdrojů selhal.');
      return;
    }
    setMsg(`Fetch dokončen (${res.results.length} zdrojů).`);
    void refreshAll();
  }

  function renderArticleTable(
    items: NewsArticleRow[],
    actions: 'draft' | 'pending' | 'published',
  ) {
    if (items.length === 0) {
      return <p className="text-sm text-zinc-500">Žádné články k zobrazení.</p>;
    }
    const pendingCols = actions === 'pending';
    return (
      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3">Titulek</th>
              <th className="px-4 py-3">Kategorie</th>
              <th className="px-4 py-3">Skóre</th>
              {pendingCols ? <th className="px-4 py-3">Obrázek</th> : null}
              {pendingCols ? <th className="px-4 py-3">Důvod čekání</th> : null}
              <th className="px-4 py-3">Stav</th>
              <th className="px-4 py-3">Aktualizováno</th>
              <th className="px-4 py-3">Akce</th>
            </tr>
          </thead>
          <tbody>
            {items.map((article) => (
              <tr key={article.id} className="border-b border-zinc-50 align-top">
                <td className="px-4 py-3">
                  <p className="font-medium text-zinc-900">{article.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{article.perex}</p>
                </td>
                <td className="px-4 py-3 text-zinc-600">{newsCategoryLabel(article.category)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <ScoreBadge value={article.qualityScore} label="Kvalita" />
                    <ScoreBadge value={article.seoScore} label="SEO" />
                    <ScoreBadge value={article.relevanceScore} label="Relevance" />
                    {pendingCols ? (
                      <ScoreBadge value={article.languageQualityScore} label="Jazyk" />
                    ) : null}
                  </div>
                </td>
                {pendingCols ? (
                  <td className="px-4 py-3 text-center text-lg">
                    {article.ogImageUrl ? '✅' : '❌'}
                  </td>
                ) : null}
                {pendingCols ? (
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                      {newsWaitReasonLabel(article.waitReason)}
                    </span>
                  </td>
                ) : null}
                <td className="px-4 py-3">
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                    {newsStatusLabel(article.status)}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-zinc-500">{formatDate(article.updatedAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {article.status === 'PUBLISHED' && article.slug ? (
                      <Link
                        href={`/aktuality/${article.slug}`}
                        target="_blank"
                        className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                      >
                        Náhled
                      </Link>
                    ) : null}
                    {(actions === 'draft' || actions === 'pending') && article.slug ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handlePublish(article.id)}
                        className="rounded-lg bg-orange-600 px-2 py-1 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
                      >
                        Publikovat
                      </button>
                    ) : null}
                    {(actions === 'draft' || actions === 'pending') ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleRegenerate(article.id)}
                          className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
                        >
                          Regenerovat
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setRejectModal({ id: article.id, title: article.title })}
                          className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          Zamítnout
                        </button>
                      </>
                    ) : null}
                    {actions === 'published' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          if (!token) return;
                          await nestAdminUpdateNewsArticle(token, article.id, {
                            indexable: !article.indexable,
                            robots: article.indexable ? 'noindex,nofollow' : 'index,follow',
                          });
                          void refreshArticles();
                        }}
                        className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                      >
                        {article.indexable ? 'Noindex' : 'Indexovat'}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!token || user?.role !== 'ADMIN') return null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold">Aktuality — AI redakce</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Automatické zpravodajství z realitního trhu.{' '}
          <Link href="/aktuality" className="font-semibold text-orange-700 hover:underline">
            Veřejný výpis →
          </Link>
        </p>
        {!moduleEnabled ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Modul je na backendu vypnutý (NEWS_EDITORIAL_ENABLED=false).
          </p>
        ) : null}
      </header>

      <nav className="flex flex-wrap gap-2">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === key ? 'bg-zinc-900 text-white' : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {msg ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{msg}</p>
      ) : null}
      {errMsg ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{errMsg}</p>
      ) : null}

      {tab === 'dashboard' && dashboardStats ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.entries(dashboardStats) as Array<[keyof NewsDashboardStats, number]>).map(
            ([key, value]) => (
              <div key={key} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  {DASHBOARD_STAT_LABELS[key]}
                </p>
                <p className="mt-1 text-2xl font-bold text-zinc-900">{value}</p>
              </div>
            ),
          )}
        </section>
      ) : null}

      {tab === 'sources' ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-red-200 bg-red-50/50 p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-red-950">YouTube API</h2>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (!token) return;
                  setBusy(true);
                  setErrMsg(null);
                  const res = await nestAdminTestYoutubeApi(token);
                  setBusy(false);
                  if (!res.ok) {
                    setErrMsg(res.message);
                    return;
                  }
                  setYoutubeApiTest(res.data);
                  void refreshSources();
                }}
                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-900 hover:bg-red-100"
              >
                Otestovat YouTube API
              </button>
            </div>
            {youtubeStatus ? (
              <div className="mt-3 grid gap-2 text-sm text-red-950 sm:grid-cols-2 lg:grid-cols-4">
                <p>
                  API:{' '}
                  <strong>
                    {youtubeStatus.apiConfigured ? 'Configured' : 'Missing'}
                  </strong>
                </p>
                <p>
                  API test:{' '}
                  <strong>
                    {youtubeApiTest?.ok
                      ? 'OK'
                      : youtubeStatus.apiTestStatus === 'OK'
                        ? 'OK'
                        : youtubeApiTest
                          ? 'ERROR'
                          : '—'}
                  </strong>
                </p>
                <p>
                  Worker:{' '}
                  <strong>{youtubeStatus.workerRunning ? 'Running' : 'Stopped'}</strong>
                </p>
                <p>Čeká na kontrolu: {youtubeStatus.sourcesDueForPoll ?? youtubeStatus.queueCount}</p>
                <p>Aktivní zdroje: {youtubeStatus.activeSources}</p>
                <p>Last check: {formatDate(youtubeStatus.lastCheck)}</p>
                <p>Last successful check: {formatDate(youtubeStatus.lastSuccessfulCheck)}</p>
                <p>Importováno celkem: {youtubeStatus.totalImported}</p>
                {youtubeApiTest ? (
                  <>
                    <p>HTTP: {youtubeApiTest.httpStatus}</p>
                    <p>Response time: {youtubeApiTest.responseTimeMs} ms</p>
                    {youtubeApiTest.error ? (
                      <p className="text-red-800 sm:col-span-2">{youtubeApiTest.error}</p>
                    ) : null}
                  </>
                ) : null}
                {youtubeStatus.currentError ? (
                  <p className="text-red-800 sm:col-span-2 lg:col-span-4">
                    Aktuální chyba: {youtubeStatus.currentError}
                  </p>
                ) : null}
                {!youtubeStatus.apiConfigured ? (
                  <p className="font-semibold text-red-800 sm:col-span-2 lg:col-span-4">
                    YouTube API není nakonfigurováno. Nastavte YOUTUBE_API_KEY na serveru.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-sm text-red-900">Načítám stav…</p>
            )}
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Přidat zdroj</h2>
            <form onSubmit={(e) => void handleCreateSource(e)} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <input
                required
                value={sourceForm.name}
                onChange={(e) => setSourceForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Název zdroje"
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              />
              <input
                required
                type="url"
                value={sourceForm.url}
                onChange={(e) => setSourceForm((f) => ({ ...f, url: e.target.value }))}
                placeholder={sourceForm.type === 'YOUTUBE_CHANNEL' ? 'https://www.youtube.com/@...' : 'URL feedu'}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2"
              />
              {sourceForm.type === 'YOUTUBE_CHANNEL' ? (
                <>
                  <input
                    value={sourceForm.channelId}
                    onChange={(e) => setSourceForm((f) => ({ ...f, channelId: e.target.value }))}
                    placeholder="Channel ID (UC…, volitelné)"
                    className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <select
                    value={sourceForm.youtubePublishMode}
                    onChange={(e) =>
                      setSourceForm((f) => ({
                        ...f,
                        youtubePublishMode: e.target.value as NewsYoutubePublishMode,
                      }))
                    }
                    className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  >
                    <option value="RELEVANT_ONLY">Pouze relevantní (AI)</option>
                    <option value="ALL">Všechna nová videa</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={sourceForm.minRelevanceScore}
                    onChange={(e) =>
                      setSourceForm((f) => ({ ...f, minRelevanceScore: Number(e.target.value) }))
                    }
                    placeholder="Min. relevance"
                    className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={sourceForm.youtubeCreatePost}
                      onChange={(e) =>
                        setSourceForm((f) => ({ ...f, youtubeCreatePost: e.target.checked }))
                      }
                    />
                    Automaticky vytvořit příspěvek
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={sourceForm.youtubeFacebookPost}
                      onChange={(e) =>
                        setSourceForm((f) => ({ ...f, youtubeFacebookPost: e.target.checked }))
                      }
                    />
                    Publikovat na Facebook
                  </label>
                </>
              ) : null}
              <select
                value={sourceForm.type}
                onChange={(e) => setSourceForm((f) => ({ ...f, type: e.target.value as NewsSourceType }))}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              >
                {SOURCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SOURCE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <select
                value={sourceForm.category}
                onChange={(e) => setSourceForm((f) => ({ ...f, category: e.target.value }))}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              >
                {NEWS_ARTICLE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                max={100}
                value={sourceForm.trustScore}
                onChange={(e) => setSourceForm((f) => ({ ...f, trustScore: Number(e.target.value) }))}
                placeholder="Trust score"
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sourceForm.enabled}
                  onChange={(e) => setSourceForm((f) => ({ ...f, enabled: e.target.checked }))}
                />
                Aktivní
              </label>
              <textarea
                value={sourceForm.note}
                onChange={(e) => setSourceForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Poznámka"
                rows={2}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2 lg:col-span-3"
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50 sm:col-span-2 lg:col-span-1"
              >
                {busy
                  ? 'Ukládám…'
                  : sourceForm.type === 'YOUTUBE_CHANNEL'
                    ? 'Přidat YouTube kanál'
                    : 'Přidat zdroj'}
              </button>
            </form>
          </section>

          <section className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-3">Zdroj</th>
                  <th className="px-4 py-3">Typ</th>
                  <th className="px-4 py-3">Stav</th>
                  <th className="px-4 py-3">Dnes / celkem</th>
                  <th className="px-4 py-3">Akce</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr key={source.id} className="border-b border-zinc-50 align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium">{source.name}</p>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-orange-700 hover:underline"
                      >
                        {source.url}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{sourceTypeLabel(source.type)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          source.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600'
                        }`}
                      >
                        {source.enabled ? 'Aktivní' : 'Vypnuto'}
                      </span>
                      <p className="mt-1 text-xs text-zinc-500">{source.health}</p>
                      {source.lastError &&
                      !(youtubeStatus?.apiConfigured && isStaleYoutubeApiKeyError(source.lastError)) ? (
                        <p className="mt-1 text-xs text-red-700">{source.lastError}</p>
                      ) : null}
                      {source.channelId ? (
                        <p className="mt-1 text-xs text-zinc-500">Channel ID: {source.channelId}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-600">
                      {source.type === 'YOUTUBE_CHANNEL' ? (
                        <>
                          <span>Importováno: {source.youtubeImportedCount ?? 0}</span>
                          <span className="block">Kontrola: {formatDate(source.lastCheckedAt)}</span>
                          {source.lastVideoId ? (
                            <span className="block truncate">Poslední video: {source.lastVideoId}</span>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {source.stats.itemsToday} / {source.stats.itemsTotal}
                          {source.stats.duplicatesToday > 0 ? (
                            <span className="block text-amber-600">{source.stats.duplicatesToday} duplicit</span>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(source.type === 'RSS' || source.type === 'ATOM') ? (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                if (!token) return;
                                setBusy(true);
                                setErrMsg(null);
                                const res = await nestAdminTestNewsRss(token, source.id);
                                setBusy(false);
                                if (!res.ok) {
                                  setErrMsg(res.message);
                                  return;
                                }
                                setRssTestSourceName(source.name);
                                setRssTestResult(res.data);
                              }}
                              className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800"
                            >
                              Otestovat RSS ze serveru
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                if (!token) return;
                                setBusy(true);
                                setErrMsg(null);
                                const res = await nestAdminTestNewsImportOne(token, source.id);
                                setBusy(false);
                                if (!res.ok) {
                                  setErrMsg(res.message);
                                  return;
                                }
                                setRssTestSourceName(source.name);
                                setRssTestResult(res.data);
                                void refreshArticles();
                              }}
                              className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-800"
                            >
                              Test + import 1
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                if (!token) return;
                                setBusy(true);
                                setErrMsg(null);
                                const res = await nestAdminTestNewsPipeline(token, source.id);
                                setBusy(false);
                                if (!res.ok) {
                                  setErrMsg(res.message);
                                  return;
                                }
                                setRssTestSourceName(source.name);
                                setRssTestResult(res.data);
                                void refreshArticles();
                              }}
                              className="rounded-lg border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-800"
                            >
                              Test pipeline
                            </button>
                          </>
                        ) : null}
                        {source.type === 'YOUTUBE_CHANNEL' ? (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                if (!token) return;
                                setBusy(true);
                                setErrMsg(null);
                                const res = await nestAdminTestYoutubeChannel(token, source.id);
                                setBusy(false);
                                if (!res.ok) {
                                  setErrMsg(res.message);
                                  return;
                                }
                                setRssTestSourceName(source.name);
                                setRssTestResult(res.data);
                              }}
                              className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-800"
                            >
                              Otestovat YouTube kanál
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                if (!token) return;
                                setBusy(true);
                                setErrMsg(null);
                                const res = await nestAdminYoutubePollNow(token, source.id, {
                                  maxVideos: 5,
                                  ignoreRelevance: true,
                                });
                                setBusy(false);
                                if (!res.ok) {
                                  setErrMsg(res.message);
                                  return;
                                }
                                setMsg(
                                  `Kontrola: ${res.data.created} importováno, ${res.data.skipped} přeskočeno`,
                                );
                                void refreshSources();
                                void refreshArticles();
                              }}
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-900"
                            >
                              Spustit kontrolu nyní
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                if (!token) return;
                                setBusy(true);
                                setErrMsg(null);
                                const res = await nestAdminTestYoutubeImportOne(token, source.id);
                                setBusy(false);
                                if (!res.ok) {
                                  setErrMsg(res.message);
                                  return;
                                }
                                setRssTestSourceName(source.name);
                                setRssTestResult(res.data);
                                void refreshArticles();
                              }}
                              className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-800"
                            >
                              Importovat poslední 1 video
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                if (!token) return;
                                setBusy(true);
                                const res = await nestAdminTestYoutubePipeline(token, source.id);
                                setBusy(false);
                                if (!res.ok) {
                                  setErrMsg(res.message);
                                  return;
                                }
                                setRssTestSourceName(source.name);
                                setRssTestResult(res.data);
                              }}
                              className="rounded-lg border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-800"
                            >
                              Test YouTube pipeline
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                if (!token) return;
                                setBusy(true);
                                setErrMsg(null);
                                const res = await nestAdminYoutubeDiagnose(token, source.id);
                                setBusy(false);
                                if (!res.ok) {
                                  setErrMsg(res.message);
                                  return;
                                }
                                setRssTestSourceName(`Diagnostika – ${source.name}`);
                                setRssTestResult(res.data);
                                void refreshSources();
                              }}
                              className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900"
                            >
                              Diagnostika
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setBackfillModal({ sourceId: source.id, name: source.name });
                                setBackfillCount(10);
                                setBackfillIgnoreRelevance(false);
                              }}
                              className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-semibold"
                            >
                              Importovat posledních X
                            </button>
                          </>
                        ) : null}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            if (!token) return;
                            await nestAdminUpdateNewsSource(token, source.id, { enabled: !source.enabled });
                            void refreshSources();
                          }}
                          className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-semibold hover:bg-zinc-50"
                        >
                          {source.enabled ? 'Vypnout' : 'Zapnout'}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            if (!token || !confirm(`Smazat zdroj „${source.name}"?`)) return;
                            await nestAdminDeleteNewsSource(token, source.id);
                            void refreshSources();
                          }}
                          className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700"
                        >
                          Smazat
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {rssTestResult && rssTestSourceName ? (
            <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold text-blue-950">
                  TEST – {rssTestSourceName}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setRssTestResult(null);
                    setRssTestSourceName(null);
                  }}
                  className="text-xs font-semibold text-blue-800 hover:underline"
                >
                  Zavřít
                </button>
              </div>
              {'diagnostics' in rssTestResult ? (
                <>
                  <div className="mt-3 grid gap-2 text-sm text-blue-950 sm:grid-cols-2">
                    <p>
                      Stav:{' '}
                      <strong>{rssTestResult.diagnostics.ok ? '✅ FUNGUJE' : '❌ CHYBA'}</strong>
                    </p>
                    <p>HTTP: {rssTestResult.diagnostics.httpStatus ?? '—'}</p>
                    <p className="break-all">Original URL: {rssTestResult.diagnostics.requestedUrl}</p>
                    <p className="break-all">Final URL: {rssTestResult.diagnostics.finalUrl}</p>
                    <p>Redirectů: {rssTestResult.diagnostics.redirectCount ?? 0}</p>
                    <p>Content-Type: {rssTestResult.diagnostics.contentType ?? '—'}</p>
                    <p>Response time: {rssTestResult.diagnostics.responseTimeMs} ms</p>
                    <p>Feed title: {rssTestResult.diagnostics.feedTitle ?? '—'}</p>
                    <p>Položek: {rssTestResult.diagnostics.itemCount}</p>
                    <p>
                      Parser: {rssTestResult.diagnostics.parserOk ? 'OK' : 'FAIL'} (
                      {rssTestResult.diagnostics.parser ?? '—'})
                    </p>
                    <p>Encoding: {rssTestResult.diagnostics.encoding ?? '—'}</p>
                    {rssTestResult.diagnostics.errorCode ? (
                      <p className="text-red-700 sm:col-span-2">
                        {rssTestResult.diagnostics.errorCode}: {rssTestResult.diagnostics.errorMessage}
                      </p>
                    ) : null}
                    {'draftCreated' in rssTestResult ? (
                      <p className="sm:col-span-2">
                        Import:{' '}
                        {rssTestResult.sourceItemCreated ? 'Source item vytvořen' : 'Duplicita / existuje'}{' '}
                        · Relevance: {rssTestResult.relevanceScore ?? '—'} · Draft:{' '}
                        {rssTestResult.draftCreated ? 'vytvořen' : 'ne'}
                      </p>
                    ) : null}
                  </div>
                  {rssTestResult.diagnostics.previewItems?.length ? (
                    <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
                      {rssTestResult.diagnostics.previewItems.map((item, idx) => (
                        <li key={`${item.url}-${idx}`}>
                          <p className="font-medium">{item.title}</p>
                          <p className="text-xs text-zinc-600">{formatDate(item.publishedAt)}</p>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </>
              ) : (
                <div className="mt-3 space-y-2 text-sm text-blue-950">
                  {'api' in rssTestResult && !('sourceId' in rssTestResult) ? (
                    <>
                      <p>
                        API:{' '}
                        <strong>
                          {rssTestResult.api === 'OK'
                            ? '✅ OK'
                            : rssTestResult.api === 'MISSING_KEY'
                              ? '❌ MISSING KEY'
                              : '❌ FAIL'}
                        </strong>
                      </p>
                      {'channelResolution' in rssTestResult && rssTestResult.channelResolution ? (
                        <p>Channel resolution: {rssTestResult.channelResolution}</p>
                      ) : null}
                      {rssTestResult.channel ? (
                        <p>
                          Kanál: {rssTestResult.channel.title} ({rssTestResult.channelId})
                        </p>
                      ) : null}
                      {'uploadsPlaylistId' in rssTestResult && rssTestResult.uploadsPlaylistId ? (
                        <p>Uploads playlist: {rssTestResult.uploadsPlaylistId}</p>
                      ) : null}
                      {'videosReturned' in rssTestResult ? (
                        <p>Videos returned: {rssTestResult.videosReturned ?? 0}</p>
                      ) : null}
                      {rssTestResult.latestVideo ? (
                        <>
                          <p>Nejnovější: {rssTestResult.latestVideo.title}</p>
                          <p>Video ID: {rssTestResult.latestVideo.videoId}</p>
                          <p>Datum: {formatDate(rssTestResult.latestVideo.publishedAt)}</p>
                          <p>
                            Thumbnail:{' '}
                            {rssTestResult.latestVideo.thumbnailUrl ? 'OK' : '—'}
                          </p>
                          <p>
                            Embeddable:{' '}
                            {rssTestResult.latestVideo.embeddable ? 'ANO' : 'NE'}
                          </p>
                        </>
                      ) : null}
                      {'recentVideos' in rssTestResult && rssTestResult.recentVideos?.length ? (
                        <ul className="mt-2 space-y-1 rounded-lg border border-blue-100 bg-white p-3 text-xs">
                          {rssTestResult.recentVideos.map((v) => (
                            <li key={v.videoId}>
                              {v.title} — relevance {v.relevanceScore ?? '—'} —{' '}
                              {v.embeddable ? 'embed' : 'no-embed'}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {rssTestResult.error ? (
                        <p className="text-red-700">{rssTestResult.error}</p>
                      ) : null}
                      {'lastApiError' in rssTestResult && rssTestResult.lastApiError ? (
                        <p className="text-red-700">API error: {rssTestResult.lastApiError}</p>
                      ) : null}
                    </>
                  ) : null}
                  {'sourceId' in rssTestResult ? (
                    <div className="space-y-2">
                      <p>
                        API configured:{' '}
                        <strong>{rssTestResult.apiConfigured ? 'YES' : 'NO'}</strong>
                      </p>
                      <p>URL resolved: {rssTestResult.urlResolved ? 'YES' : 'NO'}</p>
                      <p>Channel ID: {rssTestResult.channelId ?? '—'}</p>
                      <p>Channel: {rssTestResult.channelTitle ?? '—'}</p>
                      <p>Uploads playlist: {rssTestResult.uploadsPlaylistId ?? '—'}</p>
                      <p>Videos returned: {rssTestResult.videosReturned}</p>
                      <p>Eligible: {rssTestResult.eligible}</p>
                      <p>Duplicates: {rssTestResult.duplicates}</p>
                      <p>Low relevance: {rssTestResult.lowRelevance}</p>
                      <p>Imported: {rssTestResult.imported}</p>
                      <p>Last error: {rssTestResult.lastError ?? '—'}</p>
                      {rssTestResult.candidates?.length ? (
                        <ul className="space-y-1 rounded-lg border border-blue-100 bg-white p-3 text-xs">
                          {rssTestResult.candidates.map((c) => (
                            <li key={c.videoId}>
                              <strong>{c.title}</strong> — relevance {c.relevanceScore ?? '—'} —{' '}
                              {c.decision}
                              {c.detail ? ` (${c.detail})` : ''}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                  {'loaded' in rssTestResult ? (
                    <div className="space-y-1">
                      <p>Nalezeno: {rssTestResult.found ?? rssTestResult.loaded}</p>
                      <p>Nových: {rssTestResult.new ?? rssTestResult.created}</p>
                      <p>Duplicit: {rssTestResult.duplicates}</p>
                      <p>Importováno: {rssTestResult.imported ?? rssTestResult.created}</p>
                      <p>Chyb: {rssTestResult.errors}</p>
                      {rssTestResult.decisions?.length ? (
                        <ul className="space-y-1 rounded-lg border border-blue-100 bg-white p-3 text-xs">
                          {rssTestResult.decisions.map((d) => (
                            <li key={d.videoId}>
                              {d.title} — {d.decision}
                              {d.relevanceScore != null ? ` (${d.relevanceScore})` : ''}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                  {'steps' in rssTestResult && rssTestResult.steps?.length ? (
                    <ul className="space-y-1 rounded-lg border border-blue-100 bg-white p-3 text-xs">
                      {rssTestResult.steps.map((step) => (
                        <li key={step.step}>
                          <strong>{step.step}</strong>: {step.status}
                          {step.detail ? ` — ${step.detail}` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {'videoFound' in rssTestResult ? (
                    <p>
                      Video: {rssTestResult.videoFound ? 'YES' : 'NO'} · Duplicate:{' '}
                      {rssTestResult.duplicate ? 'YES' : 'NO'} · Relevance:{' '}
                      {rssTestResult.relevanceScore ?? '—'}
                      {rssTestResult.skippedReason ? ` · Skipped: ${rssTestResult.skippedReason}` : ''}
                      {rssTestResult.postId ? ` · Post: ${rssTestResult.postId}` : ''}
                    </p>
                  ) : null}
                </div>
              )}
            </section>
          ) : null}

          {backfillModal ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                <h3 className="text-lg font-semibold">Importovat posledních X — {backfillModal.name}</h3>
                <label className="mt-4 block text-sm">
                  Počet videí
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={backfillCount}
                    onChange={(e) => setBackfillCount(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                  />
                </label>
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={backfillIgnoreRelevance}
                    onChange={(e) => setBackfillIgnoreRelevance(e.target.checked)}
                  />
                  Importovat i videa pod relevance limitem
                </label>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setBackfillModal(null)}
                    className="rounded-xl border border-zinc-200 px-4 py-2 text-sm"
                  >
                    Zrušit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      if (!token) return;
                      setBusy(true);
                      setErrMsg(null);
                      const res = await nestAdminYoutubeBackfill(
                        token,
                        backfillModal.sourceId,
                        backfillCount,
                        backfillIgnoreRelevance,
                      );
                      setBusy(false);
                      setBackfillModal(null);
                      if (!res.ok) {
                        setErrMsg(res.message);
                        return;
                      }
                      setRssTestSourceName(`Backfill – ${backfillModal.name}`);
                      setRssTestResult(res.data);
                      setMsg(`Importováno ${res.data.created} videí`);
                      void refreshSources();
                      void refreshArticles();
                    }}
                    className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Importovat nyní
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'ai' ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-orange-200 bg-orange-50/50 p-5">
            <h2 className="text-lg font-semibold text-orange-950">Ruční import z URL</h2>
            <p className="mt-1 text-sm text-orange-900/80">
              Vytvoří AI koncept z externího článku.
            </p>
            <form onSubmit={(e) => void handleImportUrl(e)} className="mt-4 flex flex-wrap gap-2">
              <input
                type="url"
                required
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="https://…"
                className="min-w-[240px] flex-1 rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {busy ? 'Importuji…' : 'Importovat URL'}
              </button>
            </form>
          </section>
          <section>
            <h2 className="mb-3 text-lg font-semibold">AI koncepty (DRAFT)</h2>
            {renderArticleTable(draftArticles, 'draft')}
          </section>
        </div>
      ) : null}

      {tab === 'pending' ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Čeká na publikaci</h2>
          {renderArticleTable(pendingArticles, 'pending')}
        </section>
      ) : null}

      {tab === 'published' ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Publikované články</h2>
          {renderArticleTable(publishedArticles, 'published')}
        </section>
      ) : null}

      {tab === 'categories' ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {NEWS_ARTICLE_CATEGORIES.map((cat) => {
            const count = publishedArticles.filter((a) => a.category === cat.value).length;
            return (
              <div key={cat.value} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="font-semibold text-zinc-900">{cat.label}</p>
                <p className="mt-1 text-2xl font-bold text-orange-600">{count}</p>
                <p className="mt-1 text-xs text-zinc-500">publikovaných článků</p>
                <Link
                  href={`/aktuality?category=${cat.value}`}
                  className="mt-2 inline-block text-xs font-semibold text-orange-700 hover:underline"
                >
                  Veřejný výpis →
                </Link>
              </div>
            );
          })}
        </section>
      ) : null}

      {tab === 'automation' ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Worker stav</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Automatický fetch, analýza a publikace.
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleRunFetch()}
                className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Spustit fetch zdrojů
              </button>
            </div>
            {worker ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                  <p className="text-xs text-zinc-500">Worker</p>
                  <p className={`font-bold ${worker.online ? 'text-emerald-600' : 'text-red-600'}`}>
                    {worker.online ? 'ONLINE' : 'OFFLINE'}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                  <p className="text-xs text-zinc-500">Scheduler</p>
                  <p
                    className={`font-bold ${
                      automationDiag?.scheduleWindowOpen ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                  >
                    {automationDiag?.scheduleWindowOpen ? 'OKNO OTEVŘENO' : 'ČEKÁ'}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Další slot: {automationDiag?.nextPublishSlot ?? '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                  <p className="text-xs text-zinc-500">Heartbeat</p>
                  <p className="text-sm font-medium">{formatDate(worker.lastHeartbeatAt)}</p>
                </div>
                <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                  <p className="text-xs text-zinc-500">AUTO připraveno</p>
                  <p className="text-2xl font-bold text-emerald-700">
                    {automationDiag?.eligibleForAuto ?? '—'}
                  </p>
                </div>
              </div>
            ) : null}
            {automationDiag ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-sm">
                  <p className="text-xs text-zinc-500">Čeká na obrázek</p>
                  <p className="font-bold">{automationDiag.waitingImage}</p>
                </div>
                <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-sm">
                  <p className="text-xs text-zinc-500">Čeká na kvalitu</p>
                  <p className="font-bold">{automationDiag.waitingQuality}</p>
                </div>
                <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-sm">
                  <p className="text-xs text-zinc-500">Čeká na jazyk</p>
                  <p className="font-bold">{automationDiag.waitingLanguage}</p>
                </div>
                <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-sm">
                  <p className="text-xs text-zinc-500">Čeká na čas</p>
                  <p className="font-bold">{automationDiag.waitingSchedule}</p>
                </div>
                <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-sm">
                  <p className="text-xs text-zinc-500">Post fronta</p>
                  <p className="font-bold">{automationDiag.portalPostQueue}</p>
                </div>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy || !token}
                onClick={async () => {
                  if (!token) return;
                  setBusy(true);
                  setAutoPublishTest(null);
                  const res = await nestAdminTestAutoPublish(token, { bypassSchedule: true });
                  setBusy(false);
                  if (!res.ok) {
                    setErrMsg(res.message);
                    return;
                  }
                  const lines = res.data.steps
                    .map((s) => `${s.step}: ${s.status}${s.detail ? ` (${s.detail})` : ''}`)
                    .join('\n');
                  setAutoPublishTest(
                    `Publikováno: ${res.data.published ? 'ANO' : 'NE'}\n${lines}`,
                  );
                  void refreshAll();
                }}
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
              >
                Otestovat automatickou publikaci
              </button>
            </div>
            {autoPublishTest ? (
              <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
                {autoPublishTest}
              </pre>
            ) : null}
          </section>

          <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
            <h3 className="text-lg font-semibold text-amber-950">Oprava existujících dat</h3>
            <p className="mt-1 text-sm text-amber-900/80">
              Backfill běží na serveru — můžete zavřít stránku.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy || !token}
                onClick={async () => {
                  if (!token) return;
                  setBusy(true);
                  const res = await nestAdminBackfillNewsImages(token);
                  setBusy(false);
                  setMsg(res.ok ? `Backfill obrázků spuštěn (job ${res.data.jobId})` : res.message);
                }}
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                Doplnit obrázky chybějícím Aktualitám
              </button>
              <button
                type="button"
                disabled={busy || !token}
                onClick={async () => {
                  if (!token) return;
                  setBusy(true);
                  const res = await nestAdminBackfillNewsPosts(token);
                  setBusy(false);
                  setMsg(res.ok ? `Backfill postů spuštěn (job ${res.data.jobId})` : res.message);
                }}
                className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              >
                Doplnit Aktuality do Příspěvků
              </button>
              <button
                type="button"
                disabled={busy || !token}
                onClick={async () => {
                  if (!token) return;
                  setBusy(true);
                  const res = await nestAdminBackfillBadArticles(token);
                  setBusy(false);
                  setMsg(res.ok ? `Oprava článků spuštěna (job ${res.data.jobId})` : res.message);
                }}
                className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              >
                Opravit nekvalitní AI články
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {tab === 'seo' ? (
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Publikováno</p>
            <p className="mt-1 text-2xl font-bold">{seoStats.published}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Indexovatelné</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{seoStats.indexable}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Průměrné SEO skóre</p>
            <p className="mt-1 text-2xl font-bold">{seoStats.avgSeo || '—'}</p>
          </div>
        </section>
      ) : null}

      {tab === 'settings' && settings ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Nastavení automatizace</h2>
          <form onSubmit={(e) => void handleSaveSettings(e)} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => setSettings((s) => s && { ...s, enabled: e.target.checked })}
              />
              Modul aktivní
            </label>
            <label className="block text-sm">
              Režim publikace
              <select
                value={settings.publishMode}
                onChange={(e) =>
                  setSettings((s) =>
                    s ? { ...s, publishMode: e.target.value as NewsAutomationSettings['publishMode'] } : s,
                  )
                }
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
              >
                <option value="MANUAL">Manuální</option>
                <option value="AFTER_APPROVAL">Po schválení</option>
                <option value="AUTOMATIC">Automatický</option>
              </select>
            </label>
            <label className="block text-sm">
              Min. článků / den
              <input
                type="number"
                min={0}
                max={20}
                value={settings.minArticlesPerDay}
                onChange={(e) =>
                  setSettings((s) => s && { ...s, minArticlesPerDay: Number(e.target.value) })
                }
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Max. článků / den
              <input
                type="number"
                min={0}
                max={20}
                value={settings.maxArticlesPerDay}
                onChange={(e) =>
                  setSettings((s) => s && { ...s, maxArticlesPerDay: Number(e.target.value) })
                }
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              Časy publikace (HH:MM, oddělené čárkou)
              <input
                value={settings.publishTimes.join(', ')}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          publishTimes: e.target.value
                            .split(',')
                            .map((x) => x.trim())
                            .filter(Boolean),
                        }
                      : s,
                  )
                }
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Auto publikace od kvality
              <input
                type="number"
                min={0}
                max={100}
                value={settings.autoPublishMinQuality}
                onChange={(e) =>
                  setSettings((s) => s && { ...s, autoPublishMinQuality: Number(e.target.value) })
                }
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Interval fetch (min)
              <input
                type="number"
                min={5}
                value={settings.fetchIntervalMinutes}
                onChange={(e) =>
                  setSettings((s) => s && { ...s, fetchIntervalMinutes: Number(e.target.value) })
                }
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.createPortalPost}
                onChange={(e) =>
                  setSettings((s) => s && { ...s, createPortalPost: e.target.checked })
                }
              />
              Vytvořit příspěvek na portálu
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.createFacebookPost}
                onChange={(e) =>
                  setSettings((s) => s && { ...s, createFacebookPost: e.target.checked })
                }
              />
              Publikovat tento příspěvek na Facebook
            </label>
            <label className="block text-sm sm:col-span-2">
              Systémový profil (popisek ve feedu)
              <input
                type="text"
                value={settings.portalPostAuthorLabel ?? 'Redakce XXREALIT'}
                onChange={(e) =>
                  setSettings((s) => s && { ...s, portalPostAuthorLabel: e.target.value })
                }
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.addHashtags !== false}
                onChange={(e) =>
                  setSettings((s) => s && { ...s, addHashtags: e.target.checked })
                }
              />
              Přidat hashtagy na Facebook
            </label>
            <label className="block text-sm">
              Max délka teaseru
              <input
                type="number"
                min={120}
                max={500}
                value={settings.maxTeaserLength ?? 280}
                onChange={(e) =>
                  setSettings((s) => s && { ...s, maxTeaserLength: Number(e.target.value) })
                }
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
              />
            </label>

            <div className="sm:col-span-2 mt-2 rounded-xl border border-red-200 bg-red-50/40 p-4">
              <h3 className="font-semibold text-red-950">YouTube monitoring</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.youtubeMonitoringEnabled !== false}
                    onChange={(e) =>
                      setSettings((s) => s && { ...s, youtubeMonitoringEnabled: e.target.checked })
                    }
                  />
                  YouTube monitoring
                </label>
                <label className="block text-sm">
                  Interval (min)
                  <input
                    type="number"
                    min={15}
                    max={240}
                    value={settings.youtubeCheckIntervalMinutes ?? 30}
                    onChange={(e) =>
                      setSettings((s) =>
                        s && { ...s, youtubeCheckIntervalMinutes: Number(e.target.value) },
                      )
                    }
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                  />
                </label>
                <label className="block text-sm">
                  Max YouTube postů / den
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={settings.youtubeMaxPostsPerDay ?? 5}
                    onChange={(e) =>
                      setSettings((s) => s && { ...s, youtubeMaxPostsPerDay: Number(e.target.value) })
                    }
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                  />
                </label>
                <label className="block text-sm">
                  Min. relevance
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={settings.youtubeMinRelevance ?? 70}
                    onChange={(e) =>
                      setSettings((s) => s && { ...s, youtubeMinRelevance: Number(e.target.value) })
                    }
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.youtubeCreatePortalPost !== false}
                    onChange={(e) =>
                      setSettings((s) => s && { ...s, youtubeCreatePortalPost: e.target.checked })
                    }
                  />
                  Publikovat do hlavního feedu
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.youtubeCreateFacebookPost === true}
                    onChange={(e) =>
                      setSettings((s) => s && { ...s, youtubeCreateFacebookPost: e.target.checked })
                    }
                  />
                  Facebook
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50 sm:col-span-2"
            >
              {busy ? 'Ukládám…' : 'Uložit nastavení'}
            </button>
          </form>
        </section>
      ) : null}

      {tab === 'history' ? (
        <section className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3">Čas</th>
                <th className="px-4 py-3">Událost</th>
                <th className="px-4 py-3">Zpráva</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.map((row) => (
                <tr key={row.id} className="border-b border-zinc-50 align-top">
                  <td className="px-4 py-3 text-xs text-zinc-500">{formatDate(row.createdAt)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-violet-700">{row.event}</td>
                  <td className="px-4 py-3 text-zinc-700">{row.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {rejectModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Zamítnout článek</h3>
            <p className="mt-1 text-sm text-zinc-600">{rejectModal.title}</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="mt-3 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectModal(null)}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold"
              >
                Zrušit
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleReject()}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Zamítnout
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
