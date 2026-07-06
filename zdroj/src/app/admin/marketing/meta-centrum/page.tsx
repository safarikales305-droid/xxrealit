'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminMetaCenterApiLogs,
  nestAdminMetaCenterConnectUrl,
  nestAdminMetaCenterApps,
  nestAdminMetaCenterLoginOAuthUrl,
  nestAdminMetaCenterConnectionStatus,
  nestAdminMetaCenterDashboard,
  nestAdminMetaCenterDiagnostics,
  nestAdminMetaCenterFix,
  nestAdminMetaCenterLogs,
  nestAdminMetaCenterPatchCapi,
  nestAdminMetaCenterProvision,
  nestAdminMetaCenterPixelTest,
  nestAdminMetaCenterRegenerateFeeds,
  nestAdminMetaCenterSync,
  nestAdminMetaCenterTestAll,
  nestAdminMetaCenterTestService,
  nestAdminMetaCenterValidateFeed,
  type MetaCenterApiLogRow,
  type MetaCenterDashboard,
  type MetaCenterEventLogRow,
  type MetaCenterSettings,
  type MetaConnectionCheck,
  type MetaConnectionStatusLevel,
  type MetaDiagnosticLevel,
  type FacebookAppsConfig,
} from '@/lib/nest-client';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'settings', label: 'Nastavení' },
  { id: 'pixel', label: 'Pixel' },
  { id: 'capi', label: 'Conversions API' },
  { id: 'commerce', label: 'Commerce' },
  { id: 'feeds', label: 'Feedy' },
  { id: 'logs', label: 'Logy událostí' },
  { id: 'api-logs', label: 'Meta API logy' },
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

function serviceStatusBadge(status: 'online' | 'offline' | 'optional', statusLabel: string) {
  if (status === 'online') {
    return { text: statusLabel || 'Online', className: 'bg-emerald-100 text-emerald-800' };
  }
  if (status === 'optional') {
    return { text: statusLabel || 'Nenastaveno (volitelné)', className: 'bg-zinc-100 text-zinc-600' };
  }
  return { text: statusLabel || 'Offline', className: 'bg-red-100 text-red-800' };
}

const META_SOURCE_LABELS: Record<string, string> = {
  whatsapp_module: 'WhatsApp modul',
  social_autopost: 'Sociální sítě modul',
  user_facebook_pages: 'Uživatelské Facebook stránky',
  facebook_login: 'Facebook Login',
  meta_connect: 'Meta Connect',
  meta_catalog: 'Meta katalog',
  env: 'ENV',
  graph_api: 'Graph API',
  feed: 'Feed',
};

function connectionCheckStatus(item: MetaConnectionCheck): MetaConnectionStatusLevel {
  if (item.status) return item.status;
  if (item.optional && !item.connected) return 'optional';
  if (item.connected) return 'online';
  return 'missing_config';
}

function connectionCheckClass(item: MetaConnectionCheck) {
  const status = connectionCheckStatus(item);
  if (status === 'online') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  if (status === 'optional') return 'border-zinc-200 bg-zinc-50 text-zinc-600';
  if (status === 'api_error') return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-red-200 bg-red-50 text-red-900';
}

function connectionCheckIcon(item: MetaConnectionCheck) {
  const status = connectionCheckStatus(item);
  if (status === 'online') return '✓';
  if (status === 'optional') return '○';
  if (status === 'api_error') return '⚠';
  return '✗';
}

function connectionCheckLabel(item: MetaConnectionCheck) {
  const status = connectionCheckStatus(item);
  if (status === 'online') return 'Online / Připojeno';
  if (status === 'optional') return 'Nenastaveno (volitelné)';
  if (status === 'api_error') return item.error ?? 'Chyba API';
  return item.error ?? 'Chybí konfigurace';
}

