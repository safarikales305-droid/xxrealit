'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  clearPwaInstallDismissed,
  isPwaInstallDismissed,
  setPwaInstallDismissed,
} from '@/lib/pwa-install-storage';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isRunningAsInstalledPwa(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

/**
 * Mobilní panel po přihlášení: nabídne instalaci PWA přes `beforeinstallprompt`.
 * „Nechci“ uloží dismiss do localStorage; maže se při loginu / logoutu → při dalším přihlášení se panel znovu může zobrazit.
 */
export function PwaInstallPrompt() {
  const { isAuthenticated, isLoading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setDismissed(isPwaInstallDismissed());
  }, [mounted, isAuthenticated]);

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      clearPwaInstallDismissed();
    };
    window.addEventListener('beforeinstallprompt', onBip);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [mounted]);

  const handleInstall = useCallback(async () => {
    if (!deferred) return;
    setInstalling(true);
    try {
      await deferred.prompt();
      await deferred.userChoice.catch(() => undefined);
    } catch {
      /* uživatel zrušil nebo prohlížeč odmítl */
    } finally {
      setInstalling(false);
      setDeferred(null);
    }
  }, [deferred]);

  const handleDismiss = useCallback(() => {
    setPwaInstallDismissed();
    setDismissed(true);
  }, []);

  if (!mounted || isLoading) return null;
  if (!isAuthenticated || !mobile) return null;
  if (isRunningAsInstalledPwa()) return null;
  if (!deferred || dismissed) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[200] bg-black/35 backdrop-blur-[2px] md:hidden"
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-install-title"
        className="fixed inset-x-0 bottom-0 z-[210] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 md:hidden"
      >
        <div className="mx-auto max-w-lg rounded-2xl border border-orange-200/60 bg-white p-4 shadow-[0_-8px_40px_rgba(0,0,0,0.18)]">
          <p
            id="pwa-install-title"
            className="text-center text-[15px] font-semibold leading-snug text-zinc-900"
          >
            Rychlejší přístup na mobilu
          </p>
          <p className="mt-1.5 text-center text-xs leading-relaxed text-zinc-600">
            Přidejte XXrealit na plochu jako samostatnou aplikaci.
          </p>
          <div className="mt-4 flex flex-col gap-2.5">
            <button
              type="button"
              disabled={installing}
              onClick={() => void handleInstall()}
              className="min-h-[48px] w-full rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-3 text-[14px] font-bold text-white shadow-[0_8px_28px_-6px_rgba(255,106,0,0.45)] transition hover:brightness-105 active:scale-[0.99] disabled:opacity-60 sm:text-[15px]"
            >
              {installing ? 'Otevírám…' : 'Nainstalovat aplikaci'}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="min-h-[48px] w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-[14px] font-semibold text-zinc-800 transition hover:bg-zinc-100 active:scale-[0.99] sm:text-[15px]"
            >
              Nechci instalovat
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
