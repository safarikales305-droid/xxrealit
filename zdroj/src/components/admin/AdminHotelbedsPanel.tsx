'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminHotelbedsStatus,
  nestAdminHotelbedsTestConnection,
  nestAdminHotelbedsTestSearch,
  nestAdminHotelbedsTestContent,
  nestAdminHotelbedsClearCache,
  nestAdminHotelbedsLogs,
  nestAdminHotelbedsLogDetail,
  nestAdminHotelbedsDiagnostics,
  nestAdminHotelbedsCacheInspector,
  nestAdminHotelbedsDiagnoseHotel,
  nestAdminHotelbedsDiagnosePublicHotels,
  nestAdminHotelbedsSyncContent,
  nestAdminHotelbedsSyncHotel,
  nestAdminHotelbedsRawContent,
  type HotelbedsApiLogEntry,
  type HotelbedsDiagnosticsOverview,
  type HotelbedsHotelDiagnosis,
  type HotelbedsIntegrationStatus,
  type HotelbedsPublicHotelsDiagnosis,
  type HotelbedsTestContentResult,
  type HotelbedsTestResult,
  type HotelbedsTestSearchResult,
  type HotelbedsCacheInspection,
} from '@/lib/hotelbeds-admin-api';

type LastTest = {
  at: string;
  result: HotelbedsTestResult;
};

