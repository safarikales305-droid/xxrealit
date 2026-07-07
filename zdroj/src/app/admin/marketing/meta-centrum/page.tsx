'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { MetaCampaignCreativeEditor } from '@/components/meta-centrum/MetaCampaignCreativeEditor';
import {
  MetaCampaignPlacementPreview,
  MetaCampaignPreviewModal,
} from '@/components/meta-centrum/MetaCampaignPlacementPreview';
import { getCreativePreviewImage } from '@/lib/meta-campaign-creative';
import {
  safeDisplayValue,
  safeErrorMessage,
  safeText,
  shouldShowErrorAsJson,
} from '@/lib/safe-text';
import {
  nestAdminMetaCenterApiLogs,
  nestAdminMetaCenterCheckPermissions,
  nestAdminMetaCenterTestOAuth,
  nestAdminMetaCenterApps,
  nestAdminMetaCenterLoginOAuthUrl,
  nestAdminMetaCenterConnectionStatus,
  nestAdminMetaCenterDashboard,
  nestAdminMetaCenterDiagnostics,
  nestAdminMetaCenterFix,
  nestAdminMetaCenterLogs,
  nestAdminMetaCenterOAuthDebug,
  nestAdminMetaCenterOAuthClearCache,
  nestAdminMetaCenterOAuthFlowUrl,
  nestAdminMetaCenterPatchCapi,
  nestAdminMetaCenterProvision,
  nestAdminMetaCenterPixelTest,
  nestAdminMetaCenterRegenerateFeeds,
  nestAdminMetaCenterSync,
  nestAdminMetaCenterTestAll,
  nestAdminMetaCenterTestService,
  nestAdminMetaCenterValidateFeed,
  nestAdminMetaCenterListDatasets,
  nestAdminMetaCenterSelectDataset,
  nestAdminMetaCenterCatalogPanel,
  nestAdminMetaCenterCatalogProducts,
  nestAdminMetaCenterConnectCatalog,
  nestAdminMetaCenterCreateCatalog,
  nestAdminMetaCenterSyncCatalog,
  nestAdminMetaCenterAdAccount,
  nestAdminMetaCenterListCatalogs,
  nestAdminMetaCenterListAdAccounts,
  nestAdminMetaCenterSelectAdAccount,
  nestAdminMetaCenterMarketingDiagnostics,
  nestAdminMetaCenterCampaignProducts,
  nestAdminMetaCenterGeoSearch,
  nestAdminMetaCenterListCampaignDrafts,
  nestAdminMetaCenterCreateCampaign,
  nestAdminMetaCenterUpdateCampaignDraft,
  nestAdminMetaCenterDeleteCampaignDraft,
  nestAdminMetaCenterCampaignsOverview,
  nestAdminMetaCenterLaunchCampaignDraft,
  nestAdminMetaCenterControlCampaign,
  nestAdminMetaCenterPatchSettings,
  type MetaCampaignOverviewItem,
  nestAdminMetaCenterRemarketingAudiences,
  nestAdminMetaCenterCreateRemarketingAudience,
  nestAdminMetaCenterSyncRemarketingAudience,
  type MetaAdAccountPanel,
  type MetaAdAccountListResponse,
  type MetaCampaignDraft,
  type MetaCampaignProductItem,
  type MetaGeoLocationItem,
  type MetaCatalogListResponse,
  type MetaCatalogPanel,
  type MetaCatalogProductPreview,
  type MetaDatasetListResponse,
  type MetaCenterApiLogRow,
  type MetaCenterDashboard,
  type MetaCenterEventLogRow,
  type MetaCenterSettings,
  type MetaConnectionCheck,
  type MetaConnectionStatusLevel,
  type MetaDiagnosticLevel,
  type MetaLiveDiagnostics,
  type MetaOAuthDebugLogRow,
  type MetaOAuthFlowKey,
  type MetaOAuthFlowDiagnostic,
  type MetaOAuthPreview,
  type MetaPermissionsCheckResult,
  type MetaRemarketingAudience,
  type MetaRemarketingAudienceTypeOption,
  type FacebookAppsConfig,
  metaCenterEndpointWarning,
} from '@/lib/nest-client';

const META_EXTERNAL_LINKS = {
  developersApps: 'https://developers.facebook.com/apps/',
  commerceManager: 'https://business.facebook.com/commerce/',
  catalogs: 'https://business.facebook.com/settings/catalogs',
} as const;

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'settings', label: 'Nastavení' },
  { id: 'pixel', label: 'Pixel' },
  { id: 'capi', label: 'Conversions API' },
  { id: 'commerce', label: 'Commerce' },
  { id: 'catalog', label: 'Katalog' },
  { id: 'feeds', label: 'Feedy' },
  { id: 'logs', label: 'Logy událostí' },
  { id: 'api-logs', label: 'Meta API logy' },
  { id: 'remarketing', label: 'Remarketing' },
  { id: 'campaigns', label: 'Kampaně' },
  { id: 'mapping', label: 'Mapování' },
] as const;

const CAMPAIGN_GOAL_LABELS: Record<string, string> = {
  traffic: 'Návštěvnost',
  messages: 'Zprávy',
  lead: 'Lead',
  catalog: 'Katalogový prodej',
};

const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  draft: 'Koncept',
  ready: 'Připraveno',
  active: 'Aktivní',
  paused: 'Pozastaveno',
  in_review: 'Ke schválení',
  learning: 'Učení',
  completed: 'Dokončeno',
  archived: 'Archivováno',
  error: 'Chyba',
};

const META_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Aktivní',
  PAUSED: 'Pozastaveno',
  IN_REVIEW: 'Ke schválení',
  PENDING_REVIEW: 'Ke schválení',
  LEARNING: 'Učení',
  LEARNING_LIMITED: 'Učení',
  COMPLETED: 'Dokončeno',
  REJECTED: 'Zamítnuto',
  WITH_ISSUES: 'Problém',
  ARCHIVED: 'Archivováno',
  DELETED: 'Smazáno',
};

const CREATIVE_TYPE_LABELS: Record<string, string> = {
  catalog_products: 'Katalogové produkty',
  listing: 'Inzerát',
  social_post: 'Příspěvek (Facebook)',
  custom_creative: 'Vlastní reklama',
};

const TARGETING_MODE_LABELS: Record<string, string> = {
  map: 'Mapa (lokalita)',
  remarketing: 'Remarketing publikum',
  map_remarketing: 'Mapa + remarketing',
};

const RETENTION_DAY_OPTIONS = [7, 14, 30, 60, 90, 180] as const;

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

function containsLocalhost(value: string | null | undefined): boolean {
  if (!value) return false;
  return (
    /https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(value) ||
    /localhost:\d+/i.test(value)
  );
}

function oauthFlowStatusLabel(status: MetaOAuthFlowDiagnostic['status']): string {
  switch (status) {
    case 'connected':
      return 'Připojeno';
    case 'missing_scopes':
      return 'Chybí scopes';
    case 'env_missing':
      return 'Chybí ENV';
    case 'reconnect':
      return 'Vyžaduje reconnect';
    case 'ready':
      return 'Připraveno';
    default:
      return '—';
  }
}

function oauthFlowStatusClass(status: MetaOAuthFlowDiagnostic['status']): string {
  switch (status) {
    case 'connected':
      return 'border-emerald-300 bg-emerald-50 text-emerald-900';
    case 'missing_scopes':
    case 'env_missing':
      return 'border-red-300 bg-red-50 text-red-900';
    case 'reconnect':
      return 'border-amber-300 bg-amber-50 text-amber-900';
    default:
      return 'border-blue-200 bg-white text-zinc-800';
  }
}

