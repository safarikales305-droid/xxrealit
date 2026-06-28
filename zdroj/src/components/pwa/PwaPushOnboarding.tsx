'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { subscribeToWebPush } from '@/components/pwa/PwaServiceWorkerRegister';
import {
  dismissPwaPushOnboarding,
  isPwaFirstLaunchPending,
  isRunningAsInstalledPwa,
  markPwaFirstLaunchDone,
  shouldShowPwaPushOnboarding,
} from '@/lib/pwa-push-onboarding-storage';
import { nestMarketingPopupBySlug, nestPushVapidPublicKey } from '@/lib/nest-client';

export function PwaPushOnboarding() {
  const { isAuthenticated, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('Zapněte upozornění');
  const [body, setBody] = useState(
    'Zapněte upozornění a dostávejte okamžité informace o nových zprávách, zájemcích a nabídkách.',
  );
  const [enableLabel, setEnableLabel] = useState('Zapnout upozornění');
  const [popupEnabled, setPopupEnabled] = useState(true);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !token) return undefined;
    if (!isRunningAsInstalledPwa()) return undefined;
    if (!shouldShowPwaPushOnboarding()) return undefined;

    let cancelled = false;
    let timer: number | undefined;

    void nestMarketingPopupBySlug(token, 'pwa-push').then((popup) => {
      if (cancelled) return;
      if (popup && !popup.isEnabled) {
        setPopupEnabled(false);
        return;
      }
      if (popup) {
        setTitle(popup.title);
        setBody(popup.body);
        const btn = popup.buttons?.[0];
        if (btn?.label) setEnableLabel(btn.label);
      }
      timer = window.setTimeout(() => setOpen(true), 1200);
    });

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [isLoading, isAuthenticated, token]);

  const handleEnable = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    const vapid = await nestPushVapidPublicKey(token);
    if (!vapid?.publicKey) {
      setError('Push notifikace nejsou na serveru nakonfigurovány.');
      setBusy(false);
      return;
    }
    const r = await subscribeToWebPush(token, vapid.publicKey);
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? 'Nepodařilo se zapnout upozornění.');
      dismissPwaPushOnboarding();
      return;
    }
    markPwaFirstLaunchDone();
    setOpen(false);
  }, [token]);

  const handleDismiss = useCallback(() => {
    dismissPwaPushOnboarding();
    markPwaFirstLaunchDone();
    setOpen(false);
  }, []);

  if (!open || !popupEnabled) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-wide text-orange-600">
          {isPwaFirstLaunchPending() ? 'Vítejte v aplikaci' : 'Upozornění'}
        </p>
        <h2 className="mt-1 text-lg font-bold text-zinc-900">{title}</h2>
        <p className="mt-2 text-sm text-zinc-600">{body}</p>

        {error ? (
          <p className="mt-3 text-sm font-medium text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleEnable()}
          className="mt-4 w-full rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {busy ? 'Aktivuji…' : enableLabel}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={handleDismiss}
          className="mt-2 w-full rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-600"
        >
          Teď ne
        </button>
      </div>
    </div>
  );
}