export function AdminHotelbedsPanel() {
  const { apiAccessToken, user } = useAuth();
  const [status, setStatus] = useState<HotelbedsIntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [lastTest, setLastTest] = useState<LastTest | null>(null);
  const [searchResult, setSearchResult] = useState<HotelbedsTestSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [logs, setLogs] = useState<HotelbedsApiLogEntry[] | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [expandedLog, setExpandedLog] = useState<HotelbedsApiLogEntry | null>(null);
  const [testingContent, setTestingContent] = useState(false);
  const [contentResult, setContentResult] = useState<HotelbedsTestContentResult | null>(null);
  const [contentInfo, setContentInfo] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<HotelbedsDiagnosticsOverview | null>(null);
  const [cacheInspector, setCacheInspector] = useState<HotelbedsCacheInspection | null>(null);
  const [showCacheKeys, setShowCacheKeys] = useState(false);
  const [diagnosingHotel, setDiagnosingHotel] = useState(false);
  const [hotelDiagnosis, setHotelDiagnosis] = useState<HotelbedsHotelDiagnosis | null>(null);
  const [diagnosingPublic, setDiagnosingPublic] = useState(false);
  const [publicDiagnosis, setPublicDiagnosis] = useState<HotelbedsPublicHotelsDiagnosis | null>(null);
  const [syncingContent, setSyncingContent] = useState(false);
  const [syncingHotel, setSyncingHotel] = useState(false);
  const [rawContent, setRawContent] = useState<Record<string, unknown> | null>(null);
  const [syncResult, setSyncResult] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    if (!apiAccessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [data, diag] = await Promise.all([
      nestAdminHotelbedsStatus(apiAccessToken),
      nestAdminHotelbedsDiagnostics(apiAccessToken),
    ]);
    setStatus(data);
    setDiagnostics(diag);
    setLoading(false);
  }, [apiAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleTestConnection() {
    if (!apiAccessToken) return;
    setTesting(true);
    setError(null);
    setSearchResult(null);
    const result = await nestAdminHotelbedsTestConnection(apiAccessToken);
    setTesting(false);
    if (!result) {
      setError('Test spojení selhal — backend neodpověděl.');
      return;
    }
    setLastTest({ at: new Date().toISOString(), result });
    if (!result.success) {
      setError(result.message);
    }
  }

  async function handleClearCache() {
    if (!apiAccessToken) return;
    setClearingCache(true);
    await nestAdminHotelbedsClearCache(apiAccessToken);
    setClearingCache(false);
    await load();
  }

  async function handleShowLogs() {
    if (!apiAccessToken) return;
    setShowLogs(true);
    const data = await nestAdminHotelbedsLogs(apiAccessToken, 30);
    setLogs(data?.logs ?? []);
  }

  async function handleExpandLog(id: string) {
    if (!apiAccessToken) return;
    if (expandedLogId === id) {
      setExpandedLogId(null);
      setExpandedLog(null);
      return;
    }
    setExpandedLogId(id);
    const cached = logs?.find((l) => l.id === id);
    if (cached?.requestParams || cached?.errorBody) {
      setExpandedLog(cached);
      return;
    }
    const data = await nestAdminHotelbedsLogDetail(apiAccessToken, id);
    setExpandedLog(data?.log ?? cached ?? null);
  }

  async function handleLoadCacheInspector() {
    if (!apiAccessToken) return;
    const data = await nestAdminHotelbedsCacheInspector(apiAccessToken);
    setCacheInspector(data);
  }

  async function handleSyncHotelDuo() {
    if (!apiAccessToken) return;
    setSyncingHotel(true);
    setError(null);
    const result = await nestAdminHotelbedsSyncHotel(apiAccessToken, 6741);
    setSyncingHotel(false);
    setSyncResult(result);
    if (!result?.success) {
      setError('Synchronizace Hotel Duo selhala.');
    }
    await load();
    await handleDiagnoseHotelDuo();
  }

  async function handleSyncAllContent() {
    if (!apiAccessToken) return;
    setSyncingContent(true);
    setError(null);
    const result = await nestAdminHotelbedsSyncContent(apiAccessToken, 'Praha');
    setSyncingContent(false);
    setSyncResult(result);
    await load();
  }

  async function handleLoadRawContent() {
    if (!apiAccessToken) return;
    const data = await nestAdminHotelbedsRawContent(apiAccessToken, 6741);
    setRawContent(data);
  }

  async function handleDiagnoseHotelDuo() {
    if (!apiAccessToken) return;
    setDiagnosingHotel(true);
    setError(null);
    const result = await nestAdminHotelbedsDiagnoseHotel(apiAccessToken, 6741);
    setDiagnosingHotel(false);
    if (!result) {
      setError('Diagnostika Hotel Duo selhala — backend neodpověděl.');
      return;
    }
    setHotelDiagnosis(result);
    await load();
  }

  async function handleDiagnosePublicHotels() {
    if (!apiAccessToken) return;
    setDiagnosingPublic(true);
    setError(null);
    const result = await nestAdminHotelbedsDiagnosePublicHotels(apiAccessToken);
    setDiagnosingPublic(false);
    if (!result) {
      setError('Diagnostika veřejných hotelů selhala — backend neodpověděl.');
      return;
    }
    setPublicDiagnosis(result);
    await load();
  }

  async function handleTestContent() {
    if (!apiAccessToken) return;
    setTestingContent(true);
    setError(null);
    setContentInfo(null);
    const result = await nestAdminHotelbedsTestContent(apiAccessToken, 6741);
    setTestingContent(false);
    if (!result) {
      setError('Test Content API selhal — backend neodpověděl.');
      return;
    }
    setContentResult(result);
    if (result.databaseContent?.found && result.databaseContent.imagesCount > 0) {
      setContentInfo(
        `DB obsah je k dispozici (${result.databaseContent.imagesCount} fotek). Efektivní zdroj: ${result.effectiveSource ?? 'DATABASE'}.`,
      );
    }
    if (result.quotaExceeded) {
      setContentInfo(
        (prev) =>
          `${prev ? `${prev} ` : ''}Content API quota exceeded — LIVE test přeskočen, DB/cache zůstává aktivní.`,
      );
      await load();
      return;
    }
    if (result.permissionDenied && !result.databaseContent?.found) {
      setContentInfo(
        'API klíč nemá aktuálně oprávnění pro Hotel Content API. Booking API je nadále funkční.',
      );
      return;
    }
    if (!result.success && !result.databaseContent?.found) {
      setError(result.error ?? `Content API HTTP ${result.httpStatus}`);
    }
    await load();
  }

  const connectionOk = lastTest?.result.success === true;
  const contentDiagnostics = status?.contentDiagnostics ?? status?.metrics?.contentDiagnostics;
  const overview = diagnostics;
  const bookingApiStatus =
    overview?.bookingApi.status === 'OK' || contentDiagnostics?.bookingApiOk || connectionOk || searchResult?.success
      ? '🟢 Připojeno'
      : '🟡 Neotestováno';
  const contentApiStatus = contentDiagnostics?.contentApiQuotaExceeded || overview?.contentApi.quotaExceeded
    ? '🟠 Kvóta dočasně vyčerpána'
    : overview?.contentApi.permissionDenied || contentDiagnostics?.contentApiPermissionDenied
      ? '🔴 Bez oprávnění'
      : overview?.contentApi.status === 'OK' || contentDiagnostics?.contentApiOk
        ? '🟢 Připojeno'
        : '🟡 Nedostupné';
  const dbContentStatus =
    (overview?.publicFallback?.dbHotelCount ?? overview?.database.hotelCount ?? 0) > 0
      ? '🟢 Dostupný'
      : '🟡 Prázdný';
  const publicFallbackStatus =
    overview?.publicFallback?.active || contentDiagnostics?.publicFallbackActive
      ? '🟢 Aktivní'
      : '🟢 Aktivní';

  async function handleTestSearch() {
    if (!apiAccessToken) return;
    setSearching(true);
    setError(null);
    const result = await nestAdminHotelbedsTestSearch(apiAccessToken);
    setSearching(false);
    if (!result) {
      setError('Testovací vyhledávání selhalo — backend neodpověděl.');
      return;
    }
    setSearchResult(result);
    if (!result.success) {
      setError(result.message);
    }
  }

  const statusLabel = !status?.configured
    ? '🟡 Neotestováno (chybí ENV)'
    : testing
      ? '🟡 Testuji…'
      : connectionOk
        ? '🟢 Připojeno'
        : lastTest
          ? '🔴 Chyba připojení'
          : '🟡 Neotestováno';

  if (user?.role !== 'ADMIN') {
    return <p className="text-sm text-red-600">Pouze pro administrátory.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Integrace → Ubytování
          </p>
          <h1 className="text-2xl font-bold text-zinc-900">Hotelbeds / HBX Group</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Bezpečný test Hotelbeds test API. Credentials zůstávají pouze na serveru.
          </p>
        </div>
        <Link
          href="/admin/ubytovani"
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium"
        >
          ← Správa ubytování
        </Link>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">HOTELBEDS / HBX GROUP</h2>

        {loading ? (
          <p className="mt-4 text-sm text-zinc-500">Načítám stav integrace…</p>
        ) : (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-zinc-500">Environment</dt>
              <dd className="font-medium capitalize text-zinc-900">
                {status?.environment === 'test' ? 'Test' : status?.environment ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Status</dt>
              <dd className="font-medium text-zinc-900">{statusLabel}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">API Key</dt>
              <dd className="font-mono text-zinc-800">{status?.apiKeyMasked ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">API Secret</dt>
              <dd className="font-mono text-zinc-800">{status?.apiSecretMasked ?? '**************'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-zinc-500">Booking API</dt>
              <dd className="break-all font-mono text-xs text-zinc-700">{status?.bookingBaseUrl ?? '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-zinc-500">Content API</dt>
              <dd className="break-all font-mono text-xs text-zinc-700">{status?.contentBaseUrl ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Veřejné listingy</dt>
              <dd className="font-medium text-zinc-900">{status?.publicListings ? 'Zapnuto' : 'Vypnuto'}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Požadavky dnes</dt>
              <dd className="font-medium text-zinc-900">{status?.metrics?.requestsToday ?? 0}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Chyby dnes</dt>
              <dd className="font-medium text-zinc-900">{status?.metrics?.errorsToday ?? 0}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Cache hit rate</dt>
              <dd className="font-medium text-zinc-900">{status?.metrics?.cacheHitRate ?? 0} %</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-zinc-500">Poslední search</dt>
              <dd className="text-zinc-800">
                {status?.metrics?.lastSearch
                  ? `${status.metrics.lastSearch.destination} · ${status.metrics.lastSearch.total} hotelů · ${new Date(status.metrics.lastSearch.at).toLocaleString('cs-CZ')}`
                  : '—'}
              </dd>
            </div>
          </dl>
        )}

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        {lastTest?.result.success ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <p>HTTP: {lastTest.result.status}</p>
            <p>Response time: {lastTest.result.responseTimeMs} ms</p>
            <p>
              Poslední test:{' '}
              {new Date(lastTest.at).toLocaleString('cs-CZ')}
            </p>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={testing || !status?.configured}
            onClick={() => void handleTestConnection()}
            className="rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {testing ? 'Testuji spojení s Hotelbeds…' : 'Otestovat připojení'}
          </button>

          <button
            type="button"
            disabled={searching || !connectionOk}
            onClick={() => void handleTestSearch()}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 disabled:opacity-50"
            title={connectionOk ? undefined : 'Nejdřív úspěšně otestujte připojení'}
          >
            {searching ? 'Vyhledávám…' : 'Testovací vyhledávání hotelů'}
          </button>

          <button
            type="button"
            disabled={testingContent || !status?.configured}
            onClick={() => void handleTestContent()}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 disabled:opacity-50"
          >
            {testingContent ? 'Testuji Content API…' : 'Otestovat Content API'}
          </button>

          <button
            type="button"
            disabled={clearingCache}
            onClick={() => void handleClearCache()}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 disabled:opacity-50"
          >
            {clearingCache ? 'Mažu cache…' : 'Vymazat cache'}
          </button>

          <button
            type="button"
            onClick={() => void handleShowLogs()}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800"
          >
            Zobrazit API logy
          </button>
        </div>

        {!status?.configured ? (
          <p className="mt-3 text-xs text-amber-800">
            Nastavte <code className="rounded bg-amber-50 px-1">HOTELBEDS_API_KEY</code> a{' '}
            <code className="rounded bg-amber-50 px-1">HOTELBEDS_API_SECRET</code> v backend ENV a restartujte
            server.
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">API status</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Booking API</dt>
            <dd className="font-medium">{bookingApiStatus}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Content API</dt>
            <dd className="font-medium">{contentApiStatus}</dd>
          </div>
        </dl>
        {contentDiagnostics?.contentApiPermissionDenied || overview?.contentApi.permissionDenied ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Vyhledávání hotelů a cen funguje. Fotografie, popisy a další statická data čekají na aktivaci Content API.
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-900">Diagnostika obsahu a fotografií</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={diagnosingHotel || !status?.configured}
              onClick={() => void handleDiagnoseHotelDuo()}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-50"
            >
              {diagnosingHotel ? 'Diagnostikuji…' : 'Diagnostikovat Hotel Duo (6741)'}
            </button>
            <button
              type="button"
              disabled={syncingHotel || !status?.configured}
              onClick={() => void handleSyncHotelDuo()}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-50"
            >
              {syncingHotel ? 'Synchronizuji…' : 'Synchronizovat Hotel Duo'}
            </button>
            <button
              type="button"
              disabled={syncingContent || !status?.configured}
              onClick={() => void handleSyncAllContent()}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-50"
            >
              {syncingContent ? 'Synchronizuji…' : 'Synchronizovat Hotelbeds obsah'}
            </button>
            <button
              type="button"
              disabled={!status?.configured}
              onClick={() => void handleLoadRawContent()}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800"
            >
              Raw Content API (6741)
            </button>
            <button
              type="button"
              disabled={diagnosingPublic || !status?.configured}
              onClick={() => void handleDiagnosePublicHotels()}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-50"
            >
              {diagnosingPublic ? 'Testuji veřejné hotely…' : 'Test veřejných hotelů'}
            </button>
          </div>
        </div>

        {rawContent ? (
          <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs">
            <h3 className="mb-2 font-semibold text-zinc-900">Raw Content API diagnostika — Hotel Duo</h3>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap">{JSON.stringify(rawContent, null, 2)}</pre>
          </div>
        ) : null}

        {syncResult ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap">{JSON.stringify(syncResult, null, 2)}</pre>
          </div>
        ) : null}

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Booking API</dt>
            <dd className="font-medium">{overview?.bookingApi.status ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Content API</dt>
            <dd className="font-medium">{overview?.contentApi.status ?? '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-zinc-500">Poslední úspěšný Content API request</dt>
            <dd className="text-zinc-800">
              {overview?.lastSuccessfulContentRequest
                ? `${new Date(overview.lastSuccessfulContentRequest.at).toLocaleString('cs-CZ')} · ${overview.lastSuccessfulContentRequest.endpoint} · HTTP ${overview.lastSuccessfulContentRequest.status} · hotel IDs: ${overview.lastSuccessfulContentRequest.hotelIds.join(', ') || '—'} · ${overview.lastSuccessfulContentRequest.imagesCount} obrázků`
                : '—'}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-zinc-500">Poslední neúspěšný Content API request</dt>
            <dd className="text-zinc-800">
              {overview?.lastFailedContentRequest
                ? `${new Date(overview.lastFailedContentRequest.at).toLocaleString('cs-CZ')} · ${overview.lastFailedContentRequest.endpoint} · HTTP ${overview.lastFailedContentRequest.status}${overview.lastFailedContentRequest.errorCode ? ` · ${overview.lastFailedContentRequest.errorCode}` : ''}${overview.lastFailedContentRequest.errorMessage ? ` · ${overview.lastFailedContentRequest.errorMessage}` : ''}`
                : '—'}
            </dd>
          </div>
        </dl>

        {overview?.hotelsWithPhoto ? (
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
              <p className="text-zinc-500">Content API</p>
              <p className="font-semibold">{overview.hotelsWithPhoto.fromContentApi}</p>
            </div>
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
              <p className="text-zinc-500">Cache</p>
              <p className="font-semibold">{overview.hotelsWithPhoto.fromCache}</p>
            </div>
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
              <p className="text-zinc-500">DB</p>
              <p className="font-semibold">{overview.hotelsWithPhoto.fromDatabase}</p>
            </div>
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
              <p className="text-zinc-500">Fallback</p>
              <p className="font-semibold">{overview.hotelsWithPhoto.fallback}</p>
            </div>
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
              <p className="text-zinc-500">Bez fotografie</p>
              <p className="font-semibold">{overview.hotelsWithPhoto.withoutPhoto}</p>
            </div>
          </div>
        ) : null}

        {overview?.database ? (
          <p className="mt-3 text-xs text-zinc-600">{overview.database.note}</p>
        ) : null}

        {overview?.contentHistory?.length ? (
          <div className="mt-5 overflow-auto">
            <h3 className="text-sm font-semibold text-zinc-900">Historie Content API</h3>
            <table className="mt-2 w-full min-w-[720px] text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500">
                  <th className="py-2 pr-2">Datum</th>
                  <th className="py-2 pr-2">Hotel ID</th>
                  <th className="py-2 pr-2">Endpoint</th>
                  <th className="py-2 pr-2">HTTP</th>
                  <th className="py-2 pr-2">Obrázky</th>
                  <th className="py-2 pr-2">Zdroj</th>
                  <th className="py-2">Doba odezvy</th>
                </tr>
              </thead>
              <tbody>
                {overview.contentHistory.map((row, idx) => (
                  <tr key={`${row.at}-${idx}`} className="border-b border-zinc-100">
                    <td className="py-2 pr-2">{new Date(row.at).toLocaleString('cs-CZ')}</td>
                    <td className="py-2 pr-2">{row.hotelIds.join(', ') || '—'}</td>
                    <td className="py-2 pr-2">{row.endpoint}</td>
                    <td className="py-2 pr-2">{row.httpStatus}</td>
                    <td className="py-2 pr-2">{row.imagesCount}</td>
                    <td className="py-2 pr-2">{row.source}</td>
                    <td className="py-2">{row.responseTimeMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-900">Hotelbeds cache</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleLoadCacheInspector()}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800"
            >
              Obnovit cache inspektor
            </button>
            <button
              type="button"
              onClick={() => setShowCacheKeys((v) => !v)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800"
            >
              {showCacheKeys ? 'Skrýt cache klíče' : 'Zobrazit cache klíče'}
            </button>
          </div>
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-zinc-500">Content entries</dt>
            <dd className="font-medium">{cacheInspector?.contentEntries ?? overview?.cache.contentEntries ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Image entries</dt>
            <dd className="font-medium">{cacheInspector?.imageEntries ?? overview?.cache.imageEntries ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Nejstarší záznam</dt>
            <dd className="font-medium">
              {cacheInspector?.oldestEntry || overview?.cache.oldestEntry
                ? new Date((cacheInspector?.oldestEntry ?? overview?.cache.oldestEntry) as string).toLocaleString('cs-CZ')
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Nejnovější záznam</dt>
            <dd className="font-medium">
              {cacheInspector?.newestEntry || overview?.cache.newestEntry
                ? new Date((cacheInspector?.newestEntry ?? overview?.cache.newestEntry) as string).toLocaleString('cs-CZ')
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">TTL content cache</dt>
            <dd className="font-medium">{cacheInspector?.defaultContentTtlHours ?? overview?.cache.defaultContentTtlHours ?? 24} h</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Expired entries</dt>
            <dd className="font-medium">{cacheInspector?.expiredEntries ?? overview?.cache.expiredEntries ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Celkem entries</dt>
            <dd className="font-medium">{cacheInspector?.totalEntries ?? overview?.cache.totalEntries ?? '—'}</dd>
          </div>
        </dl>

        {showCacheKeys && (cacheInspector?.keys ?? overview?.cache.keys)?.length ? (
          <ul className="mt-4 max-h-64 space-y-1 overflow-auto rounded-lg border border-zinc-100 bg-zinc-50 p-3 font-mono text-xs">
            {(cacheInspector?.keys ?? overview?.cache.keys ?? []).map((key) => (
              <li key={key}>{key}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {hotelDiagnosis ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-zinc-900">
            Diagnostika — {hotelDiagnosis.name ?? 'Hotel'} (#{hotelDiagnosis.hotelId})
          </h3>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-zinc-500">Booking API</dt>
              <dd className="font-medium">HTTP {hotelDiagnosis.bookingApi.httpStatus}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Content API</dt>
              <dd className="font-medium">HTTP {hotelDiagnosis.contentApi.httpStatus}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Cache</dt>
              <dd className="font-medium">{hotelDiagnosis.cache.hit ? 'HIT' : 'MISS'}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">DB content</dt>
              <dd className="font-medium">{hotelDiagnosis.database.found ? 'FOUND' : 'NOT FOUND'}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Images in cache</dt>
              <dd className="font-medium">{hotelDiagnosis.cache.imagesInCache}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Images in DB</dt>
              <dd className="font-medium">{hotelDiagnosis.database.imagesCount}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Current image source</dt>
              <dd className="font-medium">{hotelDiagnosis.currentImageSource}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Last successful Content fetch</dt>
              <dd className="font-medium">
                {hotelDiagnosis.lastSuccessfulContentFetch
                  ? new Date(hotelDiagnosis.lastSuccessfulContentFetch).toLocaleString('cs-CZ')
                  : '—'}
              </dd>
            </div>
          </dl>

          {hotelDiagnosis.conclusionHints?.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-700">
              {hotelDiagnosis.conclusionHints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          ) : null}

          {hotelDiagnosis.images?.length ? (
            <div className="mt-4 overflow-auto">
              <h4 className="text-sm font-semibold text-zinc-900">Image URL diagnostika</h4>
              <table className="mt-2 w-full min-w-[720px] text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-500">
                    <th className="py-2 pr-2">Raw path</th>
                    <th className="py-2 pr-2">Assembled URL</th>
                    <th className="py-2 pr-2">HTTP</th>
                    <th className="py-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {hotelDiagnosis.images.map((img, idx) => (
                    <tr key={`${img.rawPath}-${idx}`} className="border-b border-zinc-100">
                      <td className="py-2 pr-2 break-all">{img.rawPath ?? '—'}</td>
                      <td className="py-2 pr-2 break-all">{img.assembledUrl ?? '—'}</td>
                      <td className="py-2 pr-2">{img.httpStatus ?? '—'}</td>
                      <td className="py-2">{img.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {publicDiagnosis?.hotels?.length ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-zinc-900">Test veřejných hotelů</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Otestováno: {new Date(publicDiagnosis.testedAt).toLocaleString('cs-CZ')}
          </p>
          <ul className="mt-3 space-y-3 text-sm">
            {publicDiagnosis.hotels.map((hotel) => (
              <li key={hotel.label} className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                <p className="font-medium">{hotel.label}</p>
                {hotel.error ? (
                  <p className="text-red-700">{hotel.error}</p>
                ) : (
                  <p className="text-zinc-700">
                    ID {hotel.hotelId} · DB: {hotel.database?.found ?? '—'} · CACHE:{' '}
                    {hotel.cache?.hit ?? '—'} · IMAGES: {hotel.images ?? hotel.database?.imagesCount ?? 0} ·
                    PUBLIC API: {hotel.publicApi?.ok ?? '—'} · SOURCE: {hotel.currentImageSource ?? '—'}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-zinc-600">{publicDiagnosis.note}</p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Content API diagnostika</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Booking API</dt>
            <dd className="font-medium">{contentDiagnostics?.bookingApiOk ? '✅' : '❌'}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Content API (LIVE)</dt>
            <dd className="font-medium">{contentApiStatus}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">DB content</dt>
            <dd className="font-medium">{dbContentStatus}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Public fallback</dt>
            <dd className="font-medium">{publicFallbackStatus}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Images</dt>
            <dd className="font-medium">{contentDiagnostics?.imagesOk ? '✅' : '❌'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-zinc-500">Poslední Content request</dt>
            <dd className="text-zinc-800">
              {contentDiagnostics?.lastContentRequest
                ? `${contentDiagnostics.lastContentRequest.endpoint} · HTTP ${contentDiagnostics.lastContentRequest.status} · ${contentDiagnostics.lastContentRequest.responseTimeMs} ms · ${new Date(contentDiagnostics.lastContentRequest.at).toLocaleString('cs-CZ')}${contentDiagnostics.lastContentRequest.error ? ` · ${contentDiagnostics.lastContentRequest.error}` : ''}`
                : '—'}
            </dd>
          </div>
        </dl>
      </div>

      {contentResult ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-zinc-900">
            Test Content API — Hotel Duo (#{contentResult.hotelCode})
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Efektivní zdroj: <strong>{contentResult.effectiveSource ?? '—'}</strong>
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-sm">
              <h4 className="font-semibold text-zinc-900">LIVE Content API</h4>
              <dl className="mt-2 space-y-1">
                <div>
                  <dt className="text-zinc-500">HTTP</dt>
                  <dd className="font-medium">
                    {contentResult.liveContentApi?.skipped
                      ? `${contentResult.liveContentApi.status ?? 'SKIPPED'}`
                      : contentResult.httpStatus}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Status</dt>
                  <dd className="font-medium">{contentResult.liveContentApi?.status ?? '—'}</dd>
                </div>
              </dl>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-sm">
              <h4 className="font-semibold text-zinc-900">DATABASE CONTENT</h4>
              <dl className="mt-2 space-y-1">
                <div>
                  <dt className="text-zinc-500">Status</dt>
                  <dd className="font-medium">
                    {contentResult.databaseContent?.found ? 'FOUND' : 'NOT FOUND'}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Hotel</dt>
                  <dd className="font-medium">{contentResult.databaseContent?.name ?? contentResult.name ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Obrázky</dt>
                  <dd className="font-medium">{contentResult.databaseContent?.imagesCount ?? contentResult.imagesCount}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Popis / vybavení</dt>
                  <dd className="font-medium">
                    {contentResult.databaseContent?.descriptionExists ? 'Ano' : 'Ne'} /{' '}
                    {contentResult.databaseContent?.facilitiesCount ?? contentResult.facilitiesCount}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-sm">
              <h4 className="font-semibold text-zinc-900">CACHE</h4>
              <dl className="mt-2 space-y-1">
                <div>
                  <dt className="text-zinc-500">Status</dt>
                  <dd className="font-medium">{contentResult.cache?.hit ? 'HIT' : 'MISS'}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Obrázky v cache</dt>
                  <dd className="font-medium">{contentResult.cache?.imagesInCache ?? 0}</dd>
                </div>
              </dl>
            </div>
          </div>
          {contentResult.error ? (
            <pre
              className={`mt-3 overflow-auto rounded-lg p-3 text-xs ${
                contentResult.permissionDenied
                  ? 'border border-amber-200 bg-amber-50 text-amber-900'
                  : 'bg-red-50 text-red-900'
              }`}
            >
              {contentResult.error}
            </pre>
          ) : null}
        </div>
      ) : null}

      {contentInfo ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
          {contentInfo}
        </div>
      ) : null}

      {showLogs && logs ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-zinc-900">API logy (bez credentials)</h3>
          <ul className="mt-3 max-h-96 space-y-2 overflow-auto text-xs">
            {logs.length === 0 ? (
              <li className="text-zinc-500">Žádné logy.</li>
            ) : (
              logs.map((log) => (
                <li key={log.id} className="rounded border border-zinc-100 bg-zinc-50">
                  <button
                    type="button"
                    onClick={() => void handleExpandLog(log.id)}
                    className="w-full px-2 py-1 text-left font-mono"
                  >
                    {log.at} · {log.method} {log.endpoint} · HTTP {log.status} · {log.responseTimeMs} ms
                    {log.cached ? ' · cache' : ''}
                  </button>
                  {expandedLogId === log.id && expandedLog ? (
                    <div className="border-t border-zinc-200 px-3 py-2 text-zinc-700">
                      <p>
                        <span className="font-semibold">Method:</span> {expandedLog.method}
                      </p>
                      <p>
                        <span className="font-semibold">Endpoint:</span> {expandedLog.endpoint}
                      </p>
                      <p>
                        <span className="font-semibold">HTTP status:</span> {expandedLog.status}
                      </p>
                      <p>
                        <span className="font-semibold">Duration:</span> {expandedLog.responseTimeMs} ms
                      </p>
                      <p>
                        <span className="font-semibold">Timestamp:</span> {expandedLog.at}
                      </p>
                      {expandedLog.requestParams ? (
                        <p className="mt-1 break-all">
                          <span className="font-semibold">Parameters:</span> {expandedLog.requestParams}
                        </p>
                      ) : null}
                      {expandedLog.errorBody ? (
                        <pre className="mt-2 overflow-auto rounded bg-red-50 p-2 text-red-900">
                          {expandedLog.errorBody}
                        </pre>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {searchResult?.success && searchResult.sample?.length ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-zinc-900">
            Výsledek testovacího vyhledávání ({searchResult.hotelsFound ?? 0} hotelů)
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            HTTP {searchResult.status} · {searchResult.responseTimeMs} ms · pouze admin smoke test, nic se neukládá
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {searchResult.sample.map((hotel) => (
              <li
                key={`${hotel.code}-${hotel.name}`}
                className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2"
              >
                <span className="font-medium">{hotel.name ?? 'Hotel'}</span>
                {hotel.code ? (
                  <span className="ml-2 text-xs text-zinc-500">#{hotel.code}</span>
                ) : null}
                {hotel.categoryCode ? (
                  <span className="ml-2 text-xs text-zinc-500">{hotel.categoryCode}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
