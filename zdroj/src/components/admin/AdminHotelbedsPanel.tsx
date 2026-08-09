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
  type HotelbedsApiLogEntry,
  type HotelbedsIntegrationStatus,
  type HotelbedsTestContentResult,
  type HotelbedsTestResult,
  type HotelbedsTestSearchResult,
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

  const load = useCallback(async () => {
    if (!apiAccessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await nestAdminHotelbedsStatus(apiAccessToken);
    setStatus(data);
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

  async function handleTestContent() {
    if (!apiAccessToken) return;
    setTestingContent(true);
    setError(null);
    const result = await nestAdminHotelbedsTestContent(apiAccessToken, 6741);
    setTestingContent(false);
    if (!result) {
      setError('Test Content API selhal — backend neodpověděl.');
      return;
    }
    setContentResult(result);
    if (!result.success) {
      setError(result.error ?? `Content API HTTP ${result.httpStatus}`);
    }
    await load();
  }

  const diagnostics = status?.contentDiagnostics ?? status?.metrics?.contentDiagnostics;

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

  const connectionOk = lastTest?.result.success === true;
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
        <h2 className="text-lg font-semibold text-zinc-900">Content API diagnostika</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Booking API</dt>
            <dd className="font-medium">{diagnostics?.bookingApiOk ? '✅' : '❌'}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Content API</dt>
            <dd className="font-medium">{diagnostics?.contentApiOk ? '✅' : '❌'}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Images</dt>
            <dd className="font-medium">{diagnostics?.imagesOk ? '✅' : '❌'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-zinc-500">Poslední Content request</dt>
            <dd className="text-zinc-800">
              {diagnostics?.lastContentRequest
                ? `${diagnostics.lastContentRequest.endpoint} · HTTP ${diagnostics.lastContentRequest.status} · ${diagnostics.lastContentRequest.responseTimeMs} ms · ${new Date(diagnostics.lastContentRequest.at).toLocaleString('cs-CZ')}${diagnostics.lastContentRequest.error ? ` · ${diagnostics.lastContentRequest.error}` : ''}`
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
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-zinc-500">HTTP status</dt>
              <dd className="font-medium">{contentResult.httpStatus}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Název</dt>
              <dd className="font-medium">{contentResult.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Popis</dt>
              <dd className="font-medium">{contentResult.descriptionExists ? 'Ano' : 'Ne'}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Obrázky</dt>
              <dd className="font-medium">{contentResult.imagesCount}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Vybavení</dt>
              <dd className="font-medium">{contentResult.facilitiesCount}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Kategorie</dt>
              <dd className="font-medium">{contentResult.category ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Jazyk</dt>
              <dd className="font-medium">{contentResult.language ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Adresa / GPS</dt>
              <dd className="font-medium">
                {contentResult.addressExists ? 'Adresa ano' : 'Adresa ne'}
                {' · '}
                {contentResult.coordinatesExist ? 'GPS ano' : 'GPS ne'}
              </dd>
            </div>
          </dl>
          {contentResult.error ? (
            <pre className="mt-3 overflow-auto rounded-lg bg-red-50 p-3 text-xs text-red-900">{contentResult.error}</pre>
          ) : null}
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
