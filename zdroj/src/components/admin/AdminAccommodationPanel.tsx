'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  adminFetchAccommodationDashboard,
  adminFetchAccommodationProvider,
  adminFetchAccommodations,
  adminSaveAccommodationProvider,
  adminStartAccommodationSync,
  adminTestAccommodationProvider,
  adminUpdateAccommodationStatus,
} from '@/lib/accommodation-client';

export function AdminAccommodationPanel() {
  const { apiAccessToken } = useAuth();
  const [dashboard, setDashboard] = useState<{
    total: number;
    active: number;
    inactive: number;
    byProvider: Record<string, number>;
  } | null>(null);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [booking, setBooking] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [affiliateId, setAffiliateId] = useState('');
  const [environment, setEnvironment] = useState('sandbox');

  const load = useCallback(async () => {
    if (!apiAccessToken) return;
    const [dash, list, provider] = await Promise.all([
      adminFetchAccommodationDashboard(apiAccessToken),
      adminFetchAccommodations(apiAccessToken),
      adminFetchAccommodationProvider(apiAccessToken, 'booking'),
    ]);
    setDashboard(dash);
    setItems(list.items);
    setBooking(provider);
  }, [apiAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveBooking() {
    if (!apiAccessToken) return;
    setBusy(true);
    setMsg(null);
    try {
      await adminSaveAccommodationProvider(apiAccessToken, 'booking', {
        apiKey: apiKey || undefined,
        affiliateId: affiliateId || undefined,
        environment,
        enabled: Boolean(apiKey && affiliateId),
      });
      setMsg('Konfigurace uložena.');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Chyba uložení');
    } finally {
      setBusy(false);
    }
  }

  async function testBooking() {
    if (!apiAccessToken) return;
    setBusy(true);
    try {
      const res = await adminTestAccommodationProvider(apiAccessToken, 'booking');
      setMsg(res.message);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Test selhal');
    } finally {
      setBusy(false);
    }
  }

  async function syncDemo() {
    if (!apiAccessToken) return;
    setBusy(true);
    try {
      const res = await adminStartAccommodationSync(apiAccessToken, 'demo');
      setMsg(`Synchronizace spuštěna (job ${res.jobId}).`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Sync selhal');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Ubytování</h1>
          <p className="text-sm text-zinc-600">Správa ubytování, demo dat a integrace partnerů.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/marketing/ubytovani-hero"
            className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-800"
          >
            Hero Ubytování
          </Link>
          <Link
            href="/admin/integrace/ubytovani/booking"
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium"
          >
            Booking.com integrace →
          </Link>
        </div>
      </div>

      {msg ? <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">{msg}</p> : null}

      {dashboard ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Celkem" value={dashboard.total} />
          <Stat label="Aktivních" value={dashboard.active} />
          <Stat label="Neaktivních" value={dashboard.inactive} />
          <Stat label="Demo" value={dashboard.byProvider.demo ?? 0} />
        </div>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold">Seznam ubytování</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b text-zinc-500">
                <th className="py-2 pr-2">Název</th>
                <th className="py-2 pr-2">Typ</th>
                <th className="py-2 pr-2">Město</th>
                <th className="py-2 pr-2">Provider</th>
                <th className="py-2 pr-2">Cena</th>
                <th className="py-2 pr-2">Hodnocení</th>
                <th className="py-2 pr-2">Stav</th>
                <th className="py-2 pr-2">Akce</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={String(row.id)} className="border-b border-zinc-100">
                  <td className="py-2 pr-2 font-medium">{String(row.name)}</td>
                  <td className="py-2 pr-2">{String(row.type)}</td>
                  <td className="py-2 pr-2">{String(row.city)}</td>
                  <td className="py-2 pr-2">{String(row.provider)}</td>
                  <td className="py-2 pr-2">{row.priceFrom != null ? `${row.priceFrom} Kč` : '—'}</td>
                  <td className="py-2 pr-2">{row.rating != null ? String(row.rating) : '—'}</td>
                  <td className="py-2 pr-2">{String(row.status)}</td>
                  <td className="py-2 pr-2">
                    <div className="flex flex-wrap gap-1">
                      <a
                        href={`/ubytovani/${String(row.slug)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded border px-2 py-0.5 text-xs"
                      >
                        Náhled
                      </a>
                      {apiAccessToken ? (
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded border px-2 py-0.5 text-xs"
                          onClick={() =>
                            void adminUpdateAccommodationStatus(apiAccessToken, String(row.id), {
                              published: false,
                              status: 'HIDDEN',
                            }).then(() => load())
                          }
                        >
                          Skrýt
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void syncDemo()}
          className="mt-3 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Synchronizovat demo data
        </button>
      </section>

      <section className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
        <h2 className="font-semibold text-violet-950">Booking.com (skeleton)</h2>
        <p className="mt-1 text-sm text-violet-900">
          Status: {String(booking?.status ?? 'Nepřipojeno')}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            API Key
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1"
              placeholder="BOOKING_API_KEY"
            />
          </label>
          <label className="text-sm">
            Affiliate ID
            <input
              value={affiliateId}
              onChange={(e) => setAffiliateId(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1"
              placeholder="X-Affiliate-Id"
            />
          </label>
          <label className="text-sm">
            Prostředí
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1"
            >
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void saveBooking()} className="rounded-lg border bg-white px-3 py-2 text-sm">
            Uložit
          </button>
          <button type="button" disabled={busy} onClick={() => void testBooking()} className="rounded-lg border bg-white px-3 py-2 text-sm">
            Otestovat připojení
          </button>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-2xl font-bold text-zinc-900">{value}</p>
    </div>
  );
}