export default function MetaCentrumPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [tab, setTab] = useState<TabId>('dashboard');
  const [dash, setDash] = useState<MetaCenterDashboard | null>(null);
  const [connection, setConnection] = useState<{
    checklist: Array<{ key: string; label: string; connected: boolean; optional?: boolean }>;
    diagnostics: MetaConnectionCheck[];
  } | null>(null);
  const [logs, setLogs] = useState<MetaCenterEventLogRow[]>([]);
  const [apiLogs, setApiLogs] = useState<MetaCenterApiLogRow[]>([]);
  const [logFilter, setLogFilter] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [appsConfig, setAppsConfig] = useState<FacebookAppsConfig | null>(null);
  const [testReport, setTestReport] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [d, l, c, api, apps] = await Promise.all([
      nestAdminMetaCenterDashboard(token),
      nestAdminMetaCenterLogs(token, {
        eventType: logFilter || undefined,
        take: 80,
      }),
      nestAdminMetaCenterConnectionStatus(token),
      nestAdminMetaCenterApiLogs(token, 80),
      nestAdminMetaCenterApps(token),
    ]);
    if (d) setDash(d);
    setLogs(l?.items ?? []);
    if (c) setConnection({ checklist: c.checklist, diagnostics: c.diagnostics });
    setApiLogs(api?.items ?? []);
    setAppsConfig(apps ?? c?.apps ?? d?.settings.facebookApps ?? null);
  }, [token, logFilter]);

  useEffect(() => {
    const meta = params.get('meta');
    if (meta === 'connected') setMsg('Meta účet byl úspěšně připojen a konfigurace načtena.');
    if (meta === 'error') {
      const reason = params.get('reason') ?? 'neznámá';
      const redirectUri = params.get('redirect_uri');
      setMsg(
        redirectUri
          ? `Chyba připojení: ${reason}\n\nPřidejte do Meta Developers (Pages App) tuto Valid OAuth Redirect URI:\n${redirectUri}`
          : `Chyba připojení: ${reason}`,
      );
    }
  }, [params]);

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
  const catalogGraph = dash?.catalogGraph;

  const settingsFields = useMemo(
    () =>
      [
        ['facebookAppId', 'Facebook App ID'],
        ['facebookPagesAppId', 'Facebook Pages App ID'],
        ['businessManagerId', 'Business Manager ID'],
        ['commerceManagerId', 'Commerce Manager ID'],
        ['catalogId', 'Catalog ID'],
        ['catalogName', 'Catalog Name'],
        ['datasetId', 'Dataset ID'],
        ['pixelId', 'Pixel ID'],
        ['pixelName', 'Název Pixelu'],
        ['adAccountId', 'Ad Account ID'],
        ['adAccountName', 'Ad Account Name'],
        ['pageId', 'Page ID'],
        ['pageName', 'Page Name'],
        ['instagramBusinessId', 'Instagram Business ID'],
        ['instagramUsername', 'Instagram'],
        ['whatsappBusinessAccountId', 'WhatsApp Business ID'],
        ['whatsappPhoneNumberId', 'WhatsApp Phone ID'],
        ['testEventCode', 'Test Event Code'],
        ['frontendUrl', 'Frontend URL'],
        ['backendUrl', 'Backend URL'],
        ['redirectUri', 'Redirect URI'],
        ['callbackUrl', 'Callback URL'],
        ['graphApiVersion', 'Graph API Version'],
        ['domainVerification', 'Domain Verification'],
        ['metaConnectedUserName', 'Připojený uživatel'],
        ['metaConnectedAt', 'Připojeno'],
        ['lastAutoSyncAt', 'Poslední synchronizace'],
      ] as const,
    [],
  );

  async function connectMeta() {
    if (!token) return;
    setBusy(true);
    const r = await nestAdminMetaCenterConnectUrl(token);
    setBusy(false);
    if (!r?.url) {
      setMsg('Nepodařilo se získat OAuth URL.');
      return;
    }
    if (r.appId && appsConfig?.login.appId && r.appId === appsConfig.login.appId) {
      setMsg('Chyba: Meta Connect používá Login App ID místo Pages App ID. Zkontrolujte FACEBOOK_PAGES_APP_ID v Railway.');
      return;
    }
    window.location.href = r.url;
  }

  async function applyFix(action: string) {
    if (!token) return;
    setBusy(true);
    const r = await nestAdminMetaCenterFix(token, action);
    setBusy(false);
    setMsg(r.ok ? r.message ?? 'Oprava dokončena.' : r.error ?? 'Oprava selhala.');
    void refresh();
  }

  async function provision(resource: string) {
    if (!token) return;
    setBusy(true);
    const r = await nestAdminMetaCenterProvision(token, resource);
    setBusy(false);
    setMsg(r.ok ? `Vytvořeno (${resource}).` : r.error ?? 'Vytvoření selhalo.');
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
    await nestAdminMetaCenterDiagnostics(token);
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
              onClick={() => void connectMeta()}
              className="rounded-lg bg-[#1877f2] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#166fe5] disabled:opacity-50"
            >
              {dash?.settings.isMetaConnected ? 'Obnovit Meta oprávnění' : 'Připojit Meta účet'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (!token) return;
                setBusy(true);
                const r = await nestAdminMetaCenterSync(token);
                setBusy(false);
                setMsg(r.ok ? 'Synchronizace dokončena.' : r.error ?? 'Sync selhal.');
                void refresh();
              }}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50"
            >
              Synchronizovat
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
          <p className="whitespace-pre-wrap rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
            {msg}
          </p>
        ) : null}

        {tab === 'dashboard' ? (
          <>
            {connection?.checklist ? (
              <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-lg font-bold">Stav připojení</h2>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {connection.checklist.map((item) => (
                    <div
                      key={item.key}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                        item.optional
                          ? 'border-zinc-200 bg-zinc-50 text-zinc-600'
                          : item.connected
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                            : 'border-red-200 bg-red-50 text-red-900'
                      }`}
                    >
                      <span>
                        {item.optional ? '○' : item.connected ? '✓' : '✗'}
                      </span>
                      <span>
                        {item.label}
                        {item.optional ? ' — Nenastaveno (volitelné)' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {connection?.diagnostics?.length ? (
              <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-lg font-bold">Diagnostika připojení</h2>
                <div className="space-y-2">
                  {connection.diagnostics.map((item) => (
                    <div
                      key={item.key}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${connectionCheckClass(item)}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{connectionCheckIcon(item)}</span>
                          <strong>{item.label}</strong>
                          <span>{connectionCheckLabel(item)}</span>
                        </div>
                        {item.detail ? (
                          <p className="mt-1 text-xs opacity-80">{item.detail}</p>
                        ) : null}
                        {item.source ? (
                          <p className="mt-1 text-xs opacity-70">
                            Zdroj: {META_SOURCE_LABELS[item.source] ?? item.source}
                          </p>
                        ) : null}
                      </div>
                      {!item.connected && connectionCheckStatus(item) !== 'optional' ? (
                        item.fixHref ? (
                          <Link
                            href={item.fixHref}
                            className="rounded-lg border border-current px-3 py-1 text-xs font-semibold whitespace-nowrap"
                          >
                            Opravit
                          </Link>
                        ) : item.fixAction ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void applyFix(item.fixAction!)}
                            className="rounded-lg border border-current px-3 py-1 text-xs font-semibold"
                          >
                            Opravit
                          </button>
                        ) : null
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void provision('pixel')}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold"
                  >
                    Vytvořit Pixel
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void provision('catalog')}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold"
                  >
                    Vytvořit Catalog
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void provision('dataset')}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold"
                  >
                    Vytvořit Dataset
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void provision('audience')}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold"
                  >
                    Vytvořit Remarketing Audience
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void provision('capi')}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold"
                  >
                    Aktivovat Conversions API
                  </button>
                </div>
              </section>
            ) : null}

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
              {services.map((s) => {
                const badge = serviceStatusBadge(s.status, s.statusLabel);
                return (
                <div
                  key={s.key}
                  className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="font-semibold leading-tight">{s.label}</h3>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${badge.className}`}
                    >
                      {badge.text}
                    </span>
                  </div>
                  {s.detail ? (
                    <p className="mb-2 text-xs text-zinc-500 break-words">{s.detail}</p>
                  ) : null}
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
              );
              })}
            </section>

            {catalogGraph ? (
              <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-lg font-bold">Diagnostika katalogu (Graph API)</h2>
                <p className="mb-4 whitespace-pre-wrap text-xs text-zinc-500">
                  Ověřeno: {new Date(catalogGraph.graphCheckedAt).toLocaleString('cs-CZ')}
                  {catalogGraph.graphErrorJson
                    ? `\nGraph API chyba: ${catalogGraph.graphErrorJson}`
                    : catalogGraph.graphError
                      ? ` · ${catalogGraph.graphError}`
                      : ''}
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ['Business ID', catalogGraph.businessId],
                    ['Catalog ID', catalogGraph.catalogId],
                    ['Commerce Manager ID', catalogGraph.commerceManagerId],
                    ['Dataset ID', catalogGraph.datasetId],
                    ['Název katalogu', catalogGraph.catalogName],
                    ['Commerce Manager', catalogGraph.commerceManagerName ?? catalogGraph.commerceMessage],
                    ['Počet produktů', catalogGraph.productCount ?? '—'],
                    [
                      'Poslední synchronizace',
                      catalogGraph.lastLocalSync
                        ? new Date(catalogGraph.lastLocalSync).toLocaleString('cs-CZ')
                        : '—',
                    ],
                    [
                      'Poslední aktualizace katalogu',
                      catalogGraph.lastCatalogUpdate
                        ? new Date(catalogGraph.lastCatalogUpdate).toLocaleString('cs-CZ')
                        : '—',
                    ],
                    ['Chyby importu', catalogGraph.importErrorCount],
                    ['Počet obrázků', catalogGraph.metaImagesLoaded ?? '—'],
                    ['Počet videí', catalogGraph.metaVideoCount ?? '—'],
                    ['Facebook Catalog', catalogGraph.catalogMessage],
                  ].map(([label, val]) => (
                    <div key={String(label)} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                      <p className="text-xs font-medium text-zinc-500">{label}</p>
                      <p className="mt-1 break-all font-mono text-xs">{String(val ?? '—')}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

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

        {tab === 'settings' && dash ? (
          <section className="space-y-6">
            <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-blue-900">A) Facebook Login</h2>
              <p className="mt-1 text-sm text-blue-800">
                Aplikace <strong>{appsConfig?.login.appName ?? 'xxrealitpage'}</strong> — registrace a přihlášení uživatelů
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ['Login App ID', appsConfig?.login.appId ?? dash.settings.facebookAppId],
                  ['Login App Secret', appsConfig?.login.appSecretConfigured ? appsConfig.login.appSecretMasked : 'chybí'],
                  ['Login Redirect URI', appsConfig?.login.oauthRedirectUri ?? dash.settings.loginOAuthRedirectUri],
                  ['Stav OAuth loginu', appsConfig?.login.configured ? 'nastaveno' : 'chybí ENV'],
                ].map(([label, val]) => (
                  <div key={String(label)} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm">
                    <p className="text-xs font-medium text-zinc-500">{label}</p>
                    <p className="mt-1 break-all font-mono text-xs">{String(val ?? '—')}</p>
                  </div>
                ))}
              </div>
              {appsConfig?.login.idValidation.error ? (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {appsConfig.login.idValidation.error}
                </p>
              ) : null}
              <button
                type="button"
                disabled={busy}
                className="mt-4 rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-semibold"
                onClick={async () => {
                  if (!token) return;
                  setBusy(true);
                  const r = await nestAdminMetaCenterLoginOAuthUrl(token);
                  setBusy(false);
                  if (r?.url) window.open(r.url, '_blank', 'noopener,noreferrer');
                  else setMsg('Login OAuth URL nelze vytvořit — zkontrolujte FACEBOOK_LOGIN_APP_ID.');
                }}
              >
                Test loginu (otevřít OAuth)
              </button>
            </div>

            <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-purple-900">B) Facebook Pages / Marketing</h2>
              <p className="mt-1 text-sm text-purple-800">
                Aplikace <strong>{appsConfig?.pages.appName ?? 'testovací stránka xxrealit'}</strong> — Meta Connect, Pages API, Pixel, katalog
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ['Pages App ID', appsConfig?.pages.appId ?? dash.settings.facebookPagesAppId],
                  ['Pages App Secret', appsConfig?.pages.appSecretConfigured ? appsConfig.pages.appSecretMasked : 'chybí'],
                  ['Meta Connect Redirect URI', appsConfig?.pages.metaConnectRedirectUri ?? dash.settings.metaConnectRedirectUri],
                  ['Page ID', dash.settings.pageId],
                  ['Ad Account ID', dash.settings.adAccountId],
                  ['Business Manager ID', dash.settings.businessManagerId],
                  ['Dataset ID', dash.settings.datasetId],
                  ['Pixel ID', dash.settings.pixelId],
                  ['Catalog ID', dash.settings.catalogId],
                  ['Commerce Manager ID', dash.settings.commerceManagerId],
                  ['Conversions API Token', dash.settings.conversionsApiTokenMasked ? 'nastaveno' : 'chybí'],
                  ['Webhook Verify Token', dash.settings.webhookVerifyTokenMasked ? 'nastaveno' : 'chybí'],
                  ['Webhook Secret', dash.settings.webhookSecretMasked ? 'nastaveno' : 'chybí'],
                ].map(([label, val]) => (
                  <div key={String(label)} className="rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm">
                    <p className="text-xs font-medium text-zinc-500">{label}</p>
                    <p className="mt-1 break-all font-mono text-xs">{String(val ?? '—')}</p>
                  </div>
                ))}
              </div>
              {appsConfig?.pages.idValidation.error ? (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {appsConfig.pages.idValidation.error}
                </p>
              ) : null}
              <p className="mt-3 text-xs text-purple-800">
                „Připojit Meta účet“ používá sdílený Facebook OAuth callback portálu (
                {appsConfig?.pages.metaConnectRedirectUri ?? '—'}) a Pages App ID (
                {appsConfig?.pages.appId ?? '—'}). Token se sdílí se Sociálními sítěmi — při
                opětovném kliknutí pouze obnovíte oprávnění.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold">Načtené po připojení Meta účtu</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {settingsFields
                  .filter(([key]) =>
                    ![
                      'facebookAppId',
                      'facebookPagesAppId',
                      'redirectUri',
                      'callbackUrl',
                    ].includes(key),
                  )
                  .map(([key, label]) => {
                    const raw = (dash.settings as Record<string, unknown>)[key];
                    const display =
                      key === 'metaConnectedAt' || key === 'lastAutoSyncAt'
                        ? raw
                          ? new Date(String(raw)).toLocaleString('cs-CZ')
                          : '—'
                        : String(raw ?? '—');
                    return (
                      <div key={key} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                        <p className="text-xs font-medium text-zinc-500">{label}</p>
                        <p className="mt-1 break-all font-mono text-xs">{display}</p>
                      </div>
                    );
                  })}
              </div>
            </div>
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

        {tab === 'api-logs' ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-bold">Meta Graph API logy</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-zinc-500">
                    <th className="py-2 pr-2">Čas</th>
                    <th className="py-2 pr-2">Endpoint</th>
                    <th className="py-2 pr-2">HTTP</th>
                    <th className="py-2 pr-2">Error</th>
                    <th className="py-2 pr-2">ms</th>
                  </tr>
                </thead>
                <tbody>
                  {apiLogs.map((row) => (
                    <tr key={row.id} className="border-b border-zinc-100">
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleString('cs-CZ')}
                      </td>
                      <td className="py-2 pr-2 font-mono text-xs">
                        {row.method} {row.endpoint}
                      </td>
                      <td className="py-2 pr-2">{row.httpStatus ?? '—'}</td>
                      <td className="py-2 pr-2 text-xs">{row.errorMessage ?? '—'}</td>
                      <td className="py-2 pr-2">{row.durationMs ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
