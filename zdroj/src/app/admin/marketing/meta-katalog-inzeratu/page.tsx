'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminMetaCatalogDashboard,
  nestAdminMetaCatalogExportFields,
  nestAdminMetaCatalogExportedListings,
  nestAdminMetaCatalogGet,
  nestAdminMetaCatalogListings,
  nestAdminMetaCatalogLogs,
  nestAdminMetaCatalogPatch,
  nestAdminMetaCatalogPreviewCount,
  nestAdminMetaCatalogPreviewItem,
  nestAdminMetaCatalogQuality,
  nestAdminMetaCatalogStatistics,
  nestAdminMetaCatalogSyncHistory,
  nestAdminMetaCatalogSyncRun,
  nestAdminMetaCatalogTestMeta,
  type MetaCatalogAdminSettings,
  type MetaCatalogDashboard,
  type MetaCatalogExportedListing,
  type MetaCatalogFieldConfig,
  type MetaCatalogItemPreview,
  type MetaCatalogListingPreview,
  type MetaCatalogSyncRun,
} from '@/lib/nest-client';

type Tab =
  | 'dashboard'
  | 'fields'
  | 'preview'
  | 'exported'
  | 'sync'
  | 'quality'
  | 'diagnostics'
  | 'stats'
  | 'carousel';

const SYNC_INTERVALS = [1, 5, 10, 15, 30, 60] as const;
const EXPORT_FILTERS = ['all', 'exported', 'pending', 'error', 'hidden', 'active'] as const;

function statusDot(status: string) {
  if (status === 'online' || status === 'ready' || status === 'ok') return '🟢';
  if (status === 'warning' || status === 'partial') return '🟡';
  return '🔴';
}

function fieldColor(category: string, exported: boolean) {
  if (category === 'sensitive') return 'text-red-700 bg-red-50 border-red-200';
  if (exported) return 'text-emerald-800 bg-emerald-50 border-emerald-200';
  return 'text-zinc-500 bg-zinc-50 border-zinc-200';
}

