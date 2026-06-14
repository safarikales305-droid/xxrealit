'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestFacebookAdminStats,
  nestFacebookConfigStatus,
  nestAdminFacebookUrlImports,
  nestAdminFacebookUrlImportSetEnabled,
  nestAdminFacebookUrlImportSync,
  type AdminFacebookUrlImportsResponse,
  type FacebookAdminStats,
  type FacebookConfigStatus,
} from '@/lib/nest-client';

export default function AdminFacebookIntegrationPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const [config, setConfig] = useState<FacebookConfigStatus | null>(null);
  const [stats, setStats] = useState<FacebookAdminStats | null>(null);
  const [urlImports, setUrlImports] = useState<AdminFacebookUrlImportsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    setRefreshing(true);
    const data = await nestFacebookConfigStatus();
    const adminStats = await nestFacebookAdminStats();
    const imports =
      user?.role === 'ADMIN' && apiAccessToken
        ? await nestAdminFacebookUrlImports(apiAccessToken)
        : null;
    setRefreshing(false);
    if (!data) {
      setLoadError('Nepodařilo se načíst stav Facebook integrace.');
      setConfig(null);
      return;
    }
    setConfig(data);
    setStats(adminStats);
    setUrlImports(imports);
  }, [user?.role, apiAccessToken]);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    if (user?.role === 'ADMIN') void refresh();
  }, [user?.role, refresh]);

  if (isLoading) {
    return <div className="min-h-[40vh] bg-zinc-50" />;
  }

  const loginConfigured = config?.configured ?? false;
  const pagesConfigured = config?.pagesConfigured ?? false;

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Integrace
            </p>
            <h1 className="text-xl font-bold text-zinc-900">Facebook</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Konfigurace Meta aplikace pro propojení Facebook stránek profesionálů.
            </p>
          </div>
          <Link
            href="/admin"
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700"
          >
            ← Administrace
          </Link>
        </div>

        {loadError ? <p className="mb-3 text-sm text-red-600">{loadError}</p> : null}

        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Facebook Pages API (propojení stránek)
            </p>
            <p
              className={`mt-2 text-lg font-bold ${pagesConfigured ? 'text-emerald-700' : 'text-amber-700'}`}
            >
              {pagesConfigured ? 'Nakonfigurováno' : 'Není nakonfigurováno'}
            </p>
            {!pagesConfigured && config?.pagesMissing?.length ? (
              <div className="mt-3">
                <p className="text-sm font-medium text-zinc-800">Chybějící povinné proměnné:</p>
                <ul className="mt-1 list-disc pl-5 text-sm text-zinc-700">
                  {config.pagesMissing.map((key) => (
                    <li key={key}>
                      <code className="rounded bg-zinc-100 px-1 text-xs">{key}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {config?.pagesAppId ? (
              <p className="mt-2 text-sm text-zinc-600">
                Pages App ID: <code className="rounded bg-zinc-100 px-1 text-xs">{config.pagesAppId}</code>
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Facebook Login (registrace / přihlášení)
            </p>
            <p
              className={`mt-2 text-lg font-bold ${loginConfigured ? 'text-emerald-700' : 'text-amber-700'}`}
            >
              {loginConfigured ? 'Nakonfigurováno' : 'Není nakonfigurováno'}
            </p>
            {!loginConfigured && config?.missing?.length ? (
              <div className="mt-3">
                <p className="text-sm font-medium text-zinc-800">Chybějící povinné proměnné:</p>
                <ul className="mt-1 list-disc pl-5 text-sm text-zinc-700">
                  {config.missing.map((key) => (
                    <li key={key}>
                      <code className="rounded bg-zinc-100 px-1 text-xs">{key}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {config?.envChecks?.length ? (
              <div className="mt-4">
                <p className="text-sm font-medium text-zinc-800">Kontrola env proměnných (runtime):</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {config.envChecks.map((row) => (
                    <li key={row.key} className="flex flex-wrap items-center gap-2">
                      <code className="rounded bg-zinc-100 px-1 text-xs">{row.key}</code>
                      <span
                        className={
                          row.present
                            ? 'font-semibold text-emerald-700'
                            : 'font-semibold text-amber-800'
                        }
                      >
                        {row.present ? 'OK' : 'chybí'}
                      </span>
                      {!row.required ? (
                        <span className="text-xs text-zinc-500">(doporučeno)</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {config?.recommendedMissing?.length ? (
              <div className="mt-3">
                <p className="text-sm font-medium text-zinc-800">Doporučené proměnné:</p>
                <ul className="mt-1 list-disc pl-5 text-sm text-zinc-600">
                  {config.recommendedMissing.map((key) => (
                    <li key={key}>
                      <code className="rounded bg-zinc-100 px-1 text-xs">{key}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Statistiky integrace
            </p>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-zinc-500">Propojené účty</dt>
                <dd className="text-lg font-bold text-zinc-900">{stats?.connectedAccounts ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Propojené stránky</dt>
                <dd className="text-lg font-bold text-zinc-900">{stats?.connectedPages ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Synchronizované příspěvky</dt>
                <dd className="text-lg font-bold text-zinc-900">{stats?.syncedPosts ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Poslední synchronizace</dt>
                <dd className="font-medium text-zinc-800">
                  {stats?.lastSyncAt
                    ? new Date(stats.lastSyncAt).toLocaleString('cs-CZ')
                    : '—'}
                </dd>
              </div>
            </dl>
            {stats?.lastError?.message ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                Poslední chyba ({stats.lastError.pageName ?? 'stránka'}): {stats.lastError.message}
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-[#1877F2]/30 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Import z Facebook URL (bez Meta API)
            </p>
            <p className="mt-2 text-sm text-zinc-600">
              Profesionálové vkládají veřejnou URL stránky; systém každých 6 hodin importuje až 20
              nových příspěvků.
            </p>
            {urlImports?.profiles?.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                      <th className="py-2 pr-3">Uživatel</th>
                      <th className="py-2 pr-3">URL</th>
                      <th className="py-2 pr-3">Import</th>
                      <th className="py-2 pr-3">Stav</th>
                      <th className="py-2">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {urlImports.profiles.map((row) => (
                      <tr key={row.id} className="border-b border-zinc-100 align-top">
                        <td className="py-2 pr-3">
                          <p className="font-medium text-zinc-900">{row.name ?? row.email}</p>
                          <p className="text-xs text-zinc-500">{row.email}</p>
                        </td>
                        <td className="max-w-[200px] truncate py-2 pr-3 text-xs text-zinc-600">
                          {row.facebookUrl ?? '—'}
                        </td>
                        <td className="py-2 pr-3">
                          {row.facebookImportEnabled ? (
                            <span className="text-emerald-700">Zapnuto</span>
                          ) : (
                            <span className="text-zinc-500">Vypnuto</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-xs">
                          <p>{row.facebookImportStatus}</p>
                          {row.facebookImportError ? (
                            <p className="mt-1 text-red-700">{row.facebookImportError}</p>
                          ) : null}
                        </td>
                        <td className="py-2">
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              disabled={!apiAccessToken || busyUserId === row.id}
                              onClick={() => {
                                if (!apiAccessToken) return;
                                setBusyUserId(row.id);
                                void nestAdminFacebookUrlImportSync(apiAccessToken, row.id).then(
                                  () => {
                                    setBusyUserId(null);
                                    void refresh();
                                  },
                                );
                              }}
                              className="rounded border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-800"
                            >
                              Spustit import
                            </button>
                            <button
                              type="button"
                              disabled={!apiAccessToken || busyUserId === row.id}
                              onClick={() => {
                                if (!apiAccessToken) return;
                                setBusyUserId(row.id);
                                void nestAdminFacebookUrlImportSetEnabled(
                                  apiAccessToken,
                                  row.id,
                                  !row.facebookImportEnabled,
                                ).then(() => {
                                  setBusyUserId(null);
                                  void refresh();
                                });
                              }}
                              className="rounded border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-800"
                            >
                              {row.facebookImportEnabled ? 'Vypnout' : 'Zapnout'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">Zatím žádné URL importy.</p>
            )}
            {urlImports?.recentLogs?.length ? (
              <div className="mt-4">
                <p className="text-sm font-semibold text-zinc-800">Poslední logy</p>
                <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-xs text-zinc-700">
                  {urlImports.recentLogs.slice(0, 20).map((log) => (
                    <li key={log.id} className="rounded border border-zinc-100 bg-zinc-50 px-2 py-1.5">
                      <span className="font-medium">
                        {log.user?.name ?? log.user?.email ?? log.userId}
                      </span>
                      {' — '}
                      {log.status}; důvod {log.detectedReason ?? '—'}; nalezeno{' '}
                      {log.found ?? 0}, importováno {log.importedCount ?? log.imported ?? 0},
                      přeskočeno {log.skippedDuplicates ?? log.skipped ?? 0}
                      {log.fetchUrl ? (
                        <span className="mt-1 block break-all text-zinc-500">
                          fetch: {log.fetchUrl} (HTTP {log.httpStatus ?? '—'},{' '}
                          {log.contentLength ?? 0} B)
                        </span>
                      ) : null}
                      {log.error ? <span className="mt-1 block text-red-700">{log.error}</span> : null}
                      {log.rawSnippet ? (
                        <span className="mt-1 block break-all font-mono text-[10px] text-zinc-400">
                          {log.rawSnippet.slice(0, 200)}…
                        </span>
                      ) : null}
                      <span className="mt-1 block text-zinc-500">
                        {new Date(log.createdAt).toLocaleString('cs-CZ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
              Meta App Review
            </p>
            <p className="mt-2 text-sm text-amber-950">
              Facebook Page sync vyžaduje Meta Review pro{' '}
              <code className="rounded bg-amber-100 px-1 text-xs">pages_show_list</code>,{' '}
              <code className="rounded bg-amber-100 px-1 text-xs">pages_read_engagement</code> a{' '}
              <code className="rounded bg-amber-100 px-1 text-xs">pages_manage_metadata</code>.
            </p>
            <p className="mt-2 text-sm text-amber-900">
              Dokud oprávnění nejsou schválena, propojení stránky funguje jen pro účty přidané jako
              Admin nebo Tester v Meta for Developers. Základní Facebook Login uživatelů běží bez
              pages scope (<code className="rounded bg-amber-100 px-1 text-xs">public_profile</code>
              ).
            </p>
            {config?.pageConnectRequiresReview !== false ? (
              <p className="mt-2 text-xs font-medium text-amber-900">
                Režim čekání na review je aktivní (výchozí). Po schválení nastavte{' '}
                <code className="rounded bg-amber-100 px-1">
                  FACEBOOK_PAGE_CONNECT_REQUIRES_REVIEW=false
                </code>{' '}
                v Railway.
              </p>
            ) : (
              <p className="mt-2 text-xs text-amber-800">
                Režim review je vypnutý — pages scope jsou povoleny pro všechny uživatele.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">URI</p>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="font-medium text-zinc-800">OAuth Redirect URI (login)</dt>
                <dd className="mt-1 break-all font-mono text-xs text-zinc-600">
                  {config?.oauthRedirectUri ?? '— nastavte FRONTEND_URL —'}
                </dd>
                <dd className="mt-1 text-xs text-zinc-500">
                  Odvozeno z <code className="rounded bg-zinc-100 px-1">FRONTEND_URL</code> +{' '}
                  <code className="rounded bg-zinc-100 px-1">/api/social/facebook/callback</code>
                </dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-800">Page Connect Redirect URI</dt>
                <dd className="mt-1 break-all font-mono text-xs text-zinc-600">
                  {config?.pageConnectRedirectUri ?? '— nastavte FRONTEND_URL —'}
                </dd>
                <dd className="mt-1 text-xs text-zinc-500">
                  Odvozeno z <code className="rounded bg-zinc-100 px-1">FRONTEND_URL</code> +{' '}
                  <code className="rounded bg-zinc-100 px-1">/api/social/facebook/page-callback</code>
                </dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-800">Webhook URI</dt>
                <dd className="mt-1 break-all font-mono text-xs text-zinc-600">
                  {config?.webhookUri ??
                    '— nastavte API_PUBLIC_URL a FACEBOOK_WEBHOOK_VERIFY_TOKEN —'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-700">
              Podrobný návod krok za krokem je v souboru{' '}
              <code className="rounded bg-zinc-100 px-1 text-xs">ADMIN_SETUP_FACEBOOK.md</code>{' '}
              v kořeni repozitáře (Meta App, App ID, App Secret, Railway Variables).
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/admin/facebook-propojeni"
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-100"
              >
                Přehled uživatelských propojení →
              </Link>
              <button
                type="button"
                disabled={refreshing}
                onClick={() => void refresh()}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
              >
                {refreshing ? 'Obnovuji…' : 'Obnovit stav'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
