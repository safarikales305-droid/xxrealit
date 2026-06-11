'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  nestFacebookPageConnectUrl,
  nestFacebookPageDisconnect,
  nestFacebookPageListPages,
  nestFacebookPageSelectPage,
  nestFacebookPageSetSyncEnabled,
  nestFacebookPageStatus,
  nestFacebookPageSyncNow,
  type FacebookPageOption,
  type FacebookPageStatus,
} from '@/lib/nest-client';

type Props = {
  token: string | null;
};

export function FacebookPageConnectionCard({ token }: Props) {
  const params = useSearchParams();
  const [status, setStatus] = useState<FacebookPageStatus | null>(null);
  const [pages, setPages] = useState<FacebookPageOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [selectingPage, setSelectingPage] = useState(false);

  const refresh = useCallback(async () => {
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
    if (!token) return;
    if (params.get('facebook') === 'select' || status?.pendingPageSelection) {
      void loadPagePicker();
    }
  }, [params, token, status?.pendingPageSelection, loadPagePicker]);

  useEffect(() => {
    if (params.get('facebook') === 'error') {
      setError('Propojení Facebooku se nezdařilo. Zkuste to znovu.');
    }
  }, [params]);

  async function handleConnect() {
    if (!token) return;
    setBusy(true);
    setError(null);
    setOk(null);
    const url = await nestFacebookPageConnectUrl(token);
    setBusy(false);
    if (!url) {
      setError('Nepodařilo se spustit přihlášení přes Facebook.');
      return;
    }
    window.location.href = url;
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
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
      <div>
        <p className="text-sm font-semibold text-zinc-900">Facebook propojení</p>
        <p className="mt-1 text-sm text-zinc-600">
          Propojte svou Facebook stránku a nové příspěvky se budou automaticky zobrazovat i na
          xxrealit.
        </p>
      </div>

      {loading ? <p className="text-sm text-zinc-500">Načítám stav propojení…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}
      {status?.tokenNeedsReauth ? (
        <p className="text-sm text-amber-800">Facebook propojení vyžaduje nové přihlášení.</p>
      ) : null}

      {!loading && !status?.connected && !selectingPage ? (
        <button
          type="button"
          disabled={busy || !status?.configured}
          className="rounded-full bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          onClick={() => void handleConnect()}
        >
          {busy ? 'Přesměrovávám…' : 'Propojit Facebook stránku'}
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
