'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminMetaCenterDashboard,
  nestAdminMetaCenterDiagnostics,
  nestAdminMetaCenterLogs,
  nestAdminMetaCenterPatchCapi,
  nestAdminMetaCenterPatchSettings,
  nestAdminMetaCenterPixelTest,
  nestAdminMetaCenterRegenerateFeeds,
  nestAdminMetaCenterTestAll,
  nestAdminMetaCenterTestService,
  nestAdminMetaCenterValidateFeed,
  type MetaCenterDashboard,
  type MetaCenterEventLogRow,
  type MetaCenterSettings,
  type MetaDiagnosticLevel,
} from '@/lib/nest-client';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'settings', label: 'Nastavení' },
  { id: 'pixel', label: 'Pixel' },
  { id: 'capi', label: 'Conversions API' },
  { id: 'commerce', label: 'Commerce' },
  { id: 'feeds', label: 'Feedy' },
  { id: 'logs', label: 'Logy' },
  { id: 'remarketing', label: 'Remarketing' },
  { id: 'campaigns', label: 'Kampaně' },
  { id: 'mapping', label: 'Mapování' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const PIXEL_TEST_EVENTS = [
  'PageView',
  'ViewContent',
  'Search',
  'Lead',
  'CompleteRegistration',
  'Contact',
  'PurchaseCredits',
  'Favorite',
  'Share',
  'MessageSeller',
  'VideoPlay',
] as const;

const CAPI_EVENTS = [
  'PageView',
  'ViewContent',
  'Search',
  'Lead',
  'Contact',
  'CompleteRegistration',
  'Favorite',
  'PhoneReveal',
  'MessageSeller',
  'PurchaseCredits',
  'PromotionPurchase',
  'VideoPlay',
] as const;

const LOG_FILTERS = [
  { id: '', label: 'Vše' },
  { id: 'PageView', label: 'PageView' },
  { id: 'ViewContent', label: 'ViewContent' },
  { id: 'Lead', label: 'Lead' },
  { id: 'Search', label: 'Search' },
  { id: 'CompleteRegistration', label: 'Registration' },
  { id: 'PurchaseCredits', label: 'Purchase' },
  { id: 'Favorite', label: 'Favorite' },
  { id: 'Share', label: 'Share' },
  { id: 'PhoneReveal', label: 'Phone' },
  { id: 'MessageSeller', label: 'WhatsApp' },
  { id: 'VideoPlay', label: 'Video' },
  { id: 'error', label: 'Error' },
];

function levelDot(level: MetaDiagnosticLevel) {
  if (level === 'ok') return '🟢';
  if (level === 'warning') return '🟡';
  return '🔴';
}

function levelClass(level: MetaDiagnosticLevel) {
  if (level === 'ok') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  if (level === 'warning') return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-red-200 bg-red-50 text-red-900';
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function MetaCentrumPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [tab, setTab] = useState<TabId>('dashboard');
  const [dash, setDash] = useState<MetaCenterDashboard | null>(null);
  const [form, setForm] = useState<Partial<MetaCenterSettings>>({});
  const [logs, setLogs] = useState<MetaCenterEventLogRow[]>([]);
  const [logFilter, setLogFilter] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testReport, setTestReport] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [d, l] = await Promise.all([
      nestAdminMetaCenterDashboard(token),
      nestAdminMetaCenterLogs(token, {
        eventType: logFilter || undefined,
        take: 80,
      }),
    ]);
    if (d) {
      setDash(d);
      setForm(d.settings);
    }
    setLogs(l?.items ?? []);
  }, [token, logFilter]);

  useEffect(() => {
    if (!isLoading && (!token || !user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, token, user, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void refresh();
  }, [token, user?.role, refresh]);

  const services = dash?.services ?? [];
  const diagnostics = dash?.diagnostics;

  const settingsFields = useMemo(
    () =>
      [
        ['facebookAppId', 'Facebook App ID'],
        ['facebookAppSecret', 'Facebook App Secret', true],
        ['facebookPagesAppId', 'Facebook Pages App ID'],
        ['facebookPagesSecret', 'Facebook Pages Secret', true],
        ['businessManagerId', 'Business Manager ID'],
        ['commerceManagerId', 'Commerce Manager ID'],
        ['catalogId', 'Catalog ID'],
        ['datasetId', 'Dataset ID'],
        ['pixelId', 'Pixel ID'],
        ['pixelName', 'Název Pixelu'],
        ['conversionsApiToken', 'Conversions API Token', true],
        ['webhookVerifyToken', 'Webhook Verify Token', true],
        ['webhookSecret', 'Webhook Secret', true],
        ['frontendUrl', 'Frontend URL'],
        ['backendUrl', 'Backend URL'],
        ['redirectUri', 'Redirect URI'],
        ['callbackUrl', 'Callback URL'],
        ['encryptionKey', 'Encryption Key', true],
        ['graphApiVersion', 'Graph API Version'],
        ['domainVerification', 'Domain Verification'],
      ] as const,
    [],
  );

  async function saveSettings() {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    const patch: Record<string, unknown> = {};
    const copyKeys = [
      'facebookAppId',
      'facebookPagesAppId',
      'businessManagerId',
      'commerceManagerId',
      'catalogId',
      'datasetId',
      'pixelId',
      'pixelName',
      'frontendUrl',
      'backendUrl',
      'redirectUri',
      'callbackUrl',
      'graphApiVersion',
      'domainVerification',
      'catalogFeedEnabled',
    ] as const;
    for (const k of copyKeys) {
      if (form[k] !== undefined) patch[k] = form[k];
    }
    const secrets = [
      'facebookAppSecret',
      'facebookPagesSecret',
      'conversionsApiToken',
      'webhookVerifyToken',
      'webhookSecret',
      'encryptionKey',
    ] as const;
    for (const k of secrets) {
      const v = (form as Record<string, unknown>)[k];
      if (typeof v === 'string' && v.trim()) patch[k] = v.trim();
    }
    const r = await nestAdminMetaCenterPatchSettings(token, patch);
    setBusy(false);
    if (!r.ok) {
      setMsg(r.error ?? 'Uložení selhalo.');
      return;
    }
    setForm(r.settings);
    setMsg('Nastavení uloženo.');
    void refresh();
  }

  async function runTestAll() {
    if (!token) return;
    setBusy(true);
    const report = await nestAdminMetaCenterTestAll(token);
    setTestReport(report);
    setBusy(false);
    setMsg('Diagnostika dokončena.');
    void refresh();
  }

  async function runDiagnostics() {
    if (!token) return;
    setBusy(true);
    const d = await nestAdminMetaCenterDiagnostics(token);
    if (d && dash) setDash({ ...dash, diagnostics: d });
    setBusy(false);
    void refresh();
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] text-zinc-900">
      <header className="border-b border-zinc-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <Link href="/admin/bonusove-akce" className="text-sm font-semibold text-[#1877f2]">
              ← Marketing
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">Meta Centrum</h1>
            <p className="text-sm text-zinc-500">
              Pixel, Conversions API, Commerce Manager, katalog a automatické reklamy
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void runDiagnostics()}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50"
            >
              Diagnostika
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runTestAll()}
              className="rounded-lg bg-[#1877f2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#166fe5] disabled:opacity-50"
            >
              Otestovat vše
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                tab === t.id ? 'bg-[#1877f2] text-white' : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        {msg ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
            {msg}
          </p>
        ) : null}

        {tab === 'dashboard' ? (
          <>
            {diagnostics ? (
              <section className="grid gap-3 sm:grid-cols-3">
                {(['ok', 'warning', 'error'] as const).map((k) => (
                  <div
                    key={k}
                    className={`rounded-2xl border p-4 ${levelClass(k === 'ok' ? 'ok' : k === 'warning' ? 'warning' : 'error')}`}
                  >
                    <p className="text-2xl font-bold">{diagnostics.summary[k]}</p>
                    <p className="text-sm capitalize">{k === 'ok' ? 'OK' : k === 'warning' ? 'Upozornění' : 'Chyby'}</p>
                  </div>
                ))}
              </section>
            ) : null}

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {services.map((s) => (
                <div
                  key={s.key}
                  className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="font-semibold leading-tight">{s.label}</h3>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                        s.status === 'online'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-zinc-200 text-zinc-600'
                      }`}
                    >
                      {s.status === 'online' ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <dl className="space-y-1 text-xs text-zinc-500">
                    <div>
                      <dt className="inline">Sync: </dt>
                      <dd className="inline">
                        {s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString('cs-CZ') : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">Vytvořeno: </dt>
                      <dd className="inline">{new Date(s.createdAt).toLocaleDateString('cs-CZ')}</dd>
                    </div>
                    <div>
                      <dt className="inline">Graph API: </dt>
                      <dd className="inline">{s.graphApiVersion}</dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      if (!token) return;
                      await nestAdminMetaCenterTestService(token, s.key);
                      void refresh();
                    }}
                    className="mt-3 w-full rounded-lg border border-[#1877f2] px-3 py-1.5 text-xs font-semibold text-[#1877f2] hover:bg-blue-50"
                  >
                    Otestovat
                  </button>
                </div>
              ))}
            </section>

            {diagnostics ? (
              <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-lg font-bold">Diagnostika</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {diagnostics.items.map((item) => (
                    <div
                      key={item.key}
                      className={`rounded-xl border px-3 py-2 text-sm ${levelClass(item.level)}`}
                    >
                      <span className="mr-2">{levelDot(item.level)}</span>
                      <strong>{item.label}:</strong> {item.message}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {testReport ? (
              <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <h2 className="mb-2 text-lg font-bold">Report „Otestovat vše“</h2>
                <pre className="max-h-64 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs">
                  {JSON.stringify(testReport, null, 2)}
                </pre>
              </section>
            ) : null}
          </>
        ) : null}

        {tab === 'settings' ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold">Meta nastavení</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {settingsFields.map(([key, label, secret]) => {
                const maskedKey = secret ? `${key}Masked` : null;
                const masked = maskedKey
                  ? String((form as Record<string, unknown>)[maskedKey] ?? '')
                  : '';
                return (
                  <label key={key} className="block text-sm">
                    <span className="mb-1 block font-medium text-zinc-700">{label}</span>
                    <input
                      type={secret ? 'password' : 'text'}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2"
                      placeholder={secret && masked ? masked : undefined}
                      value={secret ? '' : String((form as Record<string, unknown>)[key] ?? '')}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm((f) => ({
                          ...f,
                          ...(secret ? { [key]: val || undefined } : { [key]: val || null }),
                        }));
                      }}
                    />
                  </label>
                );
              })}
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={Boolean(form.catalogFeedEnabled)}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, catalogFeedEnabled: e.target.checked }))
                  }
                />
                Povolit katalogový feed (aktivuje export inzerátů)
              </label>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveSettings()}
              className="mt-6 rounded-lg bg-[#1877f2] px-6 py-2 text-sm font-semibold text-white hover:bg-[#166fe5] disabled:opacity-50"
            >
              Uložit nastavení
            </button>
          </section>
        ) : null}

        {tab === 'pixel' && dash ? (
          <section className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Pixel ID', dash.pixel.pixelId ?? '—'],
                ['Název', dash.pixel.pixelName ?? '—'],
                ['Událostí dnes', String(dash.pixel.eventsToday)],
                ['Událostí měsíc', String(dash.pixel.eventsMonth)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="text-xs text-zinc-500">{k}</p>
                  <p className="text-lg font-bold">{v}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 font-bold">Testovací události</h3>
              <div className="flex flex-wrap gap-2">
                {PIXEL_TEST_EVENTS.map((ev) => (
                  <button
                    key={ev}
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      if (!token) return;
                      setBusy(true);
                      const r = await nestAdminMetaCenterPixelTest(token, ev);
                      setBusy(false);
                      setMsg(r.ok ? `Odesláno: ${ev}` : r.error ?? 'Chyba');
                      void refresh();
                    }}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50"
                  >
                    {ev}
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {tab === 'capi' && dash ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold">Conversions API</h2>
            <p className="mb-4 text-sm text-zinc-600">
              Dataset: <strong>{dash.capi.datasetId ?? '—'}</strong> · Token:{' '}
              {dash.capi.tokenConfigured ? 'nastaven' : 'chybí'} · Stav: {dash.capi.status}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {CAPI_EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(dash.capi.toggles[ev])}
                    onChange={async (e) => {
                      if (!token) return;
                      const toggles = { ...dash.capi.toggles, [ev]: e.target.checked };
                      await nestAdminMetaCenterPatchCapi(token, toggles);
                      void refresh();
                    }}
                  />
                  {ev}
                </label>
              ))}
            </div>
          </section>
        ) : null}

        {tab === 'commerce' && dash ? (
          <section className="grid gap-4 sm:grid-cols-2">
            {[
              { title: 'Business Manager', id: dash.settings.businessManagerId },
              { title: 'Commerce Manager', id: dash.settings.commerceManagerId },
              { title: 'Catalog', id: dash.settings.catalogId },
              { title: 'Dataset', id: dash.settings.datasetId },
              { title: 'Pixel', id: dash.settings.pixelId },
              { title: 'Feed', id: dash.catalog.enabled ? 'aktivní' : 'vypnutý' },
            ].map((row) => (
              <div key={row.title} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <h3 className="font-bold">{row.title}</h3>
                <p className="text-sm text-zinc-500">ID: {row.id ?? '—'}</p>
                <p className="text-xs text-zinc-400">
                  Sync:{' '}
                  {dash.catalog.lastGeneratedAt
                    ? new Date(dash.catalog.lastGeneratedAt).toLocaleString('cs-CZ')
                    : '—'}
                </p>
              </div>
            ))}
          </section>
        ) : null}

        {tab === 'feeds' && dash ? (
          <section className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Inzerátů', dash.feedStats?.itemCount ?? dash.catalog.lastItemCount],
                ['Fotografií', dash.feedStats?.photoCount ?? '—'],
                ['Videí', dash.feedStats?.videoCount ?? '—'],
                ['Velikost', dash.feedStats ? formatBytes(dash.feedStats.sizeBytes) : '—'],
              ].map(([k, v]) => (
                <div key={String(k)} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="text-xs text-zinc-500">{k}</p>
                  <p className="text-xl font-bold">{v}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-zinc-600">
                Poslední export:{' '}
                {dash.feedStats?.lastExport ?? dash.catalog.lastGeneratedAt ?? '—'} · Generování:{' '}
                {dash.feedStats?.generationMs ?? '—'} ms · Chyba:{' '}
                {dash.feedStats?.lastError ?? dash.catalog.lastError ?? 'žádná'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    if (!token) return;
                    setBusy(true);
                    const r = await nestAdminMetaCenterRegenerateFeeds(token);
                    setBusy(false);
                    setMsg(r.ok ? 'Feed obnoven.' : r.error ?? 'Chyba');
                    void refresh();
                  }}
                  className="rounded-lg bg-[#1877f2] px-4 py-2 text-sm font-semibold text-white"
                >
                  Obnovit feed
                </button>
                {[
                  ['XML', dash.catalog.feedXmlUrl ?? '/meta/feed.xml'],
                  ['CSV', dash.catalog.feedCsvUrl],
                  ['JSON', dash.catalog.feedJsonUrl ?? '/meta/feed.json'],
                ].map(([label, url]) => (
                  <a
                    key={String(label)}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold hover:bg-zinc-50"
                  >
                    Otevřít {label}
                  </a>
                ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    if (!token) return;
                    const r = await nestAdminMetaCenterValidateFeed(token);
                    setMsg(r?.ok ? `Feed OK (${r.itemCount} položek)` : r?.errors.join(', ') ?? 'Chyba');
                  }}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold"
                >
                  Validovat feed
                </button>
              </div>
            </div>
            <p className="text-sm text-zinc-500">
              Carousel a výběr inzerátů:{' '}
              <Link href="/admin/marketing/meta-katalog-inzeratu" className="text-[#1877f2] underline">
                Meta katalog inzerátů
              </Link>
            </p>
          </section>
        ) : null}

        {tab === 'logs' ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap gap-2">
              {LOG_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setLogFilter(f.id)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    logFilter === f.id ? 'bg-[#1877f2] text-white' : 'bg-zinc-100 text-zinc-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-zinc-500">
                    <th className="py-2 pr-2">Datum</th>
                    <th className="py-2 pr-2">Událost</th>
                    <th className="py-2 pr-2">Inzerát</th>
                    <th className="py-2 pr-2">Výsledek</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2 pr-2">Zdroj</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((row) => (
                    <tr key={row.id} className="border-b border-zinc-100">
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleString('cs-CZ')}
                      </td>
                      <td className="py-2 pr-2">{row.eventType}</td>
                      <td className="py-2 pr-2 font-mono text-xs">{row.listingId ?? '—'}</td>
                      <td className="py-2 pr-2">{row.result}</td>
                      <td className="py-2 pr-2">{row.status ?? '—'}</td>
                      <td className="py-2 pr-2">{row.source ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === 'remarketing' && dash ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-bold">Remarketing publika</h2>
            <ul className="space-y-2">
              {(Array.isArray(dash.settings.remarketingAudiences)
                ? dash.settings.remarketingAudiences
                : []
              ).map((a: { id?: string; label?: string; enabled?: boolean; description?: string }) => (
                <li
                  key={a.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3"
                >
                  <div>
                    <p className="font-semibold">{a.label}</p>
                    <p className="text-sm text-zinc-500">{a.description}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      a.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200'
                    }`}
                  >
                    {a.enabled ? 'Aktivní' : 'Neaktivní'}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-zinc-500">
              Publika se synchronizují do Meta po doplnění Business Manager ID a access tokenu.
            </p>
          </section>
        ) : null}

        {tab === 'campaigns' && dash ? (
          <section className="space-y-6">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-lg font-bold">Automatické kampaně</h2>
              <ul className="space-y-2">
                {(Array.isArray(dash.settings.autoCampaignRules)
                  ? dash.settings.autoCampaignRules
                  : []
                ).map((r: { id?: string; label?: string; enabled?: boolean; trigger?: string }) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-2 text-sm"
                  >
                    <span className="font-medium">{r.label}</span>
                    <span className="text-zinc-500">{r.trigger}</span>
                    <span>{r.enabled ? '✓' : '—'}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-lg font-bold">Formáty reklam</h2>
              <div className="flex flex-wrap gap-2">
                {Object.entries(dash.settings.adFormatFlags ?? {}).map(([k, on]) => (
                  <span
                    key={k}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      on ? 'bg-blue-100 text-blue-800' : 'bg-zinc-100 text-zinc-500'
                    }`}
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {tab === 'mapping' && dash ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-bold">Mapování Pixelu</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(dash.settings.pixelMapping ?? {}).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                  <span className="font-semibold capitalize">{k.replace(/_/g, ' ')}</span>
                  <span className="text-zinc-500"> → {v}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
