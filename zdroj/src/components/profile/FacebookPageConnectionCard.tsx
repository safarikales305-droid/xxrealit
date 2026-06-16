'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
const SOCIAL_TAB_PATH = '/profil/dashboard?tab=social-integrations';
const PAGE_PICKER_MSG = 'Vyberte Facebook stránku, kterou chcete propojit s XXRealit.';
const NOT_CONFIGURED_MSG = 'Propojení Facebook stránky není nakonfigurováno administrátorem.';

type Props = {
  token: string | null;
};

export function FacebookPageConnectionCard({ token }: Props) {
  const router = useRouter();
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
  const [showPagePicker, setShowPagePicker] = useState(false);

  const integrationConfigured = configStatus?.pagesConfigured ?? false;

  const refresh = useCallback(async () => {
    const cfg = await nestFacebookConfigStatus();
    setConfigStatus(cfg);

    if (!token) {
      setStatus(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    const s = await nestFacebookPageStatus(token);
    setStatus(s);
    setLoading(false);
    return s;
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadPagePicker = useCallback(async () => {
    if (!token) return false;
    console.log('[FacebookPageConnectionCard] loading page picker');
    setPagesLoading(true);
    setError(null);
    const result = await nestFacebookPageListPages(token);
    setPagesLoading(false);
    if (!result.ok) {
      console.warn('[FacebookPageConnectionCard] page picker failed', result.error);
      if (result.permissionDenied || isFacebookPageScopeError(result.error)) {
        setError(FACEBOOK_PAGES_LIST_PERMISSION_MSG);
      } else {
        setError(result.error || 'Nepodařilo se načíst Facebook stránky.');
      }
      setShowPagePicker(false);
      return false;
    }
    console.log(
      '[FacebookPageConnectionCard] pages found',
      result.pages.length,
      result.pages.map((p) => p.id),
    );
    if (!result.pages.length) {
      setError('Nenašli jsme žádnou Facebook stránku, kterou spravujete.');
      setShowPagePicker(false);
      return false;
    }
    setPages(result.pages);
    setShowPagePicker(true);
    setError(null);
    return true;
  }, [token]);

  useEffect(() => {
    if (!token || !integrationConfigured || loading) return;

    const facebookParam = params.get('facebook');

    if (facebookParam === 'select') {
      console.log('[FacebookPageConnectionCard] OAuth callback: page selection required');
      setOk(PAGE_PICKER_MSG);
      void loadPagePicker();
      return;
    }

    const shouldPick =
      facebookParam === 'connected' ||
      status?.pendingPageSelection ||
      status?.needsPageSelection;

    if (shouldPick && !status?.connected) {
      void loadPagePicker();
    }
  }, [params, token, status, loadPagePicker, integrationConfigured, loading]);

  useEffect(() => {
    const pageParam = params.get('facebookPage');
    if (pageParam === 'scopes_unavailable' || pageParam === 'review_required') {
      setError(FACEBOOK_PAGE_SCOPES_NOT_AVAILABLE_MSG);
      return;
    }
    if (params.get('facebook') === 'page_connected') {
      const pageName = params.get('pageName');
      console.log('[FacebookPageConnectionCard] OAuth callback: page connected', {
        pageName: pageName ? decodeURIComponent(pageName) : null,
      });
      setShowPagePicker(false);
      setPages([]);
      setOk(
        pageName
          ? `Propojena stránka: ${decodeURIComponent(pageName)}`
          : 'Facebook stránka byla úspěšně propojena.',
      );
      void refresh();
      router.replace(SOCIAL_TAB_PATH);
      return;
    }
    if (params.get('facebook') !== 'error') return;
    const reason = params.get('reason');
    console.warn('[FacebookPageConnectionCard] OAuth callback error', reason);
    if (reason === 'not_configured') {
      setError(NOT_CONFIGURED_MSG);
      return;
    }
    if (isFacebookPageScopeError(reason)) {
      setError(FACEBOOK_PAGES_LIST_PERMISSION_MSG);
      return;
    }
    setError('Propojení Facebooku se nezdařilo. Zkuste to znovu.');
  }, [params, refresh, router]);

  function startOAuth(reselect: boolean) {
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

    if (reselect) {
      setStatus(null);
      setPages([]);
      setShowPagePicker(false);
    }

    const url = reselect ? `${FACEBOOK_CONNECT_PATH}?reselect=1` : FACEBOOK_CONNECT_PATH;
    console.log('[FacebookPageConnectionCard] OAuth start', { reselect, url });

    try {
      window.location.assign(url);
    } catch (err) {
      console.error('[FacebookPageConnectionCard] connect redirect failed', err);
      setBusy(false);
      setError('Nepodařilo se spustit přihlášení přes Facebook.');
    }
  }

  function handleConnectAccount() {
    startOAuth(false);
  }

  async function handleSelectPage(pageId: string) {
    if (!token) return;
    const selected = pages.find((p) => p.id === pageId);
    console.log('[FacebookPageConnectionCard] page selected', {
      pageId,
      pageName: selected?.name ?? null,
    });
    setBusy(true);
    setError(null);
    const res = await nestFacebookPageSelectPage(token, pageId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Výběr stránky selhal.');
      return;
    }
    setShowPagePicker(false);
    setPages([]);
    setOk(res.message ?? 'Facebook stránka byla propojena.');
    router.replace(SOCIAL_TAB_PATH);
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
    setError(null);
    setOk(null);
    const res = await nestFacebookPageDisconnectPage(token);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Odpojení stránky selhalo.');
      return;
    }
    setStatus(null);
    setPages([]);
    setShowPagePicker(false);
    router.replace(SOCIAL_TAB_PATH);
    await refresh();
    setOk('Facebook stránka byla odpojena. Můžete propojit jinou stránku.');
  }

  function handleChangePage() {
    startOAuth(true);
  }

  if (!token) return null;

  const connected = Boolean(status?.connected) && !showPagePicker;

  return (
    <div className="relative z-0 space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-base font-semibold text-zinc-900">Facebook stránka</p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          Propojte svou Facebook stránku přes bezpečné Meta API. Nové příspěvky se budou automaticky
          zobrazovat na vašem profilu i ve veřejném feedu XXRealit.
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
                <li>V Meta for Developers vytvořte aplikaci a získejte App ID a App Secret.</li>
                <li>
                  Nastavte OAuth Redirect URI v{' '}
                  <Link
                    href="/admin/integrace/facebook"
                    className="font-semibold text-[#1877F2] underline"
                  >
                    Administrace → Integrace → Facebook
                  </Link>
                  .
                </li>
              </ol>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}
      {status?.tokenNeedsReauth ? (
        <p className="text-sm text-amber-800">Facebook propojení vyžaduje nové přihlášení.</p>
      ) : null}

      {!loading && integrationConfigured && !connected && !showPagePicker ? (
        <button
          type="button"
          disabled={busy}
          className="relative z-10 w-full rounded-xl bg-[#1877F2] px-6 py-3.5 text-base font-semibold text-white transition hover:bg-[#166fe0] disabled:cursor-wait disabled:opacity-70 sm:w-auto"
          onClick={handleConnectAccount}
        >
          {busy ? 'Přesměrovávám na Facebook…' : 'Propojit Facebook stránku'}
        </button>
      ) : null}

      {showPagePicker && pages.length > 0 ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="facebook-page-picker-title"
        >
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <p id="facebook-page-picker-title" className="text-base font-semibold text-zinc-900">
              {PAGE_PICKER_MSG}
            </p>
            {pagesLoading ? (
              <p className="mt-3 text-sm text-zinc-600">Načítám vaše Facebook stránky…</p>
            ) : null}
            <div className="mt-4 flex flex-col gap-2">
              {pages.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3"
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
                    className="shrink-0 rounded-full bg-[#1877F2] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#166fe0] disabled:opacity-50"
                    onClick={() => void handleSelectPage(p.id)}
                  >
                    Propojit
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={busy}
              className="mt-4 w-full rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50"
              onClick={() => {
                setShowPagePicker(false);
                setPages([]);
                router.replace(SOCIAL_TAB_PATH);
                void refresh();
              }}
            >
              Zrušit
            </button>
          </div>
        </div>
      ) : null}

      {!loading && connected ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {status?.pagePictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={status.pagePictureUrl}
                alt=""
                className="h-12 w-12 rounded-full border border-zinc-200 object-cover"
              />
            ) : null}
            <div>
              <p className="text-sm font-semibold text-zinc-900">{status?.pageName}</p>
              {status?.lastSyncAt ? (
                <p className="text-xs text-zinc-500">
                  Poslední synchronizace:{' '}
                  {new Date(status.lastSyncAt).toLocaleString('cs-CZ')}
                </p>
              ) : (
                <p className="text-xs text-zinc-500">Zatím neproběhla synchronizace</p>
              )}
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-zinc-800">
            <input
              type="checkbox"
              checked={Boolean(status?.syncEnabled)}
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
            Automatická synchronizace nových příspěvků
          </label>

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