function monoUrlClass(value: string | null | undefined): string {
  return containsLocalhost(value)
    ? 'mt-1 break-all font-mono text-xs font-bold text-red-700'
    : 'mt-1 break-all font-mono text-xs';
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function serviceStatusBadge(status: 'online' | 'offline' | 'optional' | 'warning', statusLabel: string) {
  if (status === 'online') {
    return { text: statusLabel || 'Online', className: 'bg-emerald-100 text-emerald-800' };
  }
  if (status === 'warning') {
    return { text: statusLabel || 'Upozornění', className: 'bg-amber-100 text-amber-900' };
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
  if (status === 'permission_warning') return 'border-amber-200 bg-amber-50 text-amber-900';
  if (status === 'api_error') return 'border-amber-200 bg-amber-50 text-amber-900';
  return 'border-red-200 bg-red-50 text-red-900';
}

function connectionCheckIcon(item: MetaConnectionCheck) {
  const status = connectionCheckStatus(item);
  if (status === 'online') return '✓';
  if (status === 'optional') return '○';
  if (status === 'permission_warning') return '⚠';
  if (status === 'api_error') return '⚠';
  return '✗';
}

function fixActionLabel(action: string): string {
  if (action === 'select_dataset') return 'Vybrat Dataset';
  return 'Opravit';
}

function connectionCheckLabel(item: MetaConnectionCheck) {
  const status = connectionCheckStatus(item);
  if (status === 'online') return 'Online / Připojeno';
  if (status === 'optional') return 'Nenastaveno (volitelné)';
  if (status === 'permission_warning') {
    return safeDisplayValue(item.error, 'Vyžaduje oprávnění Meta App');
  }
  if (status === 'api_error') return safeDisplayValue(item.error, 'Chyba API');
  return safeDisplayValue(item.error, 'Chybí konfigurace');
}

function MetaApiErrorBlock({
  error,
  className = 'text-xs text-amber-800',
}: {
  error: unknown;
  className?: string;
}) {
  if (error === null || error === undefined || error === '') return null;
  const message = safeErrorMessage(error);
  if (message) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? safeText((error as Record<string, unknown>).code)
        : '';
    return (
      <p className={className}>
        {message}
        {code ? ` (${code})` : ''}
      </p>
    );
  }
  if (shouldShowErrorAsJson(error)) {
    return (
      <pre
        className={`${className} max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-amber-200 bg-amber-50/80 p-2 font-mono`}
      >
        {JSON.stringify(error, null, 2)}
      </pre>
    );
  }
  return <p className={className}>{safeText(error)}</p>;
}

function SettingsValue({ value }: { value: unknown }) {
  return <p className="mt-1 break-all font-mono text-xs">{safeDisplayValue(value)}</p>;
}

function liveStatusIcon(ok: boolean) {
  return ok ? '✔' : '○';
}

function LiveDiagnosticsPanel({ live }: { live: MetaLiveDiagnostics }) {
  const syncLabel = live.lastSyncAt
    ? new Date(live.lastSyncAt).toLocaleString('cs-CZ')
    : '—';

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Živá diagnostika Meta</h2>
        <p className="text-xs text-zinc-500">
          Aktualizováno: {new Date(live.checkedAt).toLocaleString('cs-CZ')}
        </p>
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
          <p className="font-semibold text-emerald-900">Dataset</p>
          <p>{live.dataset.connected ? '✔ Připojen' : live.dataset.message}</p>
          {live.dataset.id ? (
            <p className="font-mono text-[10px] text-emerald-800">{live.dataset.id}</p>
          ) : null}
        </div>
        {[
          ['Remarketing připraven', live.remarketingReady],
          ['Conversions API', live.capiReady],
          ['Catalog', live.catalogReady],
          ['Commerce', live.commerceReady],
          ['Feed', live.feedReady],
        ].map(([label, ok]) => (
          <div
            key={String(label)}
            className={`rounded-xl border px-3 py-2 text-sm ${
              ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-zinc-200 bg-zinc-50'
            }`}
          >
            <p className="font-semibold">{label}</p>
            <p>{liveStatusIcon(Boolean(ok))}</p>
          </div>
        ))}
      </div>

      <p className="mb-3 text-sm text-zinc-600">
        Poslední synchronizace: <strong>{syncLabel}</strong>
      </p>

      <h3 className="mb-2 text-sm font-bold text-zinc-800">Pixel / Dataset Events</h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {live.events.map((ev) => (
          <div
            key={ev.eventType}
            className={`rounded-xl border px-3 py-2 text-sm ${
              ev.status === 'ok'
                ? 'border-emerald-200 bg-emerald-50'
                : ev.status === 'warning'
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-zinc-200 bg-zinc-50'
            }`}
          >
            <p className="font-semibold">{ev.label}</p>
            <p className="text-lg font-bold tabular-nums">{ev.countToday.toLocaleString('cs-CZ')}</p>
            {ev.lastAgoLabel ? (
              <p className="text-xs text-zinc-600">Poslední {ev.lastAgoLabel}</p>
            ) : (
              <p className="text-xs text-zinc-400">Dnes bez událostí</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
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
  const [endpointWarnings, setEndpointWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [appsConfig, setAppsConfig] = useState<FacebookAppsConfig | null>(null);
  const [testReport, setTestReport] = useState<unknown>(null);
  const [permissionsCheck, setPermissionsCheck] = useState<MetaPermissionsCheckResult | null>(null);
  const [oauthTestPreview, setOauthTestPreview] = useState<MetaOAuthPreview | null>(null);
  const [oauthTestFlow, setOauthTestFlow] = useState<MetaOAuthFlowKey>('pages');
  const [oauthDebugOpen, setOauthDebugOpen] = useState(false);
  const [oauthDebugLogs, setOauthDebugLogs] = useState<MetaOAuthDebugLogRow[]>([]);
  const [oauthDebugMeta, setOauthDebugMeta] = useState<{
    localhostDetected?: boolean;
    localhostWarning?: string | null;
    canonicalRedirectUri?: string;
  } | null>(null);
  const [datasets, setDatasets] = useState<MetaDatasetListResponse | null>(null);
  const [catalogPanel, setCatalogPanel] = useState<MetaCatalogPanel | null>(null);
  const [catalogProducts, setCatalogProducts] = useState<MetaCatalogProductPreview[]>([]);
  const [campaignProducts, setCampaignProducts] = useState<MetaCampaignProductItem[]>([]);
  const [campaignDrafts, setCampaignDrafts] = useState<MetaCampaignDraft[]>([]);
  const [campaignOverview, setCampaignOverview] = useState<MetaCampaignOverviewItem[]>([]);
  const [campaignsLiveEnabled, setCampaignsLiveEnabled] = useState(false);
  const [remarketingAudiences, setRemarketingAudiences] = useState<MetaRemarketingAudience[]>([]);
  const [remarketingAudienceTypes, setRemarketingAudienceTypes] = useState<
    MetaRemarketingAudienceTypeOption[]
  >([]);
  const [remarketingForm, setRemarketingForm] = useState({
    name: '',
    audienceType: 'visited_web',
    retentionDays: 30,
    city: '',
    district: '',
    region: '',
    propertyType: '',
    priceFrom: '',
    priceTo: '',
    offerType: '',
    listingId: '',
  });
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [adAccount, setAdAccount] = useState<MetaAdAccountPanel | null>(null);
  const [catalogList, setCatalogList] = useState<MetaCatalogListResponse | null>(null);
  const [adAccountList, setAdAccountList] = useState<MetaAdAccountListResponse | null>(null);
  const [connectCatalogId, setConnectCatalogId] = useState('');
  const [manualAdAccountId, setManualAdAccountId] = useState('');
  const [campaignDraft, setCampaignDraft] = useState({
    name: '',
    goal: 'traffic',
    propertyType: 'byt',
    radiusKm: 15,
    budgetDaily: 200,
    startDate: '',
    endDate: '',
    locationLabel: '',
    cityName: '',
    metaGeoKey: '',
    metaGeoCountry: '',
    metaGeoRegion: '',
    latitude: '',
    longitude: '',
    selectedProductIds: [] as string[],
    creativeType: 'catalog_products',
    targetingMode: 'map',
    audienceId: '',
    creativePayload: {} as Record<string, unknown>,
  });
  const [geoSuggestions, setGeoSuggestions] = useState<MetaGeoLocationItem[]>([]);
  const [geoSearchBusy, setGeoSearchBusy] = useState(false);
  const [showGeoSuggestions, setShowGeoSuggestions] = useState(false);
  const [previewCampaign, setPreviewCampaign] = useState<MetaCampaignDraft | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [d, l, c, api, apps, ds, cp, products, ad, cats, adList, campProducts, campDrafts, remarketing, campOverview] =
      await Promise.all([
      nestAdminMetaCenterDashboard(token),
      nestAdminMetaCenterLogs(token, {
        eventType: logFilter || undefined,
        take: 80,
      }),
      nestAdminMetaCenterConnectionStatus(token),
      nestAdminMetaCenterApiLogs(token, 80),
      nestAdminMetaCenterApps(token),
      nestAdminMetaCenterListDatasets(token),
      nestAdminMetaCenterCatalogPanel(token),
      nestAdminMetaCenterCatalogProducts(token, 50),
      nestAdminMetaCenterAdAccount(token),
      nestAdminMetaCenterListCatalogs(token),
      nestAdminMetaCenterListAdAccounts(token),
      nestAdminMetaCenterCampaignProducts(token),
      nestAdminMetaCenterListCampaignDrafts(token),
      nestAdminMetaCenterRemarketingAudiences(token),
      nestAdminMetaCenterCampaignsOverview(token),
    ]);
    if (d) setDash(d);
    setLogs(l?.items ?? []);
    if (c) setConnection({ checklist: c.checklist, diagnostics: c.diagnostics });
    setApiLogs(api?.items ?? []);
    setAppsConfig(apps ?? c?.apps ?? d?.settings.facebookApps ?? null);
    setDatasets(ds);
    setCatalogPanel(cp);
    setCatalogProducts(products?.items ?? []);
    setAdAccount(ad);
    setCatalogList(cats);
    setAdAccountList(adList);
    setCampaignProducts(campProducts?.items ?? []);
    setCampaignDrafts(campDrafts?.items ?? []);
    setCampaignOverview(campOverview?.items ?? campDrafts?.items ?? []);
    setCampaignsLiveEnabled(
      campOverview?.liveEnabled ?? d?.settings?.campaignsLiveEnabled ?? false,
    );
    setRemarketingAudiences(remarketing?.items ?? []);
    setRemarketingAudienceTypes(remarketing?.audienceTypes ?? []);

    const warnings = [
      metaCenterEndpointWarning('Dashboard', d),
      metaCenterEndpointWarning('Stav připojení', c),
      metaCenterEndpointWarning('Datasety', ds),
      metaCenterEndpointWarning('Reklamní účet', ad),
      metaCenterEndpointWarning('Seznam reklamních účtů', adList),
      metaCenterEndpointWarning('Katalog (panel)', cp),
      metaCenterEndpointWarning('Katalog (seznam)', cats),
    ].filter((w): w is string => Boolean(w));
    setEndpointWarnings(warnings);
  }, [token, logFilter]);

  useEffect(() => {
    const meta = params.get('meta');
    if (meta === 'connected') {
      const flow = params.get('flow');
      setMsg(
        flow
          ? `Meta OAuth (${flow}) dokončeno — oprávnění byla připojena.`
          : 'Meta účet byl úspěšně připojen a konfigurace načtena.',
      );
    }
    if (meta === 'error') {
      const reason = params.get('reason') ?? 'neznámá';
      const redirectUri = params.get('redirect_uri');
      setMsg(
        redirectUri
          ? `Chyba připojení: ${reason}\n\nPřidejte do Meta Developers (Pages App) tuto Valid OAuth Redirect URI:\n${redirectUri}`
          : `Chyba připojení: ${reason}`,
      );
    }

    const tabParam = params.get('tab');
    if (
      tabParam &&
      TABS.some((t) => t.id === tabParam)
    ) {
      setTab(tabParam as TabId);
    }

    if (params.get('promote') === 'social_post') {
      const name = params.get('name') ?? '';
      const text = params.get('text') ?? '';
      const image = params.get('image') ?? '';
      const video = params.get('video') ?? '';
      const author = params.get('author') ?? '';
      const cta = params.get('cta') ?? 'LEARN_MORE';
      const budget = params.get('budget');
      const cityName = params.get('cityName') ?? '';
      const startDate = params.get('startDate') ?? '';
      setCampaignDraft((d) => ({
        ...d,
        name: name || d.name,
        creativeType: 'facebook_post',
        goal: 'traffic',
        cityName: cityName || d.cityName,
        locationLabel: cityName || d.locationLabel,
        budgetDaily: budget ? Number(budget) || d.budgetDaily : d.budgetDaily,
        startDate: startDate || d.startDate,
        creativePayload: {
          sourceType: 'facebook_post',
          primaryText: text,
          text,
          headline: name || text.slice(0, 80),
          image: image || undefined,
          video: video || undefined,
          author: author || undefined,
          cta: cta || 'Zjistit více',
          ctaType: 'LEARN_MORE',
          postId: params.get('postId') ?? undefined,
          link: params.get('link') ?? undefined,
        },
      }));
      setTab('campaigns');
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
  const oauthRedirect = dash?.oauthRedirect;
  const oauthPreview = dash?.oauthPreview ?? null;
  const activeOAuthPreview = oauthTestPreview ?? oauthPreview;
  const lastOAuthCallback = dash?.lastOAuthCallback ?? null;
  const oauthCompleted = dash?.oauthCompleted ?? null;
  const oauthFlows = dash?.oauthFlows ?? [];
  const catalogOAuthConnected =
    oauthFlows.find((f) => f.key === 'catalog')?.status === 'connected';
  const marketingOAuthConnected =
    oauthFlows.find((f) => f.key === 'marketing')?.status === 'connected';
  const hasCatalog = Boolean(catalogPanel?.catalogId ?? dash?.settings.catalogId);
  const hasDataset = Boolean(
    dash?.pixel.datasetId ?? dash?.capi.datasetId ?? datasets?.activeDatasetId,
  );
  const hasAdsApi = Boolean(dash?.settings.isMarketingAdsConnected);
  const hasAdAccount = Boolean(adAccount?.adAccountId ?? dash?.settings.adAccountId);

  const campaignLaunchBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (!hasAdsApi) blockers.push('Ads API není připojeno.');
    if (!hasAdAccount) blockers.push('Reklamní účet není připojen.');
    if (!hasCatalog) blockers.push('Catalog ID chybí.');
    if (!hasDataset) blockers.push('Dataset ID chybí.');
    if (!campaignDraft.name.trim()) blockers.push('Název kampaně je prázdný.');
    if (!campaignDraft.cityName.trim() && !campaignDraft.locationLabel.trim()) {
      blockers.push('Lokalita (město) není zadaná.');
    }
    if (!campaignDraft.budgetDaily || campaignDraft.budgetDaily <= 0) {
      blockers.push('Denní rozpočet musí být větší než 0.');
    }
    if (!campaignDraft.selectedProductIds.length && campaignDraft.creativeType === 'catalog_products') {
      blockers.push('Vyberte alespoň jeden katalogový inzerát.');
    }
    if (campaignDraft.creativeType === 'listing' && !campaignDraft.selectedProductIds.length) {
      blockers.push('Vyberte inzerát XXREALIT.');
    }
    const cp = campaignDraft.creativePayload ?? {};
    const hasMedia = Boolean(cp.image || cp.video || cp.objectStoryId);
    if (
      ['public_post', 'facebook_post', 'instagram_post', 'custom_image', 'custom_video'].includes(
        campaignDraft.creativeType,
      ) &&
      !hasMedia
    ) {
      blockers.push('Vyberte zdroj kreativy nebo nahrajte obrázek/video.');
    }
    if (!campaignDraft.startDate) blockers.push('Datum spuštění není zadané.');
    if (!campaignDraft.endDate) blockers.push('Datum ukončení není zadané.');
    if (
      campaignDraft.startDate &&
      campaignDraft.endDate &&
      campaignDraft.endDate < campaignDraft.startDate
    ) {
      blockers.push('Datum ukončení musí být po datu spuštění.');
    }
    if (
      (campaignDraft.targetingMode === 'remarketing' ||
        campaignDraft.targetingMode === 'map_remarketing') &&
      !campaignDraft.audienceId
    ) {
      blockers.push('Vyberte remarketing publikum nebo zvolte cílení mapa.');
    }
    if (
      (campaignDraft.targetingMode === 'map' || campaignDraft.targetingMode === 'map_remarketing') &&
      !campaignDraft.metaGeoKey.trim() &&
      (!campaignDraft.latitude.trim() || !campaignDraft.longitude.trim())
    ) {
      blockers.push('Vyberte město z návrhů Meta (Geo ID) nebo zadejte souřadnice.');
    }
    return blockers;
  }, [campaignDraft, hasAdsApi, hasAdAccount, hasCatalog, hasDataset]);

  const canLaunchCampaign = campaignLaunchBlockers.length === 0;

  useEffect(() => {
    if (!token) return;
    const q = campaignDraft.cityName.trim();
    if (q.length < 2) {
      setGeoSuggestions([]);
      setShowGeoSuggestions(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        setGeoSearchBusy(true);
        const r = await nestAdminMetaCenterGeoSearch(token, q);
        setGeoSearchBusy(false);
        if (r.ok) {
          setGeoSuggestions(r.items);
          setShowGeoSuggestions(r.items.length > 0);
        }
      })();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [token, campaignDraft.cityName]);

  function selectGeoLocation(item: MetaGeoLocationItem) {
    setCampaignDraft((d) => ({
      ...d,
      cityName: item.city,
      locationLabel: item.city,
      metaGeoKey: item.metaKey,
      metaGeoCountry: item.country ?? '',
      metaGeoRegion: item.region ?? '',
      latitude: item.lat != null ? String(item.lat) : d.latitude,
      longitude: item.lng != null ? String(item.lng) : d.longitude,
    }));
    setGeoSuggestions([]);
    setShowGeoSuggestions(false);
  }

  const selectedCampaignProducts = useMemo(
    () =>
      campaignProducts.filter((p) => campaignDraft.selectedProductIds.includes(p.id)),
    [campaignProducts, campaignDraft.selectedProductIds],
  );

  function buildCampaignPayload() {
    const lat = campaignDraft.latitude.trim()
      ? Number.parseFloat(campaignDraft.latitude)
      : undefined;
    const lng = campaignDraft.longitude.trim()
      ? Number.parseFloat(campaignDraft.longitude)
      : undefined;
    return {
      name: campaignDraft.name.trim(),
      objective: campaignDraft.goal,
      propertyType: campaignDraft.propertyType,
      cityName: campaignDraft.cityName.trim() || campaignDraft.locationLabel.trim(),
      metaGeoKey: campaignDraft.metaGeoKey.trim() || undefined,
      metaGeoCountry: campaignDraft.metaGeoCountry.trim() || undefined,
      metaGeoRegion: campaignDraft.metaGeoRegion.trim() || undefined,
      latitude: Number.isFinite(lat) ? lat : undefined,
      longitude: Number.isFinite(lng) ? lng : undefined,
      radiusKm: campaignDraft.radiusKm,
      dailyBudgetCzk: campaignDraft.budgetDaily,
      startDate: campaignDraft.startDate,
      endDate: campaignDraft.endDate,
      selectedProductIds: campaignDraft.selectedProductIds,
      creativeType: campaignDraft.creativeType,
      targetingMode: campaignDraft.targetingMode,
      audienceId: campaignDraft.audienceId || undefined,
      creativePayload: campaignDraft.creativePayload,
    };
  }

  function loadCampaignForEdit(c: MetaCampaignDraft) {
    setEditingCampaignId(c.id);
    setCampaignDraft({
      name: c.name,
      goal: c.objective,
      propertyType: c.propertyType ?? 'byt',
      radiusKm: c.radiusKm ?? 15,
      budgetDaily: c.dailyBudgetCzk ?? 200,
      startDate: c.startDate ?? '',
      endDate: c.endDate ?? '',
      locationLabel: c.cityName ?? '',
      cityName: c.cityName ?? '',
      metaGeoKey: c.metaGeoKey ?? '',
      metaGeoCountry: c.metaGeoCountry ?? '',
      metaGeoRegion: c.metaGeoRegion ?? '',
      latitude: c.latitude != null ? String(c.latitude) : '',
      longitude: c.longitude != null ? String(c.longitude) : '',
      selectedProductIds: c.selectedProductIds ?? [],
      creativeType: c.creativeType ?? 'catalog_products',
      targetingMode: c.targetingMode ?? 'map',
      audienceId: c.audienceId ?? '',
      creativePayload: (c.creativePayload as Record<string, unknown>) ?? {},
    });
    setTab('campaigns');
  }

  function resetCampaignForm() {
    setEditingCampaignId(null);
    setCampaignDraft({
      name: '',
      goal: 'traffic',
      propertyType: 'byt',
      radiusKm: 15,
      budgetDaily: 200,
      startDate: '',
      endDate: '',
      locationLabel: '',
      cityName: '',
      metaGeoKey: '',
      metaGeoCountry: '',
      metaGeoRegion: '',
      latitude: '',
      longitude: '',
      selectedProductIds: [],
      creativeType: 'catalog_products',
      targetingMode: 'map',
      audienceId: '',
      creativePayload: {},
    });
  }

  async function submitCampaign(mode: 'draft' | 'launch') {
    if (!token) return;
    setBusy(true);
    const payload = buildCampaignPayload();
    const r =
      editingCampaignId && mode === 'draft'
        ? await nestAdminMetaCenterUpdateCampaignDraft(token, editingCampaignId, payload)
        : await nestAdminMetaCenterCreateCampaign(token, payload, mode);
    setBusy(false);
    if (r.ok) {
      setMsg(
        r.message ??
          (editingCampaignId && mode === 'draft'
            ? 'Koncept aktualizován.'
            : mode === 'draft'
              ? 'Koncept uložen.'
              : 'Kampaň odeslána.'),
      );
      if (mode === 'draft' && editingCampaignId) {
        resetCampaignForm();
      }
      void refresh();
    } else {
      const blockerText = r.blockers?.map((b) => b.message).join(' ') ?? '';
      setMsg(r.message ?? blockerText ?? 'Uložení kampaně selhalo.');
    }
  }


  const settingsFields = useMemo(
    () =>
      [
        ['facebookAppId', 'Facebook App ID'],
        ['facebookPagesAppId', 'Facebook Pages App ID'],
        ['facebookMarketingAppId', 'Meta Marketing App ID'],
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
    await connectMetaFlow('pages');
  }

  async function connectMetaFlow(flow: MetaOAuthFlowKey) {
    if (!token) return;
    const normalized = flow === 'ads' ? 'marketing' : flow;
    setBusy(true);
    const r = await nestAdminMetaCenterOAuthFlowUrl(token, normalized);
    setBusy(false);
    if (!r || ('success' in r && r.success === false)) {
      const failure = r && 'message' in r ? r : null;
      setMsg(
        failure?.message ??
          failure?.scopeWarnings?.join('\n') ??
          `Nepodařilo se získat OAuth URL pro flow „${normalized}".`,
      );
      return;
    }
    if (!('url' in r) || !r.url) {
      setMsg(`Nepodařilo se získat OAuth URL pro flow „${normalized}".`);
      return;
    }
    if (r.scopeWarnings?.length) {
      setMsg(r.scopeWarnings.join('\n'));
      if (!r.scope?.trim()) return;
    }
    if (appsConfig?.login.appId && r.client_id === appsConfig.login.appId && normalized !== 'login') {
      setMsg('Chyba: OAuth používá Login App ID místo Pages App ID.');
      return;
    }
    window.location.href = r.url;
  }

  async function applyFix(action: string) {
    if (action === 'select_dataset') {
      setTab('pixel');
      setMsg('Vyberte Dataset ze seznamu níže a klikněte na „Použít Dataset“.');
      return;
    }
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

  async function checkPermissions() {
    if (!token) return;
    setBusy(true);
    const result = await nestAdminMetaCenterCheckPermissions(token);
    setPermissionsCheck(result);
    setBusy(false);
    setMsg(result?.error ? `Kontrola oprávnění: ${safeText(result.error)}` : 'Oprávnění zkontrolována.');
    void refresh();
  }

  const scopeRows = permissionsCheck?.scopes ?? catalogGraph?.requiredScopes ?? [];

  async function testOAuth(flow: MetaOAuthFlowKey = oauthTestFlow) {
    if (!token) return;
    setBusy(true);
    const preview = await nestAdminMetaCenterTestOAuth(token, flow);
    setOauthTestPreview(preview);
    setOauthTestFlow(flow);
    setBusy(false);
    setMsg(
      preview
        ? `OAuth náhled: ${preview.oauthFlowLabel ?? flow} — ${preview.scopesList?.join(', ') ?? preview.scope}`
        : 'OAuth test selhal.',
    );
  }

  async function copyRedirectUri() {
    const uri =
      oauthRedirect?.recommendedRedirectUri ??
      activeOAuthPreview?.redirect_uri ??
      oauthRedirect?.oauthRedirectUsedByApp;
    if (!uri) return;
    try {
      await navigator.clipboard.writeText(uri);
      setMsg('Redirect URI zkopírována do schránky.');
    } catch {
      setMsg(uri);
    }
  }

  async function loadOAuthDebug() {
    if (!token) return;
    setBusy(true);
    const data = await nestAdminMetaCenterOAuthDebug(token, 100);
    setOauthDebugLogs(data?.items ?? []);
    setOauthDebugMeta(
      data
        ? {
            localhostDetected: data.localhostDetected,
            localhostWarning: data.localhostWarning,
            canonicalRedirectUri: data.canonicalRedirectUri,
          }
        : null,
    );
    setOauthDebugOpen(true);
    setBusy(false);
  }

  async function clearOAuthCache() {
    if (!token) return;
    setBusy(true);
    const result = await nestAdminMetaCenterOAuthClearCache(token);
    setBusy(false);
    if (result?.ok) {
      setMsg(
        `OAuth cache vyčištěna. Redirect URI: ${result.redirectUri}\nVymazáno: ${result.cleared.join(', ')}`,
      );
      void refresh();
      if (oauthDebugOpen) void loadOAuthDebug();
    } else {
      setMsg('Vyčištění OAuth cache selhalo.');
    }
  }

  const oauthApiErrorLogs = apiLogs.filter(
    (log) =>
      log.endpoint.startsWith('OAuth ') ||
      log.endpoint === 'oauth/dialog' ||
      log.errorCode?.includes('redirect'),
  );

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
              {dash?.settings.isMetaConnected
                ? 'Obnovit Facebook stránku'
                : 'Připojit Facebook stránku'}
            </button>
            {(
              [
                ['catalog', 'Katalog'],
                ['marketing', 'Marketing'],
                ['instagram', 'Instagram'],
              ] as const
            ).map(([flow, label]) => {
              const flowInfo = oauthFlows.find((f) => f.key === flow);
              return (
                <button
                  key={flow}
                  type="button"
                  disabled={busy || flowInfo?.canConnect === false}
                  title={flowInfo?.warnings?.join(' ') ?? undefined}
                  onClick={() => void connectMetaFlow(flow)}
                  className="rounded-lg border border-[#1877f2] px-3 py-2 text-xs font-semibold text-[#1877f2] hover:bg-blue-50 disabled:opacity-40"
                >
                  {label}
                </button>
              );
            })}
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

        {endpointWarnings.length > 0 ? (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm">
            <h2 className="mb-2 font-bold">Upozornění načítání Meta Centra</h2>
            <ul className="list-disc space-y-1 pl-5">
              {endpointWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs opacity-80">
              Stránka funguje v bezpečném režimu — chybějící konfigurace neblokuje zobrazení.
            </p>
          </section>
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

            {dash?.catalogListWarning ? (
              <section className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm">
                <p>{dash.catalogListWarning}</p>
              </section>
            ) : null}

            {dash?.liveDiagnostics ? (
              <LiveDiagnosticsPanel live={dash.liveDiagnostics} />
            ) : null}

            {oauthRedirect || activeOAuthPreview ? (
              <section className="space-y-4">
                {oauthRedirect?.localhostDetected && oauthRedirect.productionMode ? (
                  <div className="rounded-2xl border border-red-400 bg-red-50 p-4 text-sm text-red-950 shadow-sm">
                    <p className="font-bold">LOCALHOST v produkčním OAuth — zakázáno</p>
                    <p className="mt-2">
                      Callback URL se musí skládat z META_REDIRECT_URI nebo BACKEND_URL. Nikdy z
                      interního hostu (localhost:8080).
                    </p>
                    {oauthRedirect.localhostHits?.length ? (
                      <ul className="mt-2 list-inside list-disc font-mono text-xs">
                        {oauthRedirect.localhostHits.map((hit) => (
                          <li key={hit} className="break-all text-red-800">
                            {hit}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                {oauthRedirect?.railwayWarning ? (
                  <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm">
                    <p className="font-bold">{oauthRedirect.railwayWarning}</p>
                    {oauthRedirect.recommendedRedirectUri ? (
                      <p className="mt-2 break-all font-mono text-xs">
                        Doporučeno: {oauthRedirect.recommendedRedirectUri}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {!oauthRedirect?.redirectUriInAllowedConfig &&
                !oauthRedirect?.isRailwayRedirectUri &&
                (oauthRedirect?.oauthRedirectUsedByApp || activeOAuthPreview?.redirect_uri) ? (
                  <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 shadow-sm">
                    <p className="font-bold">Tato Redirect URI není povolena v Meta Developers.</p>
                    <p className="mt-2 break-all font-mono text-xs">
                      {activeOAuthPreview?.redirect_uri ?? oauthRedirect?.oauthRedirectUsedByApp}
                    </p>
                    {oauthRedirect?.metaDevelopersInstruction ? (
                      <pre className="mt-3 whitespace-pre-wrap text-xs">
                        {oauthRedirect.metaDevelopersInstruction}
                      </pre>
                    ) : null}
                  </div>
                ) : null}

                <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-bold">META OAuth kontrola</h2>
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={oauthTestFlow}
                        onChange={(e) => setOauthTestFlow(e.target.value as MetaOAuthFlowKey)}
                        className="rounded-lg border border-zinc-300 px-2 py-1.5 text-xs"
                      >
                        {oauthFlows.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void testOAuth(oauthTestFlow)}
                        className="rounded-lg border border-[#1877f2] px-3 py-1.5 text-xs font-semibold text-[#1877f2] hover:bg-blue-50"
                      >
                        Otestovat OAuth
                      </button>
                      <button
                        type="button"
                        disabled={!activeOAuthPreview?.redirect_uri && !oauthRedirect?.oauthRedirectUsedByApp}
                        onClick={() => void copyRedirectUri()}
                        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50"
                      >
                        Kopírovat Redirect URI
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void loadOAuthDebug()}
                        className="rounded-lg border border-violet-400 px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-50"
                      >
                        Zobrazit OAuth Debug
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void clearOAuthCache()}
                        className="rounded-lg border border-red-400 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-50"
                      >
                        Vyčistit OAuth cache
                      </button>
                      {(activeOAuthPreview?.facebookLoginSettingsUrl ??
                        oauthRedirect?.facebookLoginSettingsUrl) ? (
                        <a
                          href={
                            activeOAuthPreview?.facebookLoginSettingsUrl ??
                            oauthRedirect?.facebookLoginSettingsUrl ??
                            '#'
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50"
                        >
                          Otevřít Facebook Login Settings
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div
                    className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
                      oauthCompleted?.completed
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'border-amber-200 bg-amber-50 text-amber-900'
                    }`}
                  >
                    <p className="font-bold">
                      OAuth completed: {oauthCompleted?.completed ? 'YES' : 'NO'}
                    </p>
                    {oauthCompleted?.reason ? (
                      <p className="mt-1 text-xs">{oauthCompleted.reason}</p>
                    ) : null}
                    {oauthCompleted?.at ? (
                      <p className="mt-1 text-xs opacity-80">
                        {new Date(oauthCompleted.at).toLocaleString('cs-CZ')}
                      </p>
                    ) : null}
                  </div>

                  {oauthFlows.length > 0 ? (
                    <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
                      <h3 className="mb-2 font-bold text-blue-950">OAuth toky a scopes</h3>
                      <p className="mb-3 text-xs text-blue-900">
                        Každý produkt má vlastní OAuth request — nikdy neposílejte všechna oprávnění
                        najednou (Invalid Scopes).
                      </p>
                      <div className="space-y-3">
                        {oauthFlows.map((flow) => (
                          <div
                            key={flow.key}
                            className={`rounded-lg border bg-white p-3 text-sm ${
                              activeOAuthPreview?.oauthFlow === flow.key
                                ? 'border-[#1877f2] ring-1 ring-[#1877f2]'
                                : 'border-blue-200'
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-bold text-zinc-900">{flow.label}</p>
                                  <span
                                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${oauthFlowStatusClass(flow.status)}`}
                                  >
                                    {oauthFlowStatusLabel(flow.status)}
                                  </span>
                                </div>
                                <p className="mt-1 break-all font-mono text-[11px] text-zinc-500">
                                  {flow.oauthEndpoint ?? `/api/social/facebook/oauth/${flow.key}`}
                                </p>
                                <p className="mt-1 text-xs text-zinc-600">{flow.description}</p>
                                <p className="mt-2 break-all font-mono text-[11px] text-zinc-700">
                                  Finální scopes: {flow.scopeString || '—'}
                                </p>
                                {flow.envVarKey ? (
                                  <p className="mt-1 font-mono text-[10px] text-zinc-500">
                                    ENV: {flow.envVarKey}
                                    {flow.usesMarketingApp
                                      ? ' · Marketing App'
                                      : flow.usesPagesApp
                                        ? ' · Pages App'
                                        : flow.usesLoginApp
                                          ? ' · Login App'
                                          : ''}
                                  </p>
                                ) : null}
                                {flow.grantedScopes?.length ? (
                                  <p className="mt-1 text-xs text-emerald-800">
                                    Granted: {flow.grantedScopes.join(', ')}
                                    {flow.connectedAt
                                      ? ` · ${new Date(flow.connectedAt).toLocaleString('cs-CZ')}`
                                      : ''}
                                  </p>
                                ) : null}
                                {flow.missingScopes?.length ? (
                                  <p className="mt-1 text-xs text-red-800">
                                    Chybí: {flow.missingScopes.join(', ')}
                                  </p>
                                ) : null}
                                {flow.excludedScopes?.length ? (
                                  <p className="mt-1 text-xs text-amber-800">
                                    Vyloučeno: {flow.excludedScopes.join(', ')}
                                  </p>
                                ) : null}
                                {flow.warnings?.length ? (
                                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-900">
                                    {flow.warnings.map((w) => (
                                      <li key={w}>{w}</li>
                                    ))}
                                  </ul>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                disabled={busy || !flow.canConnect}
                                onClick={() => void connectMetaFlow(flow.key)}
                                className="shrink-0 rounded-lg bg-[#1877f2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#166fe5] disabled:opacity-50"
                              >
                                {flow.status === 'connected' || flow.status === 'reconnect'
                                  ? 'Znovu připojit'
                                  : 'Připojit'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {lastOAuthCallback ? (
                    <div className="mb-4 rounded-2xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
                      <h3 className="mb-3 font-bold text-violet-950">POSLEDNÍ CALLBACK</h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm sm:col-span-2">
                          <p className="text-xs font-medium text-zinc-500">Celá URL</p>
                          <p className={monoUrlClass(lastOAuthCallback.fullUrl)}>
                            {lastOAuthCallback.fullUrl}
                          </p>
                          {containsLocalhost(lastOAuthCallback.fullUrl) ? (
                            <p className="mt-1 text-xs font-bold text-red-700">
                              Obsahuje localhost — po deployi spusťte „Vyčistit OAuth cache“ nebo nový
                              OAuth pokus.
                            </p>
                          ) : null}
                        </div>
                        <div className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm">
                          <p className="text-xs font-medium text-zinc-500">Čas</p>
                          <p className="mt-1 text-xs">
                            {new Date(lastOAuthCallback.receivedAt).toLocaleString('cs-CZ')}
                          </p>
                        </div>
                        <div className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm">
                          <p className="text-xs font-medium text-zinc-500">Výsledek</p>
                          <p className="mt-1 text-xs">
                            {lastOAuthCallback.outcome}
                            {lastOAuthCallback.reason ? ` — ${lastOAuthCallback.reason}` : ''}
                          </p>
                        </div>
                        <div className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm">
                          <p className="text-xs font-medium text-zinc-500">IP</p>
                          <p className="mt-1 font-mono text-xs">{lastOAuthCallback.ip ?? '—'}</p>
                        </div>
                        <div className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm">
                          <p className="text-xs font-medium text-zinc-500">User Agent</p>
                          <p className="mt-1 break-all font-mono text-[11px]">
                            {lastOAuthCallback.userAgent ?? '—'}
                          </p>
                        </div>
                        <div className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm sm:col-span-2">
                          <p className="text-xs font-medium text-zinc-500">Query parametry</p>
                          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px]">
                            {JSON.stringify(lastOAuthCallback.query, null, 2)}
                          </pre>
                        </div>
                        <div className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm sm:col-span-2">
                          <p className="text-xs font-medium text-zinc-500">Parsed JSON (Facebook)</p>
                          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px]">
                            {JSON.stringify(lastOAuthCallback.parsedJson, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {activeOAuthPreview ? (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                        <p className="text-xs font-medium text-zinc-500">
                          OAuth flow: {activeOAuthPreview.oauthFlowLabel ?? activeOAuthPreview.oauthFlow ?? '—'}
                        </p>
                        <p className="mt-1 text-xs text-zinc-600">
                          Finální scopes:{' '}
                          {activeOAuthPreview.scopesList?.join(', ') ?? activeOAuthPreview.scope}
                        </p>
                        {activeOAuthPreview.excludedScopes?.length ? (
                          <p className="mt-1 text-xs text-amber-800">
                            Vyloučeno: {activeOAuthPreview.excludedScopes.join(', ')}
                          </p>
                        ) : null}
                        {activeOAuthPreview.scopeWarnings?.length ? (
                          <ul className="mt-1 list-disc pl-4 text-xs text-amber-900">
                            {activeOAuthPreview.scopeWarnings.map((w) => (
                              <li key={w}>{w}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                      <div
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          containsLocalhost(activeOAuthPreview.facebookOAuthUrl)
                            ? 'border-red-300 bg-red-50'
                            : 'border-zinc-200 bg-zinc-50'
                        }`}
                      >
                        <p className="text-xs font-medium text-zinc-500">Facebook OAuth URL</p>
                        <p className={monoUrlClass(activeOAuthPreview.facebookOAuthUrl)}>
                          {activeOAuthPreview.facebookOAuthUrl}
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {[
                          ['client_id', activeOAuthPreview.client_id],
                          ['redirect_uri', activeOAuthPreview.redirect_uri],
                          ['scope', activeOAuthPreview.scope],
                          ['response_type', activeOAuthPreview.response_type],
                          ['state', activeOAuthPreview.state],
                          ['prompt', activeOAuthPreview.prompt],
                          ['auth_type', activeOAuthPreview.auth_type ?? '—'],
                        ].map(([label, val]) => (
                          <div
                            key={String(label)}
                            className={`rounded-lg border px-3 py-2 text-sm ${
                              containsLocalhost(String(val))
                                ? 'border-red-300 bg-red-50'
                                : 'border-zinc-200 bg-zinc-50'
                            }`}
                          >
                            <p className="text-xs font-medium text-zinc-500">{label}</p>
                            <p className={monoUrlClass(String(val))}>{String(val)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">
                      Klikněte na „Otestovat OAuth“ pro náhled parametrů odesílaných do Meta.
                    </p>
                  )}
                </div>

                {oauthRedirect ? (
                  <div
                    className={`rounded-2xl border p-4 shadow-sm ${
                      oauthRedirect.redirectUriInAllowedConfig && !oauthRedirect.isRailwayRedirectUri
                        ? 'border-emerald-200 bg-white'
                        : 'border-amber-200 bg-amber-50'
                    }`}
                  >
                    <h2 className="mb-3 text-lg font-bold">OAuth Redirect URI (konfigurace)</h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        ['Používaná redirect_uri', oauthRedirect.oauthRedirectUsedByApp],
                        ['Zdroj redirect URI', oauthRedirect.redirectUriSource ?? '—'],
                        ['Doporučená redirect_uri', oauthRedirect.recommendedRedirectUri],
                        ['META_REDIRECT_URI', oauthRedirect.explicitRedirectUri ?? '—'],
                        ['Allowed Redirect URIs (config)', oauthRedirect.allowedRedirectUris?.join(', ')],
                        ['BACKEND_URL', oauthRedirect.backendBaseUrl],
                        ['API public base (OAuth)', oauthRedirect.apiPublicBase],
                        ['FRONTEND_URL', oauthRedirect.frontendUrl],
                        ['Pages App ID', oauthRedirect.pagesAppId],
                      ].map(([label, val]) => (
                        <div
                          key={String(label)}
                          className={`rounded-lg border px-3 py-2 text-sm ${
                            containsLocalhost(String(val ?? ''))
                              ? 'border-red-300 bg-red-50'
                              : 'border-zinc-200 bg-zinc-50'
                          }`}
                        >
                          <p className="text-xs font-medium text-zinc-500">{label}</p>
                          <p className={monoUrlClass(String(val ?? ''))}>{String(val ?? '—')}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {oauthApiErrorLogs.length > 0 ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
                    <h3 className="mb-2 font-bold text-red-900">Poslední OAuth chyby (Meta API logy)</h3>
                    <div className="space-y-2">
                      {oauthApiErrorLogs.slice(0, 5).map((log) => (
                        <div key={log.id} className="rounded-lg border border-red-200 bg-white p-3 text-xs">
                          <p className="text-red-800">
                            {new Date(log.createdAt).toLocaleString('cs-CZ')} · {log.endpoint} ·{' '}
                            {log.errorCode ?? 'oauth'} · {log.errorMessage ?? '—'}
                          </p>
                          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-zinc-700">
                            {JSON.stringify(log.request ?? log.response, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {oauthDebugOpen ? (
                  <div className="rounded-2xl border border-violet-300 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-bold text-violet-950">OAuth Debug — historie komunikace</h3>
                      <button
                        type="button"
                        onClick={() => setOauthDebugOpen(false)}
                        className="rounded-lg border border-zinc-300 px-3 py-1 text-xs font-semibold hover:bg-zinc-50"
                      >
                        Zavřít
                      </button>
                    </div>
                    {oauthDebugMeta?.canonicalRedirectUri ? (
                      <p className="mb-3 break-all font-mono text-xs text-zinc-600">
                        Kanonická redirect URI: {oauthDebugMeta.canonicalRedirectUri}
                      </p>
                    ) : null}
                    {oauthDebugMeta?.localhostDetected ? (
                      <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-900">
                        <p className="font-bold">LOCALHOST v OAuth logu</p>
                        <p className="mt-1">
                          {oauthDebugMeta.localhostWarning ??
                            'Staré záznamy mohou obsahovat interní Railway host — nové OAuth toky už používají pouze META_REDIRECT_URI / BACKEND_URL.'}
                        </p>
                      </div>
                    ) : null}
                    {oauthDebugLogs.length === 0 ? (
                      <p className="text-sm text-zinc-500">Zatím žádné OAuth záznamy.</p>
                    ) : (
                      <div className="max-h-[32rem] space-y-3 overflow-y-auto">
                        {oauthDebugLogs.map((log) => (
                          <div
                            key={log.id}
                            className={`rounded-lg border p-3 text-xs ${
                              log.hasLocalhost
                                ? 'border-red-400 bg-red-50'
                                : log.phase === 'OAuth Error'
                                  ? 'border-red-200 bg-red-50'
                                  : log.phase === 'OAuth Success'
                                    ? 'border-emerald-200 bg-emerald-50'
                                    : 'border-zinc-200 bg-zinc-50'
                            }`}
                          >
                            <p className="font-bold">
                              {new Date(log.createdAt).toLocaleString('cs-CZ')} · {log.phase}
                              {log.durationMs != null ? ` · ${log.durationMs} ms` : ''}
                              {log.hasLocalhost ? ' · LOCALHOST' : ''}
                            </p>
                            {log.localhostHits?.length ? (
                              <ul className="mt-1 list-inside list-disc font-mono text-[11px] text-red-800">
                                {log.localhostHits.map((hit) => (
                                  <li key={hit} className="break-all">
                                    {hit}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            {log.errorMessage ? (
                              <p className="mt-1 text-red-800">{log.errorMessage}</p>
                            ) : null}
                            <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap font-mono text-[11px]">
                              request: {JSON.stringify(log.request, null, 2)}
                              {'\n'}
                              response: {JSON.stringify(log.response, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </section>
            ) : null}

            {tab === 'dashboard' && !hasDataset && datasets?.canSelect ? (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-amber-950">Vyberte Dataset</h2>
                    <p className="text-sm text-amber-900">
                      Katalog a Business Manager jsou připojené. Pro Conversions API vyberte Dataset z
                      Meta Events Manageru — ENV META_DATASET_ID není potřeba.
                    </p>
                  </div>
                </div>
                {datasets.error ? (
                  <MetaApiErrorBlock error={datasets.error} className="mb-3 text-sm text-amber-800" />
                ) : null}
                <div className="space-y-2">
                  {(datasets.items ?? []).map((ds) => (
                    <div
                      key={ds.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm"
                    >
                      <div>
                        <p className="font-semibold">{ds.name}</p>
                        <p className="font-mono text-xs text-zinc-500">ID: {ds.id}</p>
                        <p className="text-xs text-zinc-500">
                          Aktivita:{' '}
                          {ds.lastFiredTime
                            ? new Date(ds.lastFiredTime).toLocaleString('cs-CZ')
                            : 'zatím bez událostí'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          if (!token) return;
                          setBusy(true);
                          const r = await nestAdminMetaCenterSelectDataset(token, ds.id);
                          setBusy(false);
                          setMsg(
                            r.ok
                              ? `Dataset Připojeno — ID ${ds.id}`
                              : r.error ?? 'Uložení selhalo.',
                          );
                          void refresh();
                        }}
                        className="rounded-lg bg-[#1877f2] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Použít Dataset
                      </button>
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
                          <p className="mt-1 text-xs opacity-80">{safeText(item.detail)}</p>
                        ) : null}
                        {item.source ? (
                          <p className="mt-1 text-xs opacity-70">
                            Zdroj: {META_SOURCE_LABELS[item.source] ?? item.source}
                          </p>
                        ) : null}
                      </div>
                      {!item.connected && item.fixAction ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void applyFix(item.fixAction!)}
                          className={`rounded-lg border px-3 py-1 text-xs font-semibold whitespace-nowrap ${
                            item.fixAction === 'select_dataset'
                              ? 'border-amber-500 bg-amber-50 text-amber-900'
                              : 'border-current'
                          }`}
                        >
                          {fixActionLabel(item.fixAction)}
                        </button>
                      ) : !item.connected &&
                        connectionCheckStatus(item) !== 'optional' &&
                        connectionCheckStatus(item) !== 'permission_warning' &&
                        item.fixHref ? (
                        <Link
                          href={item.fixHref}
                          className="rounded-lg border border-current px-3 py-1 text-xs font-semibold whitespace-nowrap"
                        >
                          Opravit
                        </Link>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void checkPermissions()}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    Zkontrolovat oprávnění
                  </button>
                  <a
                    href={META_EXTERNAL_LINKS.developersApps}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50"
                  >
                    Otevřít Meta App
                  </a>
                  <a
                    href={META_EXTERNAL_LINKS.commerceManager}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50"
                  >
                    Otevřít Commerce Manager
                  </a>
                  <a
                    href={META_EXTERNAL_LINKS.catalogs}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50"
                  >
                    Otevřít Catalog
                  </a>
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
              <section className="space-y-4">
                {catalogGraph.hasPermissionWarning && catalogGraph.permissionWarning ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
                    <p className="font-semibold">Upozornění — oprávnění Meta App</p>
                    <p className="mt-2">{catalogGraph.permissionWarning}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a
                        href={META_EXTERNAL_LINKS.developersApps}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-amber-100"
                      >
                        Otevřít Meta App
                      </a>
                      <a
                        href={META_EXTERNAL_LINKS.commerceManager}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-amber-100"
                      >
                        Otevřít Commerce Manager
                      </a>
                      <a
                        href={META_EXTERNAL_LINKS.catalogs}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-amber-100"
                      >
                        Otevřít Catalog
                      </a>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <h2 className="mb-3 text-lg font-bold">Diagnostika katalogu (Graph API)</h2>
                  <p className="mb-4 whitespace-pre-wrap text-xs text-zinc-500">
                    Ověřeno: {new Date(catalogGraph.graphCheckedAt).toLocaleString('cs-CZ')}
                    {catalogGraph.hasPermissionWarning
                      ? ''
                      : catalogGraph.graphErrorJson
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
                      ['Stav oprávnění Commerce API', catalogGraph.commercePermissionStatus],
                      ['Commerce — typ stavu', catalogGraph.commerceIssueKind ?? '—'],
                      ['Catalog — typ stavu', catalogGraph.catalogIssueKind ?? '—'],
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
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-bold">Požadovaná oprávnění</h2>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void checkPermissions()}
                      className="rounded-lg border border-[#1877f2] px-3 py-1.5 text-xs font-semibold text-[#1877f2] hover:bg-blue-50"
                    >
                      Zkontrolovat oprávnění
                    </button>
                  </div>
                  {permissionsCheck?.error ? (
                    <MetaApiErrorBlock error={permissionsCheck.error} className="mb-3 text-sm text-amber-800" />
                  ) : null}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {scopeRows.map((row) => (
                      <div
                        key={row.scope}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                          row.granted
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                            : 'border-red-200 bg-red-50 text-red-900'
                        }`}
                      >
                        <span aria-hidden>{row.granted ? '🟢' : '🔴'}</span>
                        <code className="text-xs">{row.scope}</code>
                      </div>
                    ))}
                  </div>
                  {permissionsCheck?.checkedAt ? (
                    <p className="mt-3 text-xs text-zinc-500">
                      Poslední kontrola: {new Date(permissionsCheck.checkedAt).toLocaleString('cs-CZ')}
                    </p>
                  ) : null}
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

        {tab === 'settings' ? (
          <section className="space-y-6">
            {!dash ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
                <h2 className="mb-2 text-lg font-bold">Nastavení Meta Centra</h2>
                <p>Dashboard data se nepodařilo načíst. Zkuste obnovit stránku nebo dokončit Meta OAuth.</p>
                {endpointWarnings.length > 0 ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5">
                    {endpointWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <>
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-lg font-bold">Stav API odpovědí</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    { label: 'Dashboard', status: dash.status ?? (dash.ok === false ? 'not_configured' : 'ok'), message: dash.message, error: dash.error },
                    { label: 'Datasety', status: datasets?.status, message: datasets?.message, error: datasets?.error },
                    { label: 'Reklamní účet', status: adAccount?.status, message: adAccount?.message, error: adAccount?.error },
                    { label: 'Seznam účtů', status: adAccountList?.status, message: adAccountList?.message, error: adAccountList?.error },
                    { label: 'Katalog', status: catalogPanel?.status, message: catalogPanel?.message, error: catalogPanel?.error },
                    { label: 'Seznam katalogů', status: catalogList?.status, message: catalogList?.message, error: catalogList?.error },
                  ] as const
                ).map(({ label, status, message, error }) => (
                  <div key={label} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                    <p className="text-xs font-medium text-zinc-500">{label}</p>
                    <p className="mt-1 text-xs">
                      <span className="font-semibold">Status:</span> {safeDisplayValue(status)}
                    </p>
                    {message ? (
                      <p className="mt-1 text-xs text-amber-900">{safeText(message)}</p>
                    ) : null}
                    <MetaApiErrorBlock error={error} className="mt-1 text-xs text-amber-800" />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="mb-2 text-lg font-bold">Reklamní účet</h2>
              {adAccount?.connected ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 sm:col-span-2">
                    <p className="font-semibold">✓ Reklamní účet připojen</p>
                    {dash.settings.isMarketingAdsConnected ? (
                      <p className="mt-1 text-xs">✓ Ads API připojeno</p>
                    ) : (
                      <p className="mt-1 text-xs text-amber-800">
                        Ads API zatím neaktivní — dokončete Marketing OAuth.
                      </p>
                    )}
                  </div>
                  {[
                    ['Stav', 'Připojeno'],
                    ['Ad Account ID', adAccount.adAccountId],
                    ['Název', adAccount.name],
                    ['Měna', adAccount.currency],
                    ['Časová zóna', adAccount.timezone],
                  ].map(([label, val]) => (
                    <div key={String(label)} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                      <p className="text-xs font-medium text-zinc-500">{label}</p>
                      <SettingsValue value={val} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                  {safeDisplayValue(
                    adAccount?.message,
                    'Reklamní účet není nastavený. Je potřeba až pro spouštění kampaní.',
                  )}
                </p>
              )}
              <MetaApiErrorBlock error={adAccount?.error} className="mt-3 text-sm text-amber-800" />
              <button
                type="button"
                disabled={busy}
                onClick={() => void connectMetaFlow('marketing')}
                className="mt-4 rounded-lg border border-[#1877f2] px-4 py-2 text-sm font-semibold text-[#1877f2] hover:bg-blue-50"
              >
                Připojit reklamní účet (Marketing OAuth)
              </button>
              <div className="mt-4 space-y-2">
                {(adAccountList?.items ?? []).map((acc) => (
                  <div
                    key={acc.id}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                      acc.isActive ? 'border-emerald-300 bg-emerald-50' : 'border-zinc-200'
                    }`}
                  >
                    <div>
                      <p className="font-semibold">{acc.name}</p>
                      <p className="font-mono text-xs text-zinc-500">{acc.id}</p>
                      {acc.currency ? (
                        <p className="text-xs text-zinc-500">Měna: {acc.currency}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={busy || acc.isActive}
                      onClick={async () => {
                        if (!token) return;
                        setBusy(true);
                        const r = await nestAdminMetaCenterSelectAdAccount(token, acc.id);
                        setBusy(false);
                        setMsg(r.ok ? `Reklamní účet ${acc.id} uložen.` : r.error ?? 'Chyba');
                        void refresh();
                      }}
                      className="rounded-lg bg-[#1877f2] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {acc.isActive ? 'Aktivní' : 'Použít tento účet'}
                    </button>
                  </div>
                ))}
                {adAccountList?.error ? (
                  <MetaApiErrorBlock error={adAccountList.error} className="text-xs text-amber-800" />
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-medium text-zinc-500">Zadat Ad Account ID ručně</span>
                  <input
                    value={manualAdAccountId}
                    onChange={(e) => setManualAdAccountId(e.target.value)}
                    placeholder="act_123456789"
                    className="rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || !manualAdAccountId.trim()}
                  onClick={async () => {
                    if (!token) return;
                    setBusy(true);
                    const r = await nestAdminMetaCenterSelectAdAccount(token, manualAdAccountId.trim());
                    setBusy(false);
                    setMsg(r.ok ? `Reklamní účet uložen.` : r.error ?? 'Chyba');
                    void refresh();
                  }}
                  className="rounded-lg border border-[#1877f2] px-4 py-2 text-sm font-semibold text-[#1877f2]"
                >
                  Uložit Ad Account ID
                </button>
              </div>
            </div>

            <div
              className={`rounded-2xl border p-6 shadow-sm ${
                campaignsLiveEnabled
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-amber-300 bg-amber-50'
              }`}
            >
              <h2 className="mb-2 text-lg font-bold">Spouštění kampaní Meta Ads</h2>
              <p className="mb-4 text-sm">
                {campaignsLiveEnabled ? (
                  <span className="font-semibold text-emerald-900">
                    🟢 Ostré spuštění AKTIVNÍ — kampaně se publikují do Meta Ads Manageru.
                  </span>
                ) : (
                  <span className="font-semibold text-amber-900">
                    🟡 Pouze koncepty — kampaně se ukládají pouze do databáze XXREALIT.
                  </span>
                )}
              </p>
              <div className="space-y-3">
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/60 bg-white/70 px-4 py-3 text-sm">
                  <input
                    type="radio"
                    name="campaignsLiveMode"
                    checked={!campaignsLiveEnabled}
                    disabled={busy}
                    onChange={async () => {
                      if (!token || campaignsLiveEnabled === false) return;
                      setBusy(true);
                      const r = await nestAdminMetaCenterPatchSettings(token, {
                        campaignsLiveEnabled: false,
                      });
                      setBusy(false);
                      if (r.ok) {
                        setCampaignsLiveEnabled(false);
                        setMsg('Režim koncept aktivován.');
                        void refresh();
                      } else {
                        setMsg(r.error ?? 'Uložení selhalo.');
                      }
                    }}
                    className="mt-1"
                  />
                  <span>
                    <strong>Režim koncept (bezpečný)</strong>
                    <br />
                    <span className="text-zinc-600">Ukládá pouze do databáze, Meta API se nevolá.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/60 bg-white/70 px-4 py-3 text-sm">
                  <input
                    type="radio"
                    name="campaignsLiveMode"
                    checked={campaignsLiveEnabled}
                    disabled={busy}
                    onChange={async () => {
                      if (!token || campaignsLiveEnabled === true) return;
                      if (
                        !window.confirm(
                          'Opravdu zapnout ostré spuštění? Kampaně budou vytvářeny v Meta Ads účtu.',
                        )
                      ) {
                        return;
                      }
                      setBusy(true);
                      const r = await nestAdminMetaCenterPatchSettings(token, {
                        campaignsLiveEnabled: true,
                      });
                      setBusy(false);
                      if (r.ok) {
                        setCampaignsLiveEnabled(true);
                        setMsg('Ostré spuštění kampaní zapnuto.');
                        void refresh();
                      } else {
                        setMsg(r.error ?? 'Uložení selhalo.');
                      }
                    }}
                    className="mt-1"
                  />
                  <span>
                    <strong>Ostré spuštění kampaní přes Meta Marketing API</strong>
                    <br />
                    <span className="text-zinc-600">
                      Tlačítko „Spustit kampaň“ vytvoří Campaign, Ad Set, Creative a Ad v Meta.
                    </span>
                  </span>
                </label>
              </div>
            </div>

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
                    <SettingsValue value={val} />
                  </div>
                ))}
              </div>
              {appsConfig?.login.idValidation.error ? (
                <MetaApiErrorBlock
                  error={appsConfig.login.idValidation.error}
                  className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                />
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
                  ['Conversions API Token', dash.settings.conversionsApiTokenMasked ? 'nastaveno' : 'Nenastaveno (volitelné)'],
                  ['Webhook Verify Token', dash.settings.webhookVerifyTokenMasked ? 'nastaveno' : 'chybí'],
                  ['Webhook Secret', dash.settings.webhookSecretMasked ? 'nastaveno' : 'chybí'],
                ].map(([label, val]) => (
                  <div key={String(label)} className="rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm">
                    <p className="text-xs font-medium text-zinc-500">{label}</p>
                    <SettingsValue value={val} />
                  </div>
                ))}
              </div>
              {appsConfig?.pages.idValidation.error ? (
                <MetaApiErrorBlock
                  error={appsConfig.pages.idValidation.error}
                  className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                />
              ) : null}
              <p className="mt-3 text-xs text-purple-800">
                „Připojit Meta účet“ používá sdílený Facebook OAuth callback portálu (
                {safeDisplayValue(appsConfig?.pages.metaConnectRedirectUri)}) a Pages App ID (
                {safeDisplayValue(appsConfig?.pages.appId)}). Token se sdílí se Sociálními sítěmi — při
                opětovném kliknutí pouze obnovíte oprávnění.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-emerald-900">C) Meta Marketing App</h2>
              <p className="mt-1 text-sm text-emerald-800">
                Aplikace <strong>{appsConfig?.marketing.appName ?? 'Marketing'}</strong> — Ads API,
                reklamní účty, kampaně
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ['Marketing App ID', appsConfig?.marketing.appId ?? dash.settings.facebookMarketingAppId],
                  [
                    'Marketing App Secret',
                    appsConfig?.marketing.appSecretConfigured
                      ? appsConfig.marketing.appSecretMasked
                      : 'chybí',
                  ],
                  [
                    'Meta Connect Redirect URI',
                    appsConfig?.marketing.metaConnectRedirectUri ?? dash.settings.metaConnectRedirectUri,
                  ],
                  ['Ads API připojeno', dash.settings.isMarketingAdsConnected ? 'ano' : 'ne'],
                  [
                    'Marketing refresh token',
                    dash.settings.marketingRefreshTokenConfigured ? 'nastaveno' : 'chybí',
                  ],
                  ['Stav Marketing OAuth', appsConfig?.marketing.configured ? 'nastaveno' : 'chybí ENV'],
                ].map(([label, val]) => (
                  <div key={String(label)} className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm">
                    <p className="text-xs font-medium text-zinc-500">{label}</p>
                    <SettingsValue value={val} />
                  </div>
                ))}
              </div>
              {appsConfig?.marketing.idValidation.error ? (
                <MetaApiErrorBlock
                  error={appsConfig.marketing.idValidation.error}
                  className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                />
              ) : null}
              {appsConfig?.marketing.missing?.length ? (
                <p className="mt-3 text-xs text-emerald-900">
                  Chybí ENV: {appsConfig.marketing.missing.join(', ')}
                </p>
              ) : null}
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
                          ? new Date(safeText(raw)).toLocaleString('cs-CZ')
                          : '—'
                        : safeDisplayValue(raw);
                    return (
                      <div key={key} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                        <p className="text-xs font-medium text-zinc-500">{label}</p>
                        <p className="mt-1 break-all font-mono text-xs">{display}</p>
                      </div>
                    );
                  })}
              </div>
            </div>
              </>
            )}
          </section>
        ) : null}

        {tab === 'pixel' && dash ? (
          <section className="space-y-4">
            {dash.pixel.datasetMessage ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                {dash.pixel.datasetMessage}
                {dash.pixel.datasetId ? ` — ID ${dash.pixel.datasetId}` : ''}
              </p>
            ) : null}
            {dash.pixel.pixelPlaceholderMessage ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {dash.pixel.pixelPlaceholderMessage}
              </p>
            ) : null}
            {dash.pixel.legacyDatasetNote ? (
              <p className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                {dash.pixel.legacyDatasetNote}
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Režim', dash.pixel.trackingMode === 'dataset' ? 'Dataset (v21+)' : dash.pixel.trackingMode === 'pixel' ? 'Pixel' : '—'],
                ['Dataset ID', dash.pixel.datasetId ?? dash.capi.datasetId ?? '—'],
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
              <h3 className="mb-3 font-bold">Výběr Datasetu (Graph API)</h3>
              {datasets?.datasetInfo ? (
                <p className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                  {datasets.datasetInfo}
                </p>
              ) : null}
              {datasets?.error && !datasets?.activeDatasetId && !datasets?.datasetInfo ? (
                <MetaApiErrorBlock error={datasets.error} className="mb-3 text-sm text-amber-800" />
              ) : null}
              <p className="mb-3 text-xs text-zinc-500">
                Aktivní Dataset:{' '}
                <strong>{datasets?.activeDatasetId ?? dash.pixel.datasetId ?? '—'}</strong>
              </p>
              <div className="space-y-2">
                {(datasets?.items ?? []).map((ds) => (
                  <div
                    key={ds.id}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                      ds.isActive ? 'border-emerald-300 bg-emerald-50' : 'border-zinc-200'
                    }`}
                  >
                    <div>
                      <p className="font-semibold">{ds.name}</p>
                      <p className="font-mono text-xs text-zinc-500">ID: {ds.id}</p>
                      <p className="text-xs text-zinc-500">
                        Aktivita:{' '}
                        {ds.lastFiredTime
                          ? new Date(ds.lastFiredTime).toLocaleString('cs-CZ')
                          : '—'}
                        {ds.sourceApp ? ` · ${ds.sourceApp}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy || ds.isActive}
                      onClick={async () => {
                        if (!token) return;
                        setBusy(true);
                        const r = await nestAdminMetaCenterSelectDataset(token, ds.id);
                        setBusy(false);
                        setMsg(r.ok ? `Dataset Připojeno — ID ${ds.id}` : r.error ?? 'Uložení selhalo.');
                        void refresh();
                      }}
                      className="rounded-lg bg-[#1877f2] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {ds.isActive ? 'Aktivní' : 'Použít Dataset'}
                    </button>
                  </div>
                ))}
                {!datasets?.items?.length && !datasets?.activeDatasetId ? (
                  <p className="text-sm text-zinc-500">
                    Žádné datasety z Graph API — nejdřív připojte Commerce / Catalog OAuth.
                  </p>
                ) : null}
              </div>
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
            {dash.capi.capiMessage ? (
              <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                {dash.capi.capiMessage}
              </p>
            ) : null}
            <p className="mb-4 text-sm text-zinc-600">
              Režim:{' '}
              <strong>
                {dash.capi.trackingMode === 'dataset'
                  ? 'Dataset (v21+)'
                  : dash.capi.trackingMode === 'pixel'
                    ? 'Pixel'
                    : '—'}
              </strong>
              {' · '}
              Dataset: <strong>{dash.capi.datasetId ?? '—'}</strong>
              {' · '}
              Pixel: <strong>{dash.capi.pixelId ?? '—'}</strong>
              {' · '}
              Token:{' '}
              <strong>
                {dash.capi.tokenLabel ??
                  (dash.capi.tokenConfigured ? 'nastaven' : 'Nenastaveno (volitelné)')}
              </strong>
              {' · '}
              Stav: {dash.capi.status}
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
              { title: 'Catalog', id: catalogPanel?.catalogId ?? dash.settings.catalogId },
              { title: 'Dataset', id: dash.pixel.datasetId ?? dash.settings.datasetId },
              { title: 'Pixel', id: dash.pixel.pixelId ?? '— (volitelný)' },
              { title: 'Feed', id: dash.catalog.enabled ? 'aktivní' : 'vypnutý' },
            ].map((row) => (
              <div key={row.title} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <h3 className="font-bold">{row.title}</h3>
                <p className="text-sm text-zinc-500">ID: {row.id ?? '—'}</p>
                <p className="text-xs text-zinc-400">
                  Sync:{' '}
                  {catalogPanel?.lastSyncAt
                    ? new Date(catalogPanel.lastSyncAt).toLocaleString('cs-CZ')
                    : dash.catalog.lastGeneratedAt
                      ? new Date(dash.catalog.lastGeneratedAt).toLocaleString('cs-CZ')
                      : '—'}
                </p>
              </div>
            ))}
            <div className="sm:col-span-2 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-zinc-600">
                Podrobná správa katalogu, synchronizace a produktů je v záložce{' '}
                <button type="button" onClick={() => setTab('catalog')} className="text-[#1877f2] underline">
                  Katalog
                </button>
                .
              </p>
            </div>
          </section>
        ) : null}

        {tab === 'catalog' && dash ? (
          <section className="space-y-6">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">Katalog nemovitostí</h2>
                  <p className="text-sm text-zinc-500">
                    Commerce / Catalog OAuth — scope: <strong>business_management</strong>
                  </p>
                  <p className="mt-1 text-xs text-amber-800">
                    {catalogPanel?.catalogScopeInfo ??
                      catalogList?.scopeInfo ??
                      'Catalog je řízen přes Business Manager / Commerce Manager. OAuth scope catalog_management není vyžadován.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void connectMetaFlow('catalog')}
                    className="rounded-lg bg-[#1877f2] px-3 py-2 text-xs font-semibold text-white"
                  >
                    Připojit Catalog OAuth
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      if (!token) return;
                      setBusy(true);
                      const r = await nestAdminMetaCenterCreateCatalog(token);
                      setBusy(false);
                      setMsg(r.ok ? `Katalog vytvořen: ${r.catalogId ?? ''}` : r.error ?? 'Chyba');
                      void refresh();
                    }}
                    className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold"
                  >
                    Vytvořit katalog
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      if (!token) return;
                      setBusy(true);
                      const r = await nestAdminMetaCenterSyncCatalog(token);
                      setBusy(false);
                      setMsg(r.ok ? 'Synchronizace spuštěna.' : r.error ?? 'Sync selhal.');
                      void refresh();
                    }}
                    className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold"
                  >
                    Synchronizovat feed
                  </button>
                  <a
                    href={catalogPanel?.commerceManagerUrl ?? META_EXTERNAL_LINKS.commerceManager}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
                  >
                    Otevřít Commerce Manager
                  </a>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Catalog ID', catalogPanel?.catalogId],
                  ['Název katalogu', catalogPanel?.catalogName],
                  ['Položek ve feedu', catalogPanel?.feedItemCount],
                  ['Produktů v Meta', catalogPanel?.productCount],
                  ['Poslední synchronizace', catalogPanel?.lastSyncAt ? new Date(catalogPanel.lastSyncAt).toLocaleString('cs-CZ') : '—'],
                  ['Stav exportu', `${catalogPanel?.feedItemCount ?? 0} exportováno · ${catalogPanel?.exportErrorCount ?? 0} chyb`],
                  ['business_management', catalogPanel?.businessManagementGranted ? 'schváleno' : 'připojte Catalog OAuth'],
                  ['Catalog OAuth', catalogPanel?.catalogConnectedAt ? new Date(catalogPanel.catalogConnectedAt).toLocaleString('cs-CZ') : '—'],
                  ['Commerce Manager', catalogPanel?.commerceOnline ? 'online' : 'volitelné / připravuje se'],
                ].map(([label, val]) => (
                  <div key={String(label)} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                    <p className="text-xs font-medium text-zinc-500">{label}</p>
                    <p className="mt-1 break-all text-xs">{String(val ?? '—')}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-bold">Katalogy v Business Manageru</h3>
                {catalogList?.catalogListInfo ? (
                  <p className="mb-2 text-sm text-blue-800">{catalogList.catalogListInfo}</p>
                ) : null}
                {catalogList?.listUnavailable ? (
                  <p className="mb-2 text-sm text-amber-800">
                    Seznam katalogů: nelze načíst z Graph API
                    {catalogList.warning ? ` — ${catalogList.warning}` : ''}
                  </p>
                ) : null}
                {catalogList?.error && !catalogList.listUnavailable ? (
                  <MetaApiErrorBlock error={catalogList.error} className="mb-2 text-sm text-amber-800" />
                ) : null}
                <div className="space-y-2">
                  {(catalogList?.items ?? []).map((cat) => (
                    <div
                      key={cat.id}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                        cat.isActive ? 'border-emerald-300 bg-emerald-50' : 'border-zinc-200'
                      }`}
                    >
                      <div>
                        <p className="font-semibold">{cat.name}</p>
                        <p className="font-mono text-xs text-zinc-500">ID: {cat.id}</p>
                        {cat.productCount != null ? (
                          <p className="text-xs text-zinc-500">Produktů v Meta: {cat.productCount}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        disabled={busy || cat.isActive}
                        onClick={async () => {
                          if (!token) return;
                          setBusy(true);
                          const r = await nestAdminMetaCenterConnectCatalog(token, cat.id);
                          setBusy(false);
                          setMsg(r.ok ? `Katalog ${cat.id} uložen.` : r.error ?? 'Chyba');
                          void refresh();
                        }}
                        className="rounded-lg bg-[#1877f2] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {cat.isActive ? 'Aktivní katalog' : 'Použít tento katalog'}
                      </button>
                    </div>
                  ))}
                  {!catalogList?.items?.length ? (
                    <p className="text-sm text-zinc-500">
                      {catalogList?.listUnavailable
                        ? 'Seznam katalogů z Graph API není dostupný (vyžaduje Advanced Access). Použijte uložený Catalog ID nebo zadejte ID ručně.'
                        : 'Žádný katalog v Business Manageru — vytvořte ho v Commerce Manageru nebo zadejte Catalog ID ručně.'}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs font-medium text-zinc-500">Zadat Catalog ID ručně</span>
                  <input
                    value={connectCatalogId}
                    onChange={(e) => setConnectCatalogId(e.target.value)}
                    placeholder="např. 1234567890"
                    className="rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || !connectCatalogId.trim()}
                  onClick={async () => {
                    if (!token) return;
                    setBusy(true);
                    const r = await nestAdminMetaCenterConnectCatalog(token, connectCatalogId.trim());
                    setBusy(false);
                    setMsg(r.ok ? `Katalog ${r.catalogId} uložen.` : r.error ?? 'Chyba');
                    void refresh();
                  }}
                  className="rounded-lg border border-[#1877f2] px-4 py-2 text-sm font-semibold text-[#1877f2]"
                >
                  Zadat Catalog ID ručně
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-lg font-bold">Náhled položek katalogu</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs text-zinc-500">
                      <th className="py-2 pr-2">Obrázek</th>
                      <th className="py-2 pr-2">Název</th>
                      <th className="py-2 pr-2">Cena</th>
                      <th className="py-2 pr-2">Lokalita</th>
                      <th className="py-2 pr-2">Typ</th>
                      <th className="py-2 pr-2">Dostupnost</th>
                      <th className="py-2 pr-2">Export</th>
                      <th className="py-2 pr-2">Sync</th>
                      <th className="py-2 pr-2">Catalog Item ID</th>
                      <th className="py-2 pr-2">Chyba</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalogProducts.map((item) => (
                      <tr key={item.propertyId} className="border-b border-zinc-100">
                        <td className="py-2 pr-2">
                          {item.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.image} alt="" className="h-12 w-16 rounded object-cover" />
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2 pr-2 max-w-[200px] truncate">{item.title}</td>
                        <td className="py-2 pr-2 whitespace-nowrap">
                          {item.price != null ? `${item.price} ${item.currency}` : '—'}
                        </td>
                        <td className="py-2 pr-2">{item.city ?? '—'}</td>
                        <td className="py-2 pr-2">{item.propertyType ?? '—'}</td>
                        <td className="py-2 pr-2">{item.availability}</td>
                        <td className="py-2 pr-2">{item.exportStatus}</td>
                        <td className="py-2 pr-2 whitespace-nowrap text-xs">
                          {item.lastExportedAt
                            ? new Date(item.lastExportedAt).toLocaleString('cs-CZ')
                            : '—'}
                        </td>
                        <td className="py-2 pr-2 font-mono text-xs">{item.metaProductId ?? '—'}</td>
                        <td className="py-2 pr-2 text-xs text-red-700">{item.lastError ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!catalogProducts.length ? (
                  <p className="py-4 text-sm text-zinc-500">Zatím žádné exportované položky katalogu.</p>
                ) : null}
              </div>
            </div>
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
          <section className="space-y-6">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-lg font-bold">Vytvořit remarketing publikum</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                  <span className="font-medium">Název publika</span>
                  <input
                    value={remarketingForm.name}
                    onChange={(e) => setRemarketingForm((f) => ({ ...f, name: e.target.value }))}
                    className="rounded-lg border border-zinc-300 px-3 py-2"
                    placeholder="např. Návštěvníci bytů Praha"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Typ publika</span>
                  <select
                    value={remarketingForm.audienceType}
                    onChange={(e) =>
                      setRemarketingForm((f) => ({ ...f, audienceType: e.target.value }))
                    }
                    className="rounded-lg border border-zinc-300 px-3 py-2"
                  >
                    {(remarketingAudienceTypes.length
                      ? remarketingAudienceTypes
                      : [{ type: 'visited_web', label: 'Návštěvníci webu' }]
                    ).map((opt) => (
                      <option key={opt.type} value={opt.type}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Počet dní</span>
                  <select
                    value={remarketingForm.retentionDays}
                    onChange={(e) =>
                      setRemarketingForm((f) => ({
                        ...f,
                        retentionDays: Number(e.target.value) || 30,
                      }))
                    }
                    className="rounded-lg border border-zinc-300 px-3 py-2"
                  >
                    {RETENTION_DAY_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d} dní
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Lokalita (město)</span>
                  <input
                    value={remarketingForm.city}
                    onChange={(e) => setRemarketingForm((f) => ({ ...f, city: e.target.value }))}
                    className="rounded-lg border border-zinc-300 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Okres</span>
                  <input
                    value={remarketingForm.district}
                    onChange={(e) =>
                      setRemarketingForm((f) => ({ ...f, district: e.target.value }))
                    }
                    className="rounded-lg border border-zinc-300 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Kraj</span>
                  <input
                    value={remarketingForm.region}
                    onChange={(e) => setRemarketingForm((f) => ({ ...f, region: e.target.value }))}
                    className="rounded-lg border border-zinc-300 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Typ nemovitosti</span>
                  <input
                    value={remarketingForm.propertyType}
                    onChange={(e) =>
                      setRemarketingForm((f) => ({ ...f, propertyType: e.target.value }))
                    }
                    className="rounded-lg border border-zinc-300 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Cena od</span>
                  <input
                    type="number"
                    value={remarketingForm.priceFrom}
                    onChange={(e) =>
                      setRemarketingForm((f) => ({ ...f, priceFrom: e.target.value }))
                    }
                    className="rounded-lg border border-zinc-300 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Cena do</span>
                  <input
                    type="number"
                    value={remarketingForm.priceTo}
                    onChange={(e) =>
                      setRemarketingForm((f) => ({ ...f, priceTo: e.target.value }))
                    }
                    className="rounded-lg border border-zinc-300 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Pronájem / prodej</span>
                  <select
                    value={remarketingForm.offerType}
                    onChange={(e) =>
                      setRemarketingForm((f) => ({ ...f, offerType: e.target.value }))
                    }
                    className="rounded-lg border border-zinc-300 px-3 py-2"
                  >
                    <option value="">—</option>
                    <option value="sale">Prodej</option>
                    <option value="rent">Pronájem</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">ID inzerátu (volitelné)</span>
                  <input
                    value={remarketingForm.listingId}
                    onChange={(e) =>
                      setRemarketingForm((f) => ({ ...f, listingId: e.target.value }))
                    }
                    className="rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs"
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={busy || !remarketingForm.name.trim()}
                onClick={async () => {
                  if (!token) return;
                  setBusy(true);
                  const r = await nestAdminMetaCenterCreateRemarketingAudience(token, {
                    name: remarketingForm.name.trim(),
                    audienceType: remarketingForm.audienceType,
                    retentionDays: remarketingForm.retentionDays,
                    filters: {
                      city: remarketingForm.city || null,
                      district: remarketingForm.district || null,
                      region: remarketingForm.region || null,
                      propertyType: remarketingForm.propertyType || null,
                      priceFrom: remarketingForm.priceFrom
                        ? Number(remarketingForm.priceFrom)
                        : null,
                      priceTo: remarketingForm.priceTo ? Number(remarketingForm.priceTo) : null,
                      offerType: remarketingForm.offerType || null,
                      listingId: remarketingForm.listingId || null,
                      retentionDays: remarketingForm.retentionDays,
                    },
                  });
                  setBusy(false);
                  if (r.ok) {
                    setMsg(`Publikum „${remarketingForm.name}“ vytvořeno.`);
                    setRemarketingForm((f) => ({ ...f, name: '' }));
                    void refresh();
                  } else {
                    setMsg(r.message ?? 'Vytvoření publika selhalo.');
                  }
                }}
                className="mt-4 rounded-lg bg-[#1877f2] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Vytvořit publikum
              </button>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-lg font-bold">Remarketing publika (XXREALIT)</h2>
              {!remarketingAudiences.length ? (
                <p className="text-sm text-zinc-500">Zatím žádná publika — vytvořte první výše.</p>
              ) : (
                <ul className="space-y-2">
                  {remarketingAudiences.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{a.name}</p>
                        <p className="text-xs text-zinc-500">{a.audienceTypeLabel}</p>
                        <p className="mt-1 text-xs text-zinc-600">
                          Odhad: {(a.estimatedCount ?? 0).toLocaleString('cs-CZ')} · Meta:{' '}
                          {(a.metaEstimate ?? 0).toLocaleString('cs-CZ')}
                        </p>
                        {a.lastSyncedAt ? (
                          <p className="text-[10px] text-zinc-400">
                            Sync: {new Date(a.lastSyncedAt).toLocaleString('cs-CZ')}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            a.status === 'ready'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-zinc-200 text-zinc-700'
                          }`}
                        >
                          {a.status}
                        </span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            if (!token) return;
                            setBusy(true);
                            const r = await nestAdminMetaCenterSyncRemarketingAudience(token, a.id);
                            setBusy(false);
                            setMsg(r.ok ? `Publikum „${a.name}“ synchronizováno.` : r.message ?? 'Sync selhal.');
                            void refresh();
                          }}
                          className="text-xs text-[#1877f2] underline disabled:opacity-50"
                        >
                          Synchronizovat
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-bold">Přednastavená publika (konfigurace)</h2>
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
            </div>
          </section>
        ) : null}

        {tab === 'campaigns' && dash ? (
          <section className="space-y-6">
            <div
              className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${
                campaignsLiveEnabled
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                  : 'border-amber-300 bg-amber-50 text-amber-950'
              }`}
            >
              {campaignsLiveEnabled ? (
                <p className="font-semibold">🟢 Ostré spuštění AKTIVNÍ — „Spustit kampaň“ publikuje do Meta Ads.</p>
              ) : (
                <p className="font-semibold">
                  🟡 Pouze koncepty — zapněte ostré spuštění v záložce Nastavení.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm overflow-x-auto">
              <h2 className="mb-4 text-lg font-bold">Přehled kampaní</h2>
              {!campaignOverview.length ? (
                <p className="text-sm text-zinc-500">Zatím žádné kampaně.</p>
              ) : (
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs text-zinc-500">
                      <th className="py-2 pr-2">Název</th>
                      <th className="py-2 pr-2">Cíl</th>
                      <th className="py-2 pr-2">Rozpočet</th>
                      <th className="py-2 pr-2">Dosah</th>
                      <th className="py-2 pr-2">Kliknutí</th>
                      <th className="py-2 pr-2">CTR</th>
                      <th className="py-2 pr-2">CPC</th>
                      <th className="py-2 pr-2">Konverze</th>
                      <th className="py-2 pr-2">Status</th>
                      <th className="py-2 pr-2">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignOverview.map((c) => {
                      const ins = c.metaInsights;
                      const metaLabel =
                        META_STATUS_LABELS[c.metaEffectiveStatus ?? c.metaStatus ?? ''] ??
                        c.metaEffectiveStatus ??
                        c.metaStatus ??
                        CAMPAIGN_STATUS_LABELS[c.status] ??
                        c.status;
                      return (
                        <tr key={c.id} className="border-b border-zinc-100">
                          <td className="py-2 pr-2 font-medium">{c.name}</td>
                          <td className="py-2 pr-2">{CAMPAIGN_GOAL_LABELS[c.objective] ?? c.objective}</td>
                          <td className="py-2 pr-2">{c.dailyBudgetCzk ?? '—'} Kč/d</td>
                          <td className="py-2 pr-2">{ins?.reach?.toLocaleString('cs-CZ') ?? '—'}</td>
                          <td className="py-2 pr-2">{ins?.clicks?.toLocaleString('cs-CZ') ?? '—'}</td>
                          <td className="py-2 pr-2">
                            {ins?.ctr != null ? `${(ins.ctr * (ins.ctr < 1 ? 100 : 1)).toFixed(2)} %` : '—'}
                          </td>
                          <td className="py-2 pr-2">
                            {ins?.cpc != null ? `${ins.cpc.toFixed(2)} Kč` : '—'}
                          </td>
                          <td className="py-2 pr-2">{ins?.conversions?.toLocaleString('cs-CZ') ?? '—'}</td>
                          <td className="py-2 pr-2">
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs">{metaLabel}</span>
                          </td>
                          <td className="py-2 pr-2">
                            <div className="flex flex-wrap gap-1">
                              {!c.metaCampaignId && campaignsLiveEnabled ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  title="Spustit v Meta"
                                  onClick={async () => {
                                    if (!token) return;
                                    setBusy(true);
                                    const r = await nestAdminMetaCenterLaunchCampaignDraft(token, c.id);
                                    setBusy(false);
                                    setMsg(r.message ?? (r.ok ? 'Kampaň spuštěna.' : 'Chyba'));
                                    void refresh();
                                  }}
                                  className="rounded border border-emerald-400 px-1.5 py-0.5 text-xs"
                                >
                                  ▶
                                </button>
                              ) : null}
                              {c.metaCampaignId ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    title="Spustit"
                                    onClick={async () => {
                                      if (!token) return;
                                      setBusy(true);
                                      const r = await nestAdminMetaCenterControlCampaign(token, c.id, 'activate');
                                      setBusy(false);
                                      setMsg(r.message ?? '');
                                      void refresh();
                                    }}
                                    className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs"
                                  >
                                    ▶
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    title="Pozastavit"
                                    onClick={async () => {
                                      if (!token) return;
                                      setBusy(true);
                                      const r = await nestAdminMetaCenterControlCampaign(token, c.id, 'pause');
                                      setBusy(false);
                                      setMsg(r.message ?? '');
                                      void refresh();
                                    }}
                                    className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs"
                                  >
                                    ⏸
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    title="Obnovit"
                                    onClick={async () => {
                                      if (!token) return;
                                      setBusy(true);
                                      const r = await nestAdminMetaCenterControlCampaign(token, c.id, 'resume');
                                      setBusy(false);
                                      setMsg(r.message ?? '');
                                      void refresh();
                                    }}
                                    className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs"
                                  >
                                    ▶
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    title="Smazat"
                                    onClick={async () => {
                                      if (!token || !window.confirm(`Smazat kampaň „${c.name}" v Meta?`)) return;
                                      setBusy(true);
                                      const r = await nestAdminMetaCenterControlCampaign(token, c.id, 'delete');
                                      setBusy(false);
                                      setMsg(r.message ?? '');
                                      void refresh();
                                    }}
                                    className="rounded border border-red-300 px-1.5 py-0.5 text-xs text-red-700"
                                  >
                                    🗑
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold">
                  {editingCampaignId ? 'Upravit koncept kampaně' : 'Vytvořit kampaň'}
                </h2>
                {editingCampaignId ? (
                  <button
                    type="button"
                    onClick={resetCampaignForm}
                    className="text-xs text-zinc-500 underline"
                  >
                    Zrušit úpravu
                  </button>
                ) : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                  <span className="font-medium">Název kampaně</span>
                  <input
                    value={campaignDraft.name}
                    onChange={(e) => setCampaignDraft((d) => ({ ...d, name: e.target.value }))}
                    className="rounded-lg border border-zinc-300 px-3 py-2"
                    placeholder="např. Byty Praha 10 km"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Cíl kampaně</span>
                  <select
                    value={campaignDraft.goal}
                    onChange={(e) => setCampaignDraft((d) => ({ ...d, goal: e.target.value }))}
                    className="rounded-lg border border-zinc-300 px-3 py-2"
                  >
                    <option value="traffic">Návštěvnost</option>
                    <option value="messages">Zprávy</option>
                    <option value="lead">Lead</option>
                    <option value="catalog">Katalogový prodej</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Cílení kampaně</span>
                  <select
                    value={campaignDraft.targetingMode}
                    onChange={(e) =>
                      setCampaignDraft((d) => ({ ...d, targetingMode: e.target.value }))
                    }
                    className="rounded-lg border border-zinc-300 px-3 py-2"
                  >
                    {Object.entries(TARGETING_MODE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {campaignDraft.targetingMode !== 'map' ? (
                  <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                    <span className="font-medium">Remarketing publikum</span>
                    <select
                      value={campaignDraft.audienceId}
                      onChange={(e) =>
                        setCampaignDraft((d) => ({ ...d, audienceId: e.target.value }))
                      }
                      className="rounded-lg border border-zinc-300 px-3 py-2"
                    >
                      <option value="">— Nové publikum (mapa) —</option>
                      {remarketingAudiences.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({(a.estimatedCount ?? 0).toLocaleString('cs-CZ')})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Typ nemovitosti</span>
                  <select
                    value={campaignDraft.propertyType}
                    onChange={(e) =>
                      setCampaignDraft((d) => ({ ...d, propertyType: e.target.value }))
                    }
                    className="rounded-lg border border-zinc-300 px-3 py-2"
                  >
                    <option value="byt">Byt</option>
                    <option value="dum">Dům</option>
                    <option value="pozemek">Pozemek</option>
                    <option value="komerce">Komerce</option>
                  </select>
                </label>
                <label className="relative flex flex-col gap-1 text-sm sm:col-span-2">
                  <span className="font-medium">Město / lokalita (Meta Geo)</span>
                  <input
                    value={campaignDraft.cityName}
                    onChange={(e) =>
                      setCampaignDraft((d) => ({
                        ...d,
                        cityName: e.target.value,
                        locationLabel: e.target.value,
                        metaGeoKey: '',
                        metaGeoCountry: '',
                        metaGeoRegion: '',
                      }))
                    }
                    onFocus={() => {
                      if (geoSuggestions.length > 0) setShowGeoSuggestions(true);
                    }}
                    onBlur={() => {
                      window.setTimeout(() => setShowGeoSuggestions(false), 150);
                    }}
                    className="rounded-lg border border-zinc-300 px-3 py-2"
                    placeholder="Začněte psát: Par… → Pardubice"
                    autoComplete="off"
                  />
                  {geoSearchBusy ? (
                    <span className="text-xs text-zinc-500">Načítám z Meta…</span>
                  ) : null}
                  {showGeoSuggestions && geoSuggestions.length > 0 ? (
                    <ul className="absolute top-full z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
                      {geoSuggestions.map((item) => (
                        <li key={item.metaKey}>
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => selectGeoLocation(item)}
                          >
                            <span className="font-medium">{item.city}</span>
                            {item.region ? (
                              <span className="text-zinc-500"> · {item.region}</span>
                            ) : null}
                            <span className="block font-mono text-xs text-zinc-500">
                              Geo ID {item.metaKey}
                              {item.country ? ` · ${item.country}` : ''}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </label>
                {campaignDraft.metaGeoKey || campaignDraft.latitude || campaignDraft.longitude ? (
                  <div className="sm:col-span-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
                    <p className="font-semibold">Cílení odeslané do Meta</p>
                    <ul className="mt-1 space-y-0.5 font-mono text-xs">
                      <li>
                        {campaignDraft.metaGeoKey
                          ? `✓ Meta Geo ID: ${campaignDraft.metaGeoKey}`
                          : '○ Meta Geo ID: bude dohledáno nebo použity souřadnice'}
                      </li>
                      <li>
                        ✓ Země: {campaignDraft.metaGeoCountry || '—'}
                      </li>
                      <li>✓ Region: {campaignDraft.metaGeoRegion || '—'}</li>
                      <li>
                        ✓ Souřadnice:{' '}
                        {campaignDraft.latitude && campaignDraft.longitude
                          ? `${campaignDraft.latitude}, ${campaignDraft.longitude}`
                          : '—'}
                      </li>
                    </ul>
                  </div>
                ) : null}
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Latitude</span>
                  <input
                    value={campaignDraft.latitude}
                    onChange={(e) => setCampaignDraft((d) => ({ ...d, latitude: e.target.value }))}
                    className="rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm"
                    placeholder="50.0755"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Longitude</span>
                  <input
                    value={campaignDraft.longitude}
                    onChange={(e) => setCampaignDraft((d) => ({ ...d, longitude: e.target.value }))}
                    className="rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm"
                    placeholder="14.4378"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Okruh (km)</span>
                  <input
                    type="number"
                    min={1}
                    max={80}
                    value={campaignDraft.radiusKm}
                    onChange={(e) =>
                      setCampaignDraft((d) => ({ ...d, radiusKm: Number(e.target.value) || 1 }))
                    }
                    className="rounded-lg border border-zinc-300 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Denní rozpočet (Kč)</span>
                  <input
                    type="number"
                    min={50}
                    value={campaignDraft.budgetDaily}
                    onChange={(e) =>
                      setCampaignDraft((d) => ({
                        ...d,
                        budgetDaily: Number(e.target.value) || 50,
                      }))
                    }
                    className="rounded-lg border border-zinc-300 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Datum spuštění</span>
                  <input
                    type="date"
                    value={campaignDraft.startDate}
                    onChange={(e) => setCampaignDraft((d) => ({ ...d, startDate: e.target.value }))}
                    className="rounded-lg border border-zinc-300 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Datum ukončení</span>
                  <input
                    type="date"
                    value={campaignDraft.endDate}
                    onChange={(e) => setCampaignDraft((d) => ({ ...d, endDate: e.target.value }))}
                    className="rounded-lg border border-zinc-300 px-3 py-2"
                  />
                </label>
              </div>

              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                <MetaCampaignCreativeEditor
                  token={token}
                  draft={{
                    creativeType: campaignDraft.creativeType,
                    creativePayload: campaignDraft.creativePayload,
                    selectedProductIds: campaignDraft.selectedProductIds,
                  }}
                  products={campaignProducts}
                  onChange={(patch) =>
                    setCampaignDraft((d) => ({
                      ...d,
                      ...patch,
                      creativePayload: patch.creativePayload ?? d.creativePayload,
                    }))
                  }
                />
                <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4">
                  <h3 className="mb-3 text-sm font-bold text-zinc-800">Živý náhled reklamy</h3>
                  <MetaCampaignPlacementPreview
                    creativeType={campaignDraft.creativeType}
                    payload={campaignDraft.creativePayload}
                    selectedProducts={selectedCampaignProducts}
                    pageName={dash?.settings.pageName ?? 'XXREALIT'}
                    budgetDaily={campaignDraft.budgetDaily}
                    cityLabel={campaignDraft.cityName || campaignDraft.locationLabel}
                  />
                </div>
              </div>

              {campaignLaunchBlockers.length > 0 ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  <p className="font-medium">Spuštění zatím není možné:</p>
                  <ul className="mt-1 list-disc pl-5">
                    {campaignLaunchBlockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !campaignDraft.name.trim()}
                  onClick={() => void submitCampaign('draft')}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50"
                >
                  {editingCampaignId ? 'Uložit změny' : 'Uložit koncept'}
                </button>
                <button
                  type="button"
                  disabled={busy || !canLaunchCampaign || !campaignsLiveEnabled}
                  onClick={() => void submitCampaign('launch')}
                  className="rounded-lg bg-[#1877f2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#166fe5] disabled:opacity-50"
                  title={
                    !campaignsLiveEnabled
                      ? 'Zapněte ostré spuštění v Nastavení'
                      : undefined
                  }
                >
                  Spustit kampaň
                </button>
              </div>
              {!campaignsLiveEnabled ? (
                <p className="mt-2 text-xs text-amber-800">
                  Ostré spuštění je vypnuté — tlačítko „Spustit kampaň“ je dostupné po zapnutí v Nastavení.
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-lg font-bold">Uložené koncepty a kampaně</h2>
              {!campaignDrafts.length ? (
                <p className="text-sm text-zinc-500">Zatím žádné uložené kampaně.</p>
              ) : (
                <ul className="space-y-2">
                  {campaignDrafts.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-xl border border-zinc-200 px-4 py-3 text-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        {(() => {
                          const thumb = getCreativePreviewImage(
                            (c.creativePayload as Record<string, unknown>) ?? {},
                          );
                          return thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumb}
                              alt=""
                              className="h-14 w-14 shrink-0 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-[10px] text-zinc-400">
                              Ad
                            </div>
                          );
                        })()}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{c.name}</p>
                          <p className="text-xs text-zinc-500">
                            {CAMPAIGN_GOAL_LABELS[c.objective] ?? c.objective} ·{' '}
                            {c.cityName ?? '—'} · {c.dailyBudgetCzk ?? '—'} Kč/den ·{' '}
                            {c.selectedProductIds.length} produktů
                          </p>
                          {c.metaCampaignId ? (
                            <p className="mt-1 font-mono text-[10px] text-zinc-500">
                              Meta Campaign: {c.metaCampaignId}
                              {c.metaAdSetId ? ` · Ad Set: ${c.metaAdSetId}` : ''}
                            </p>
                          ) : null}
                          {c.errorMessage ? (
                            <p className="mt-1 text-xs text-red-700">{c.errorMessage}</p>
                          ) : null}
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            c.status === 'active'
                              ? 'bg-emerald-100 text-emerald-900'
                              : c.status === 'error'
                                ? 'bg-red-100 text-red-900'
                                : 'bg-zinc-100 text-zinc-700'
                          }`}
                        >
                          {CAMPAIGN_STATUS_LABELS[c.status] ?? c.status}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] text-zinc-400">
                        Aktualizováno: {new Date(c.updatedAt).toLocaleString('cs-CZ')}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setPreviewCampaign(c)}
                          className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-50"
                        >
                          Náhled
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => loadCampaignForEdit(c)}
                          className="rounded-lg border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-50"
                        >
                          Upravit
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            if (!token || !window.confirm(`Smazat koncept „${c.name}"?`)) return;
                            setBusy(true);
                            const r = await nestAdminMetaCenterDeleteCampaignDraft(token, c.id);
                            setBusy(false);
                            if (r.ok) {
                              if (editingCampaignId === c.id) resetCampaignForm();
                              setMsg('Koncept smazán.');
                              void refresh();
                            } else {
                              setMsg(r.message ?? 'Smazání selhalo.');
                            }
                          }}
                          className="rounded-lg border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          Smazat
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

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
            <MetaCampaignPreviewModal
              open={previewCampaign != null}
              onClose={() => setPreviewCampaign(null)}
              creativeType={previewCampaign?.creativeType ?? 'catalog_products'}
              payload={(previewCampaign?.creativePayload as Record<string, unknown>) ?? {}}
              selectedProducts={
                previewCampaign
                  ? campaignProducts.filter((p) =>
                      previewCampaign.selectedProductIds.includes(p.id),
                    )
                  : []
              }
              pageName={dash?.settings.pageName ?? 'XXREALIT'}
              budgetDaily={previewCampaign?.dailyBudgetCzk ?? undefined}
              cityLabel={previewCampaign?.cityName ?? undefined}
            />
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
