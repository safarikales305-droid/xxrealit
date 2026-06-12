'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  nestFacebookConfigStatus,
  nestFacebookPageDisconnect,
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
const NOT_CONFIGURED_MSG = 'Facebook propojení není nakonfigurováno administrátorem.';

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [selectingPage, setSelectingPage] = useState(false);

  const integrationConfigured = configStatus?.configured ?? false;

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
    setSelectingPage(true);
    setError(null);
    const list = await nestFacebookPageListPages(token);
    if (!list?.length) {
      setError('Nenašli jsme žádnou Facebook stránku, kterou spravujete.');
      setSelectingPage(false);
      return;
    }
    setPages(list);
  }, [token]);

  useEffect(() => {
    if (!token || !integrationConfigured) return;
    if (params.get('facebook') === 'select' || status?.pendingPageSelection) {
      void loadPagePicker();
    }
  }, [params, token, status?.pendingPageSelection, loadPagePicker, integrationConfigured]);

  useEffect(() => {
    if (params.get('facebook') !== 'error') return;
    const reason = params.get('reason');
    if (reason === 'not_configured') {
      setError(NOT_CONFIGURED_MSG);
      return;
    }
    setError('Propojení Facebooku se nezdařilo. Zkuste to znovu.');
  }, [params]);

  function handleConnect() {
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
    setOk(res.message ?? 'Facebook stránka byla propojena.');
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
    setOk(`Synchronizace dokončena (importováno: ${res.imported ?? 0}).`);
    void refresh();
  }

  async function handleDisconnect() {
    if (!token || !window.confirm('Odpojit Facebook stránku?')) return;
    setBusy(true);
    const res = await nestFacebookPageDisconnect(token);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Odpojení selhalo.');
      return;
    }
    setOk('Facebook stránka byla odpojena.');
    setSelectingPage(false);
    void refresh();
  }

  if (!token) return null;

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
              {configStatus?.missing?.length ? (
                <p className="mt-2 text-xs">
                  Chybí: {configStatus.missing.join(', ')}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}
      {status?.tokenNeedsReauth ? (
        <p className="text-sm text-amber-800">Facebook propojení vyžaduje nové přihlášení.</p>
      ) : null}

      {!loading && integrationConfigured && !status?.connected && !selectingPage ? (
        <button
          type="button"
          disabled={busy}
          className="relative z-10 rounded-full bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#166fe0] disabled:cursor-wait disabled:opacity-70"
          onClick={handleConnect}
        >
          {busy ? 'Přesměrovávám na Facebook…' : 'Propojit Facebook stránku'}
        </button>
      ) : null}

      {selectingPage && pages.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-zinc-800">Vyberte Facebook stránku:</p>
          <div className="flex flex-col gap-2">
            {pages.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm font-semibold text-zinc-900 transition hover:border-[#1877F2]/40 hover:bg-blue-50/50 disabled:opacity-50"
                onClick={() => void handleSelectPage(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {!loading && status?.connected ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-800">
            Propojená stránka: <span className="font-semibold">{status.pageName}</span>
          </p>
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
              Synchronizovat teď
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
              onClick={() => void handleDisconnect()}
            >
              Odpojit Facebook
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
