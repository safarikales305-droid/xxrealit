'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { storeFacebookOAuthReturnPath } from '@/lib/facebook-oauth-return';
import { openFacebookOAuthUrl } from '@/lib/pwa-oauth';
import {
  nestAdminFacebookAutopostConnectUrl,
  nestAdminFacebookAutopostListPages,
  nestAdminFacebookAutopostSelectPage,
  type FacebookAutopostSettingsPublic,
} from '@/lib/social-autopost-admin-api';

type PageOption = { id: string; name: string; picture?: string | null };

type Props = {
  token: string;
  fb: FacebookAutopostSettingsPublic;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onSettingsChange: () => void;
  onMessage: (msg: string | null) => void;
};

function formatDt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' })
    : '—';
}

export function AdminFacebookAutopostOAuth({
  token,
  fb,
  busy,
  setBusy,
  onSettingsChange,
  onMessage,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [pages, setPages] = useState<PageOption[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [confirmPage, setConfirmPage] = useState<PageOption | null>(null);

  const preferredPageId = params.get('preferredPageId');

  const loadPicker = useCallback(async () => {
    setPagesLoading(true);
    const r = await nestAdminFacebookAutopostListPages(token);
    setPagesLoading(false);
    if (!r?.ok || !r.pages.length) {
      onMessage(r?.error ?? 'Nepodařilo se načíst Facebook stránky.');
      return;
    }
    setPages(r.pages);
    setShowPicker(true);
    onMessage(null);
  }, [token, onMessage]);

  const confirmSelect = useCallback(
    async (page: PageOption) => {
      setBusy(true);
      const r = await nestAdminFacebookAutopostSelectPage(token, page.id);
      setBusy(false);
      setShowPicker(false);
      setConfirmPage(null);
      if (!r.ok) {
        onMessage(r.error ?? 'Výběr stránky selhal.');
        return;
      }
      onMessage(`✓ Propojeno se stránkou ${r.pageName ?? page.name}`);
      router.replace('/admin/marketing/socialni-site');
      onSettingsChange();
    },
    [token, setBusy, onMessage, onSettingsChange, router],
  );

  useEffect(() => {
    const fbParam = params.get('facebook');
    if (!fbParam) return;

    if (fbParam === 'select') {
      void loadPicker();
      return;
    }

    if (fbParam === 'confirm') {
      const pageId = params.get('pageId');
      const pageName = params.get('pageName');
      if (pageId && pageName) {
        setConfirmPage({ id: pageId, name: decodeURIComponent(pageName) });
        setShowPicker(true);
      }
      return;
    }

    if (fbParam === 'error') {
      const reason = params.get('reason') ?? 'oauth_failed';
      onMessage(`Facebook propojení selhalo: ${decodeURIComponent(reason)}`);
      router.replace('/admin/marketing/socialni-site');
    }
  }, [params, loadPicker, onMessage, router]);

  async function startOAuth() {
    storeFacebookOAuthReturnPath('/admin/marketing/socialni-site');
    setBusy(true);
    const url = await nestAdminFacebookAutopostConnectUrl(token);
    setBusy(false);
    if (!url) {
      onMessage('Nepodařilo se spustit Facebook OAuth.');
      return;
    }
    openFacebookOAuthUrl(url);
  }

  return (
    <>
      <div className="rounded-xl border border-[#1877f2]/30 bg-[#1877f2]/5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900">Propojení Facebook stránky</p>
            {fb.connected ? (
              <p className="mt-1 text-sm text-zinc-600">
                <span className="font-medium">{fb.pageName || 'Facebook stránka'}</span>
                {fb.pageId ? <span className="text-zinc-400"> · ID {fb.pageId}</span> : null}
              </p>
            ) : (
              <p className="mt-1 text-sm text-zinc-600">
                Připojte stránku XXREALIT přes Meta OAuth — token se uloží automaticky.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void startOAuth()}
              className="rounded-lg bg-[#1877f2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#166fe0] disabled:opacity-50"
            >
              {fb.connected ? 'Obnovit token' : 'Připojit Facebook'}
            </button>
          </div>
        </div>

        {fb.tokenWarning ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            ⚠ {fb.tokenWarning}
          </p>
        ) : null}

        {fb.connected || fb.tokenSet ? (
          <dl className="mt-4 grid gap-2 text-xs text-zinc-600 sm:grid-cols-2">
            <div>
              <dt className="font-medium text-zinc-500">Datum získání tokenu</dt>
              <dd>{formatDt(fb.tokenObtainedAt)}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500">Datum expirace</dt>
              <dd>{fb.tokenExpiresAt ? formatDt(fb.tokenExpiresAt) : 'Neexpirující (page token)'}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500">Poslední použití</dt>
              <dd>{formatDt(fb.tokenLastUsedAt)}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-500">Oprávnění tokenu</dt>
              <dd className="break-words">
                {fb.tokenScopes?.length ? fb.tokenScopes.join(', ') : '—'}
              </dd>
            </div>
            {fb.maskedToken ? (
              <div className="sm:col-span-2">
                <dt className="font-medium text-zinc-500">Token</dt>
                <dd className="font-mono">{fb.maskedToken}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </div>

      {showPicker ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal
        >
          <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            {confirmPage && !pages.length ? (
              <>
                <h2 className="text-lg font-semibold text-zinc-900">Potvrdit stránku</h2>
                <p className="mt-2 text-sm text-zinc-600">
                  Propojit autoposting se stránkou{' '}
                  <strong>{confirmPage.name}</strong>?
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void confirmSelect(confirmPage)}
                    className="rounded-lg bg-[#1877f2] px-4 py-2 text-sm font-semibold text-white"
                  >
                    Potvrdit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmPage(null);
                      void loadPicker();
                    }}
                    className="rounded-lg border px-4 py-2 text-sm"
                  >
                    Vybrat jinou
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-zinc-900">Vyberte Facebook stránku</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Doporučeno: <strong>XXrealit.cz</strong>
                </p>
                {pagesLoading ? (
                  <p className="mt-4 text-sm text-zinc-500">Načítání stránek…</p>
                ) : (
                  <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
                    {[...pages]
                      .sort((a, b) => {
                        const aPref =
                          a.id === preferredPageId ||
                          /xxrealit/i.test(a.name);
                        const bPref =
                          b.id === preferredPageId ||
                          /xxrealit/i.test(b.name);
                        if (aPref && !bPref) return -1;
                        if (!aPref && bPref) return 1;
                        return a.name.localeCompare(b.name, 'cs');
                      })
                      .map((page) => {
                        const isPreferred =
                          page.id === preferredPageId || /xxrealit/i.test(page.name);
                        return (
                          <li key={page.id}>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void confirmSelect(page)}
                              className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm hover:bg-zinc-50 disabled:opacity-50 ${
                                isPreferred ? 'border-[#1877f2] bg-[#1877f2]/5' : 'border-zinc-200'
                              }`}
                            >
                              <span className="font-semibold text-zinc-900">{page.name}</span>
                              {isPreferred ? (
                                <span className="ml-auto text-xs font-semibold text-[#1877f2]">
                                  doporučeno
                                </span>
                              ) : null}
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setShowPicker(false);
                setConfirmPage(null);
                router.replace('/admin/marketing/socialni-site');
              }}
              className="mt-4 text-sm text-zinc-500 hover:underline"
            >
              Zrušit
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
