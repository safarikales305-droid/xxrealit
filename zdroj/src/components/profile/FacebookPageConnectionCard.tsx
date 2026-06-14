'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  FACEBOOK_PAGES_LIST_PERMISSION_MSG,
  FACEBOOK_PAGE_SCOPES_NOT_AVAILABLE_MSG,
  isFacebookPageScopeError,
} from '@/lib/facebook-page-scope';
import {
  nestFacebookConfigStatus,
  nestFacebookPageDisconnect,
  nestFacebookPageDisconnectPage,
  nestFacebookPageListPages,
  nestFacebookPageSelectPage,
  nestFacebookPageSetSyncEnabled,
  nestFacebookPageStatus,
  nestFacebookPageSyncNow,
  type FacebookConfigStatus,
  type FacebookPageOption,
  type FacebookPageStatus,
} from '@/lib/nest-client';

const FACEBOOK_CONNECT_PATH = '/api/social/facebook/connect';
const NOT_CONFIGURED_MSG = 'Propojení Facebook stránky není nakonfigurováno administrátorem.';

type Props = {
  token: string | null;
};

export function FacebookPageConnectionCard({ token }: Props) {
  const { user } = useAuth();
  const params = useSearchParams();
  const [configStatus, setConfigStatus] = useState<FacebookConfigStatus | null>(null);
  const [status, setStatus] = useState<FacebookPageStatus | null>(null);
  const [pages, setPages] = useState<FacebookPageOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [selectingPage, setSelectingPage] = useState(false);
  const [changingPage, setChangingPage] = useState(false);

  const integrationConfigured = configStatus?.pagesConfigured ?? false;

  const refresh = useCallback(async () => {
    const cfg = await nestFacebookConfigStatus();
    setConfigStatus(cfg);

    if (!token) {
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const s = await nestFacebookPageStatus(token);
    setStatus(s);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadPagePicker = useCallback(async () => {
    if (!token) return;
    setPagesLoading(true);
    setSelectingPage(true);
    setError(null);
    const result = await nestFacebookPageListPages(token);
    setPagesLoading(false);
    if (!result.ok) {
      setSelectingPage(false);
      if (result.permissionDenied || isFacebookPageScopeError(result.error)) {
        setError(FACEBOOK_PAGES_LIST_PERMISSION_MSG);
        return;
      }
      setError(result.error || 'Nepodařilo se načíst Facebook stránky.');
      return;
    }
    if (!result.pages.length) {
      setSelectingPage(false);
      setError('Nenašli jsme žádnou Facebook stránku, kterou spravujete.');
      return;
    }
    setPages(result.pages);
    setError(null);
  }, [token]);

  useEffect(() => {
    if (!token || !integrationConfigured || !status) return;
    if (status.connected && !changingPage) return;
    const shouldLoad =
      params.get('facebook') === 'select' ||
      params.get('facebook') === 'connected' ||
      status.pendingPageSelection ||
      status.needsPageSelection ||
      changingPage;
    if (shouldLoad && status.accountConnected) {
      void loadPagePicker();
    }
  }, [
    params,
    token,
    status,
    loadPagePicker,
    integrationConfigured,
    changingPage,
  ]);

  useEffect(() => {
    const pageParam = params.get('facebookPage');
    if (pageParam === 'scopes_unavailable' || pageParam === 'review_required') {
      setError(FACEBOOK_PAGE_SCOPES_NOT_AVAILABLE_MSG);
      return;
    }
    if (params.get('facebook') === 'page_connected') {
      const pageName = params.get('pageName');
      setOk(
        pageName
          ? `Synchronizována stránka: ${decodeURIComponent(pageName)}`
          : status?.pageName
            ? `Synchronizována stránka: ${status.pageName}`
            : 'Facebook stránka byla úspěšně propojena.',
      );
      setChangingPage(false);
      void refresh();
      return;
    }
    if (params.get('facebook') === 'connected') {
      setOk('Facebook účet byl úspěšně propojen. Vyberte stránku pro synchronizaci příspěvků.');
      return;
    }
    if (params.get('facebook') === 'select') {
      setOk('Vyberte Facebook stránku, kterou chcete propojit.');
      return;
    }
    if (params.get('facebook') !== 'error') return;
    const reason = params.get('reason');
    if (reason === 'not_configured') {
      setError(NOT_CONFIGURED_MSG);
      return;
    }
    if (isFacebookPageScopeError(reason)) {
      setError(FACEBOOK_PAGES_LIST_PERMISSION_MSG);
      return;
    }
    setError('Propojení Facebooku se nezdařilo. Zkuste to znovu.');
  }, [params, refresh, status?.pageName]);

  function handleConnectAccount() {
    if (!token) {
      setError('Pro propojení se přihlaste.');
      return;
    }
    if (!integrationConfigured) {
      setError(NOT_CONFIGURED_MSG);
      return;
    }

    setBusy(true);
    setError(null);
    setOk(null);

    try {
      window.location.assign(FACEBOOK_CONNECT_PATH);
    } catch (err) {
      console.error('[FacebookPageConnectionCard] connect redirect failed', err);
      setBusy(false);
      setError('Nepodařilo se spustit přihlášení přes Facebook.');
    }
  }

  async function handleSelectPage(pageId: string) {
    if (!token) return;
    setBusy(true);
    setError(null);
    const res = await nestFacebookPageSelectPage(token, pageId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Výběr stránky selhal.');
      return;
    }
    setSelectingPage(false);
    setChangingPage(false);
    setPages([]);
    setOk(res.message ?? `Synchronizována stránka: ${status?.pageName ?? 'Facebook stránka'}`);
    void refresh();
  }

  async function handleSyncNow() {
    if (!token) return;
    setBusy(true);
    setError(null);
    const res = await nestFacebookPageSyncNow(token);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Synchronizace selhala.');
      return;
    }
    setOk(`Synchronizace dokončena (importováno: ${res.imported ?? 0} příspěvků).`);
    void refresh();
  }

  async function handleDisconnectPage() {
    if (!token || !window.confirm('Odpojit Facebook stránku?')) return;
    setBusy(true);
    const res = await nestFacebookPageDisconnectPage(token);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Odpojení stránky selhalo.');
      return;
    }
    setOk('Facebook stránka byla odpojena.');
    setSelectingPage(false);
    setChangingPage(false);
    setPages([]);
    void refresh();
  }

  async function handleDisconnectAccount() {
    if (!token || !window.confirm('Odpojit Facebook účet i stránku?')) return;
    setBusy(true);
    const res = await nestFacebookPageDisconnect(token);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Odpojení selhalo.');
      return;
    }
    setOk('Facebook účet byl odpojen.');
    setSelectingPage(false);
    setChangingPage(false);
    setPages([]);
    void refresh();
  }

  function handleChangePage() {
    setChangingPage(true);
    setOk('Vyberte jinou Facebook stránku.');
    setError(null);
    void loadPagePicker();
  }

  if (!token) return null;

  const showPagePicker =
    selectingPage &&
    pages.length > 0 &&
    (changingPage || !status?.connected || status?.needsPageSelection);

  return (
    <div className="relative z-0 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
      <div>
        <p className="text-sm font-semibold text-zinc-900">Facebook propojení</p>
        <p className="mt-1 text-sm text-zinc-600">
          Propojte svou Facebook stránku a nové příspěvky se budou automaticky zobrazovat i na
          xxrealit.
        </p>
      </div>

      {loading ? <p className="text-sm text-zinc-500">Načítám stav propojení…</p> : null}
      {!loading && !integrationConfigured ? (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/80 p-3">
          <p className="text-sm text-amber-900">{NOT_CONFIGURED_MSG}</p>
          {user?.role === 'ADMIN' ? (
            <div className="text-sm text-amber-900">
              <p className="font-medium">Instrukce pro administrátora:</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5">
                <li>
                  V Meta for Developers vytvořte aplikaci a získejte App ID a App Secret.
                </li>
                <li>
                  Nastavte OAuth Redirect URI podle hodnoty v{' '}
                  <Link
                    href="/admin/integrace/facebook"
                    className="font-semibold text-[#1877F2] underline"
                  >
                    Administrace → Integrace → Facebook
                  </Link>
                  .
                </li>
                <li>
                  Doplňte proměnné v Railway (backend) — viz{' '}
                  <code className="rounded bg-amber-100 px-1 text-xs">ADMIN_SETUP_FACEBOOK.md</code>.
                </li>
              </ol>
              {configStatus?.pagesMissing?.length ? (
                <p className="mt-2 text-xs">
                  Chybí: {configStatus.pagesMissing.join(', ')}
                </p>
              ) : configStatus?.missing?.length ? (
                <p className="mt-2 text-xs">
                  Chybí (login): {configStatus.missing.join(', ')}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {error && !showPagePicker && !(status?.accountConnected && !status?.connected) ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : null}
      {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}
      {status?.tokenNeedsReauth ? (
        <p className="text-sm text-amber-800">Facebook propojení vyžaduje nové přihlášení.</p>
      ) : null}

      {!loading && integrationConfigured && !status?.connected && !status?.accountConnected && !selectingPage ? (
        <button
          type="button"
          disabled={busy}
          className="relative z-10 rounded-full bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#166fe0] disabled:cursor-wait disabled:opacity-70"
          onClick={handleConnectAccount}
        >
          {busy ? 'Přesměrovávám na Facebook…' : 'Propojit Facebook stránku'}
        </button>
      ) : null}

      {!loading && status?.accountConnected && !status?.connected && !showPagePicker ? (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/80 p-3">
          <p className="text-sm text-emerald-900">Facebook účet je propojen.</p>
          {pagesLoading ? (
            <p className="text-sm text-zinc-600">Načítám vaše Facebook stránky…</p>
          ) : null}
          {!pagesLoading && pages.length === 0 && error ? (
            <p className="text-sm text-amber-900">{error}</p>
          ) : null}
          {!pagesLoading && pages.length === 0 && !error ? (
            <button
              type="button"
              disabled={busy}
              className="relative z-10 rounded-full bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#166fe0] disabled:cursor-wait disabled:opacity-70"
              onClick={() => void loadPagePicker()}
            >
              Načíst Facebook stránky
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
            onClick={() => void handleDisconnectAccount()}
          >
            Odpojit Facebook účet
          </button>
        </div>
      ) : null}

      {showPagePicker ? (
        <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
          <p className="text-sm font-semibold text-zinc-900">Vyberte Facebook stránku</p>
          <div className="flex flex-col gap-2">
            {pages.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3"
              >
                {p.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.picture}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-full border border-zinc-200 object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1877F2]/10 text-sm font-bold text-[#1877F2]">
                    {p.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-900">{p.name}</p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  className="shrink-0 rounded-full bg-[#1877F2] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#166fe0] disabled:opacity-50"
                  onClick={() => void handleSelectPage(p.id)}
                >
                  Propojit tuto stránku
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!loading && status?.connected && !showPagePicker ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {status.pagePictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={status.pagePictureUrl}
                alt=""
                className="h-12 w-12 rounded-full border border-zinc-200 object-cover"
              />
            ) : null}
            <p className="text-sm text-zinc-800">
              Synchronizována stránka: <span className="font-semibold">{status.pageName}</span>
            </p>
          </div>
          <p className="text-sm text-emerald-800">
            Hotovo. Nové příspěvky z vaší Facebook stránky budeme automaticky přidávat i na
            xxrealit.
          </p>
          <label className="inline-flex items-center gap-2 text-sm text-zinc-800">
            <input
              type="checkbox"
              checked={Boolean(status.syncEnabled)}
              disabled={busy}
              onChange={(e) => {
                if (!token) return;
                setBusy(true);
                void nestFacebookPageSetSyncEnabled(token, e.target.checked).then((res) => {
                  setBusy(false);
                  if (!res.ok) {
                    setError(res.error ?? 'Změna synchronizace selhala.');
                    return;
                  }
                  void refresh();
                });
              }}
            />
            Automaticky přidávat nové FB příspěvky
          </label>
          {status.lastSyncAt ? (
            <p className="text-xs text-zinc-500">
              Poslední synchronizace: {new Date(status.lastSyncAt).toLocaleString('cs-CZ')}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-50"
              onClick={() => void handleSyncNow()}
            >
              Synchronizovat příspěvky
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-50"
              onClick={handleChangePage}
            >
              Změnit stránku
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
              onClick={() => void handleDisconnectPage()}
            >
              Odpojit Facebook stránku
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
