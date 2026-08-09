'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminHotelbedsStatus,
  nestAdminHotelbedsTestConnection,
  nestAdminHotelbedsTestSearch,
  type HotelbedsIntegrationStatus,
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
        </div>

        {!status?.configured ? (
          <p className="mt-3 text-xs text-amber-800">
            Nastavte <code className="rounded bg-amber-50 px-1">HOTELBEDS_API_KEY</code> a{' '}
            <code className="rounded bg-amber-50 px-1">HOTELBEDS_API_SECRET</code> v backend ENV a restartujte
            server.
          </p>
        ) : null}
      </div>

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