export default function AdminMetaCatalogPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [tab, setTab] = useState<Tab>('dashboard');
  const [settings, setSettings] = useState<MetaCatalogAdminSettings | null>(null);
  const [dashboard, setDashboard] = useState<MetaCatalogDashboard | null>(null);
  const [exportFields, setExportFields] = useState<MetaCatalogFieldConfig[]>([]);
  const [contactWarning, setContactWarning] = useState('');
  const [listings, setListings] = useState<MetaCatalogListingPreview[]>([]);
  const [exported, setExported] = useState<MetaCatalogExportedListing[]>([]);
  const [syncHistory, setSyncHistory] = useState<MetaCatalogSyncRun[]>([]);
  const [quality, setQuality] = useState<{
    score: number;
    summary: { ok: number; warning: number; error: number };
    checks: Array<{ key: string; label: string; level: string; message: string }>;
  } | null>(null);
  const [statistics, setStatistics] = useState<Record<string, unknown> | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [logs, setLogs] = useState<Array<{ id: string; eventType: string; message: string | null; createdAt: string }>>([]);
  const [itemPreview, setItemPreview] = useState<MetaCatalogItemPreview | null>(null);
  const [previewPropertyId, setPreviewPropertyId] = useState('');
  const [exportFilter, setExportFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [city, setCity] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<{ total: number; withImage: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [s, dash, fields, list, count, exp, hist, qual, stats, lg] = await Promise.all([
      nestAdminMetaCatalogGet(token),
      nestAdminMetaCatalogDashboard(token),
      nestAdminMetaCatalogExportFields(token),
      nestAdminMetaCatalogListings(token, {
        city: city.trim() || undefined,
        propertyType: propertyType.trim() || undefined,
        priceMin: priceMin.trim() || undefined,
        priceMax: priceMax.trim() || undefined,
        search: search.trim() || undefined,
      }),
      nestAdminMetaCatalogPreviewCount(token, {
        city: city.trim() || undefined,
        propertyType: propertyType.trim() || undefined,
        priceMin: priceMin.trim() || undefined,
        priceMax: priceMax.trim() || undefined,
      }),
      nestAdminMetaCatalogExportedListings(token, exportFilter === 'all' ? undefined : exportFilter),
      nestAdminMetaCatalogSyncHistory(token),
      nestAdminMetaCatalogQuality(token),
      nestAdminMetaCatalogStatistics(token),
      nestAdminMetaCatalogLogs(token),
    ]);
    setSettings(s);
    setDashboard(dash);
    setExportFields(fields?.fields ?? []);
    setContactWarning(fields?.contactExportWarning ?? '');
    setListings(list?.items ?? []);
    setPreview(count);
    setExported(exp?.items ?? []);
    setSyncHistory(hist?.items ?? []);
    setQuality(qual);
    setStatistics(stats);
    setLogs(lg ?? []);
  }, [token, city, propertyType, priceMin, priceMax, search, exportFilter]);

  useEffect(() => {
    if (!isLoading && (!token || !user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, token, user, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void refresh();
  }, [token, user?.role, refresh]);

  async function save(patch: Partial<MetaCatalogAdminSettings>) {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    const r = await nestAdminMetaCatalogPatch(token, patch);
    setBusy(false);
    if (!r.ok) {
      setMsg(r.error ?? 'Uložení selhalo.');
      return;
    }
    setSettings(r.settings);
    setMsg('Uloženo.');
    void refresh();
  }

  async function runSync(mode: string) {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    const r = await nestAdminMetaCatalogSyncRun(token, mode);
    setBusy(false);
    if (!r?.ok) {
      setMsg(r?.error ?? 'Synchronizace selhala.');
      return;
    }
    setMsg(`Synchronizace dokončena (${mode}). Exportováno: ${r.exportedCount ?? 0}`);
    void refresh();
  }

  async function loadPreview(propertyId: string) {
    if (!token || !propertyId) return;
    setBusy(true);
    const p = await nestAdminMetaCatalogPreviewItem(token, propertyId);
    setItemPreview(p);
    setBusy(false);
    setTab('preview');
  }

  async function testMeta() {
    if (!token) return;
    setBusy(true);
    const r = await nestAdminMetaCatalogTestMeta(token);
    setDiagnostics(r);
    setBusy(false);
    setTab('diagnostics');
  }

  const chosenIds = Object.entries(selectedIds)
    .filter(([, v]) => v)
    .map(([k]) => k);

  const fieldGroups = useMemo(() => ({
    required: exportFields.filter((f) => f.category === 'required'),
    optional: exportFields.filter((f) => f.category === 'optional'),
    sensitive: exportFields.filter((f) => f.category === 'sensitive'),
  }), [exportFields]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'fields', label: 'Exportní pole' },
    { id: 'preview', label: 'Náhled exportu' },
    { id: 'exported', label: 'Exportované' },
    { id: 'sync', label: 'Synchronizace' },
    { id: 'quality', label: 'Kvalita dat' },
    { id: 'diagnostics', label: 'Diagnostika' },
    { id: 'stats', label: 'Statistiky' },
    { id: 'carousel', label: 'Carousel' },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <Link href="/admin/marketing/meta-centrum" className="text-sm font-bold text-[#e85d00]">
              ← Meta Centrum
            </Link>
            <h1 className="text-lg font-bold">Meta katalog nemovitostí</h1>
            <p className="text-xs text-zinc-500">Automatické Marketing Centrum — feed, synchronizace, ochrana kontaktů</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void testMeta()}
              className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-bold"
            >
              Otestovat Meta
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runSync('full')}
              className="rounded-full bg-[#e85d00] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              Synchronizovat nyní
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${
                tab === t.id ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {msg ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
            {msg}
          </p>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input
              type="checkbox"
              checked={settings?.enabled ?? false}
              onChange={(e) => void save({ enabled: e.target.checked })}
            />
            Zapnout Meta katalog feed (XML / CSV / JSON)
          </label>
          {settings?.lastError ? (
            <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {settings.lastError}
            </p>
          ) : null}
        </section>

        {tab === 'dashboard' && dashboard ? (
          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ['Exportováno', dashboard.counts.exported],
                ['Čeká', dashboard.counts.pending],
                ['Chyby', dashboard.counts.errors],
                ['Skryto', dashboard.counts.hidden],
                ['Aktivní', dashboard.counts.active],
                ['Ve feedu', dashboard.counts.lastItemCount],
              ].map(([label, val]) => (
                <div key={String(label)} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-bold uppercase text-zinc-500">{label}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{val}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="font-bold">Synchronizace</h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">Poslední sync</dt>
                    <dd>{dashboard.sync.lastSyncAt ? new Date(dashboard.sync.lastSyncAt).toLocaleString('cs-CZ') : '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">Další sync</dt>
                    <dd>{dashboard.sync.nextSyncAt ? new Date(dashboard.sync.nextSyncAt).toLocaleString('cs-CZ') : '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">Interval</dt>
                    <dd>{dashboard.sync.syncIntervalMinutes} min</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">Stav</dt>
                    <dd>{dashboard.sync.syncRunning ? 'Běží…' : 'Neaktivní'}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="font-bold">Stav služeb</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {Object.entries(dashboard.services).map(([key, status]) => (
                    <li key={key} className="flex items-center justify-between gap-2">
                      <span className="text-zinc-600">{key}</span>
                      <span>
                        {statusDot(status)} {status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {settings ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ['XML feed', settings.feedXmlUrl],
                  ['CSV feed', settings.feedCsvUrl],
                  ['JSON feed', settings.feedJsonUrl],
                ].map(([label, url]) => (
                  <div key={String(label)} className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
                    <p className="text-xs font-bold uppercase text-zinc-500">{label}</p>
                    <p className="mt-1 break-all font-mono text-xs">{url}</p>
                    <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-bold text-[#e85d00]">
                      Otevřít
                    </a>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {tab === 'fields' ? (
          <section className="space-y-6">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <label className="flex items-start gap-3 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={settings?.allowContactExport ?? false}
                  onChange={(e) => void save({ allowContactExport: e.target.checked })}
                />
                <span>
                  Povolit export kontaktů
                  <p className="mt-1 font-normal text-amber-900">{contactWarning}</p>
                </span>
              </label>
            </div>

            {(['required', 'optional', 'sensitive'] as const).map((group) => (
              <div key={group} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="font-bold capitalize">
                  {group === 'required' ? 'Povinná pole' : group === 'optional' ? 'Volitelná pole' : 'Citlivá pole'}
                </h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {fieldGroups[group].map((f) => (
                    <label
                      key={f.key}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${fieldColor(f.category, f.enabled)}`}
                    >
                      <input
                        type="checkbox"
                        checked={f.enabled}
                        disabled={f.category === 'required' || (f.category === 'sensitive' && !settings?.allowContactExport)}
                        onChange={(e) => {
                          const flags = { ...(settings?.exportFieldFlags ?? {}), [f.key]: e.target.checked };
                          void save({ exportFieldFlags: flags });
                        }}
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="font-bold">Interval automatické synchronizace</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {SYNC_INTERVALS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => void save({ syncIntervalMinutes: m })}
                    className={`rounded-full px-4 py-2 text-xs font-bold ${
                      settings?.syncIntervalMinutes === m
                        ? 'bg-zinc-900 text-white'
                        : 'border border-zinc-300'
                    }`}
                  >
                    {m < 60 ? `${m} min` : '1 hodina'}
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {tab === 'preview' ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
            <h2 className="font-bold">Náhled exportované položky</h2>
            <div className="flex flex-wrap gap-2">
              <input
                value={previewPropertyId}
                onChange={(e) => setPreviewPropertyId(e.target.value)}
                placeholder="ID inzerátu"
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <button
                type="button"
                className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-bold text-white"
                onClick={() => void loadPreview(previewPropertyId.trim())}
              >
                Načíst náhled
              </button>
              {listings[0] ? (
                <button
                  type="button"
                  className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-bold"
                  onClick={() => void loadPreview(listings[0].id)}
                >
                  Náhled prvního inzerátu
                </button>
              ) : null}
            </div>

            {itemPreview ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {itemPreview.fields.map((f) => (
                    <div
                      key={f.key}
                      className={`rounded-lg border px-3 py-2 text-xs ${fieldColor(f.category, f.exported)}`}
                    >
                      <p className="font-bold">{f.label}</p>
                      <p className="mt-1 break-all opacity-80">{f.value || '—'}</p>
                      <p className="mt-1 text-[10px] uppercase">
                        {f.exported ? 'exportováno' : 'vypnuto'}
                      </p>
                    </div>
                  ))}
                </div>

                {!itemPreview.validation.ok ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    {itemPreview.validation.errors.join(' · ')}
                  </div>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-3">
                  {[
                    ['XML', itemPreview.xml],
                    ['CSV', itemPreview.csv],
                    ['JSON', itemPreview.json],
                  ].map(([label, code]) => (
                    <div key={String(label)}>
                      <p className="text-xs font-bold uppercase text-zinc-500">{label}</p>
                      <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-zinc-900 p-3 text-[10px] text-emerald-300">
                        {code}
                      </pre>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-zinc-500">Zadejte ID inzerátu pro náhled exportu.</p>
            )}
          </section>
        ) : null}

        {tab === 'exported' ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap gap-2">
              {EXPORT_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setExportFilter(f)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                    exportFilter === f ? 'bg-zinc-900 text-white' : 'border border-zinc-300'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto rounded-xl border border-zinc-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs font-bold uppercase text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Foto</th>
                    <th className="px-3 py-2">Název</th>
                    <th className="px-3 py-2">Cena</th>
                    <th className="px-3 py-2">Město</th>
                    <th className="px-3 py-2">Stav</th>
                    <th className="px-3 py-2">Export</th>
                    <th className="px-3 py-2">Meta ID</th>
                    <th className="px-3 py-2">Pixel</th>
                    <th className="px-3 py-2">Sync</th>
                  </tr>
                </thead>
                <tbody>
                  {exported.map((row) => (
                    <tr key={row.propertyId} className="border-t border-zinc-100">
                      <td className="px-3 py-2">
                        {row.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={row.image} alt="" className="h-10 w-14 rounded object-cover" />
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-left font-medium hover:underline"
                          onClick={() => void loadPreview(row.propertyId)}
                        >
                          {row.title}
                        </button>
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {row.price != null ? `${row.price.toLocaleString('cs-CZ')} ${row.currency}` : '—'}
                      </td>
                      <td className="px-3 py-2">{row.city}</td>
                      <td className="px-3 py-2">{row.exportStatus}</td>
                      <td className="px-3 py-2 text-xs">
                        {row.lastExportedAt ? new Date(row.lastExportedAt).toLocaleString('cs-CZ') : '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{row.metaProductId ?? '—'}</td>
                      <td className="px-3 py-2">{row.pixelStatus ?? '—'}</td>
                      <td className="px-3 py-2">{row.synced ? '✓' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === 'sync' ? (
          <section className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {[
                ['full', 'Synchronizovat nyní'],
                ['delta', 'Jen změny'],
                ['repair', 'Opravit katalog'],
                ['refresh', 'Obnovit všechny položky'],
                ['clear-cache', 'Vymazat cache'],
                ['regenerate', 'Znovu vytvořit feed'],
                ['restart', 'Restart synchronizace'],
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  disabled={busy}
                  onClick={() => void runSync(mode)}
                  className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-bold disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="font-bold">Historie synchronizací</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs font-bold uppercase text-zinc-500">
                    <tr>
                      <th className="px-2 py-1">Datum</th>
                      <th className="px-2 py-1">Režim</th>
                      <th className="px-2 py-1">Export</th>
                      <th className="px-2 py-1">Změny</th>
                      <th className="px-2 py-1">Chyby</th>
                      <th className="px-2 py-1">Doba</th>
                      <th className="px-2 py-1">Výsledek</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncHistory.map((run) => (
                      <tr key={run.id} className="border-t border-zinc-100">
                        <td className="px-2 py-2">{new Date(run.startedAt).toLocaleString('cs-CZ')}</td>
                        <td className="px-2 py-2">{run.mode}</td>
                        <td className="px-2 py-2 tabular-nums">{run.exportedCount}</td>
                        <td className="px-2 py-2 tabular-nums">{run.changedCount}</td>
                        <td className="px-2 py-2 tabular-nums">{run.errorCount}</td>
                        <td className="px-2 py-2 tabular-nums">{run.durationMs ?? '—'} ms</td>
                        <td className="px-2 py-2">
                          {statusDot(run.result)} {run.result}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="font-bold">Logy</h2>
              <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-xs">
                {logs.map((l) => (
                  <li key={l.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-mono text-zinc-500">{new Date(l.createdAt).toLocaleString('cs-CZ')}</span>
                    {' · '}
                    <strong>{l.eventType}</strong>
                    {l.message ? ` — ${l.message}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {tab === 'quality' && quality ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-4">
              <div
                className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-emerald-500 text-2xl font-bold"
                style={{
                  borderColor:
                    quality.score >= 80 ? '#10b981' : quality.score >= 50 ? '#f59e0b' : '#ef4444',
                }}
              >
                {quality.score}%
              </div>
              <div className="text-sm">
                <p>OK: {quality.summary.ok}</p>
                <p>Upozornění: {quality.summary.warning}</p>
                <p>Chyby: {quality.summary.error}</p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {quality.checks.slice(0, 60).map((c) => (
                <div
                  key={c.key}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    c.level === 'ok'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : c.level === 'warning'
                        ? 'border-amber-200 bg-amber-50 text-amber-900'
                        : 'border-red-200 bg-red-50 text-red-900'
                  }`}
                >
                  <p className="font-bold">{c.label}</p>
                  <p>{c.message}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {tab === 'diagnostics' ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold">Diagnostika Meta</h2>
            {!diagnostics ? (
              <p className="mt-3 text-sm text-zinc-500">Klikněte na „Otestovat Meta“ v hlavičce.</p>
            ) : (
              <ul className="mt-4 space-y-2 text-sm">
                {(
                  (diagnostics.diagnostics as { items?: Array<{ key: string; label: string; level: string; message: string }> })
                    ?.items ?? []
                ).map((item) => (
                  <li key={item.key} className="flex justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2">
                    <span>{item.label}</span>
                    <span>
                      {statusDot(item.level)} {item.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {tab === 'stats' && statistics ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ['Zobrazení produktů', statistics.productViews],
                  ['Kliknutí', statistics.clicks],
                  ['Remarketing publika', statistics.remarketingAudiences],
                ] as [string, unknown][]
              ).map(([label, val]) => (
                <div key={String(label)} className="rounded-xl bg-zinc-50 p-4">
                  <p className="text-xs font-bold uppercase text-zinc-500">{label}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{String(val ?? 0)}</p>
                </div>
              ))}
            </div>
            {statistics.events && typeof statistics.events === 'object' ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {Object.entries(statistics.events as Record<string, number>).map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                    <span className="text-zinc-500">{k}</span>
                    <span className="ml-2 font-bold tabular-nums">{v}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {tab === 'carousel' ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
            <h2 className="font-bold">Carousel reklamy — výběr inzerátů</h2>
            <div className="flex flex-wrap gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Hledat…"
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Město"
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <button type="button" className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-bold" onClick={() => void refresh()}>
                Filtrovat
              </button>
            </div>
            {preview ? (
              <p className="text-sm text-zinc-600">
                Aktivních: <strong>{preview.total}</strong> · exportovatelných: <strong>{preview.withImage}</strong>
              </p>
            ) : null}
            <div className="overflow-x-auto rounded-xl border border-zinc-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs font-bold uppercase text-zinc-500">
                  <tr>
                    <th className="px-3 py-2" />
                    <th className="px-3 py-2">Název</th>
                    <th className="px-3 py-2">Město</th>
                    <th className="px-3 py-2">Cena</th>
                    <th className="px-3 py-2">Foto</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((row) => (
                    <tr key={row.id} className="border-t border-zinc-100">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedIds[row.id])}
                          disabled={!row.hasImage}
                          onChange={(e) => setSelectedIds((p) => ({ ...p, [row.id]: e.target.checked }))}
                        />
                      </td>
                      <td className="px-3 py-2">{row.title}</td>
                      <td className="px-3 py-2">{row.city}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {row.price != null ? `${row.price.toLocaleString('cs-CZ')} ${row.currency}` : '—'}
                      </td>
                      <td className="px-3 py-2">{row.hasImage ? '✓' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || chosenIds.length === 0}
                className="rounded-full bg-purple-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                onClick={() => void save({ carouselListingIds: chosenIds })}
              >
                Uložit výběr ({chosenIds.length})
              </button>
              <a
                href={settings ? `${settings.carouselJsonUrl}${chosenIds.length ? `?ids=${chosenIds.join(',')}` : ''}` : '#'}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-bold"
              >
                Carousel JSON
              </a>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
