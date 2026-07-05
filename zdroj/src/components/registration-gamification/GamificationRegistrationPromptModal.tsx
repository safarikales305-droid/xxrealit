'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FacebookAuthButton } from '@/components/auth/FacebookAuthButton';
import { GuestGateAuthPanel } from '@/components/registration/GuestGateAuthPanel';
import type { RegistrationGamificationPublicSettings } from '@/lib/nest-client';
import {
  closeGamificationRegistrationPrompt,
  unlockPageScrollForGamification,
} from '@/lib/registration-gamification-store';
import { ProviderOAuthButton } from './ProviderOAuthButton';

type AuthMode = 'login' | 'register' | null;

type Props = {
  settings: RegistrationGamificationPublicSettings;
  onClose: () => void;
};

const DEFAULT_CLOSE_MODAL = {
  title: 'Připojte se k XXREALIT zdarma',
  subtitle: 'Máte několik možností:',
  benefits: [
    'Přidávání inzerátů zdarma',
    'Sdílení na sociální sítě',
    'Tipařský program',
    'Bonusové akce',
    'Komunita profesionálů',
  ],
  motivationText: '🎁 Po registraci získáte přístup ke všem funkcím portálu.',
};

export function GamificationRegistrationPromptModal({ settings, onClose }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnTo = `${pathname ?? '/'}${searchParams?.toString() ? `?${searchParams.toString()}` : ''}`;

  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [navigating, setNavigating] = useState<AuthMode>(null);

  const closeModal = settings.config.closeModal ?? DEFAULT_CLOSE_MODAL;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !authMode) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [authMode, onClose]);

  const navigateToAuthPage = useCallback(
    (target: 'register' | 'login') => {
      if (navigating) return;
      setNavigating(target);
      const targetUrl = `${target === 'register' ? '/registrace' : '/prihlaseni'}?source=game`;
      unlockPageScrollForGamification();
      closeGamificationRegistrationPrompt();
      onClose();
      window.requestAnimationFrame(() => {
        const startUrl = window.location.pathname + window.location.search;
        try {
          router.push(targetUrl);
        } catch {
          window.location.href = targetUrl;
          return;
        }
        window.setTimeout(() => {
          if (window.location.pathname + window.location.search === startUrl) {
            window.location.href = targetUrl;
          }
        }, 750);
      });
    },
    [navigating, onClose, router],
  );

  const openAuthPanel = useCallback((mode: AuthMode) => {
    setAuthMode(mode);
  }, []);

  const promoText =
    settings.closeModalPromoEnabled && settings.bonusDescription.trim()
      ? `Zaregistrujte se nyní a získejte ${settings.bonusDescription.toLowerCase()} — až ${settings.bonusCredits.toLocaleString('cs-CZ')} kreditů za splnění podmínek aktuální akce.`
      : null;

  return (
    <>
      {!authMode ? (
        <div
          className="fixed inset-0 z-[11000] flex items-end justify-center bg-black/60 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gamification-registration-prompt-title"
        >
          <button
            type="button"
            className="absolute inset-0 z-0 cursor-default"
            aria-label="Zavřít dialog"
            onClick={onClose}
          />
          <div className="relative z-[11001] flex max-h-[100dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-3xl">
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 z-20 rounded-full bg-zinc-100 px-3 py-1 text-sm font-semibold text-zinc-600 hover:bg-zinc-200"
            >
              Zavřít
            </button>

            <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
              <div className="pr-14">
                <h2
                  id="gamification-registration-prompt-title"
                  className="text-xl font-bold leading-tight text-zinc-900 sm:text-2xl"
                >
                  {closeModal.title}
                </h2>
                <p className="mt-2 text-sm text-zinc-600">{closeModal.subtitle}</p>
              </div>

              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => openAuthPanel('register')}
                  disabled={navigating !== null}
                  className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-3.5 text-left text-sm font-bold text-white shadow-lg shadow-orange-900/25 transition hover:brightness-105 disabled:opacity-70"
                >
                  <span className="text-lg">✅</span>
                  <span>Registrovat se zdarma</span>
                </button>
                <button
                  type="button"
                  onClick={() => openAuthPanel('login')}
                  disabled={navigating !== null}
                  className="flex w-full items-center gap-3 rounded-2xl border-2 border-orange-200 bg-orange-50 px-4 py-3.5 text-left text-sm font-bold text-orange-900 transition hover:bg-orange-100 disabled:opacity-70"
                >
                  <span className="text-lg">✅</span>
                  <span>Přihlásit se</span>
                </button>
                <ProviderOAuthButton
                  provider="google"
                  label="Pokračovat přes Google"
                  onFallback={() => openAuthPanel('register')}
                />
                <div className="[&_button]:flex [&_button]:items-center [&_button]:gap-3 [&_button]:rounded-2xl [&_button]:border [&_button]:border-[#1877F2]/20 [&_button]:bg-[#1877F2] [&_button]:py-3.5 [&_button]:text-left [&_button]:text-sm [&_button]:font-bold [&_p]:hidden">
                  <FacebookAuthButton
                    label="Pokračovat přes Facebook"
                    event="facebook_register_click"
                  />
                </div>
                <ProviderOAuthButton
                  provider="apple"
                  label="Pokračovat přes Apple"
                  onFallback={() => openAuthPanel('register')}
                />
              </div>

              <ul className="mt-5 space-y-2 border-t border-zinc-100 pt-4 text-sm text-zinc-700">
                {closeModal.benefits.map((benefit) => (
                  <li key={benefit} className="flex gap-2">
                    <span className="text-orange-500">•</span>
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>

              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
                {closeModal.motivationText}
              </p>

              {promoText ? (
                <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  {promoText}
                </p>
              ) : null}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => navigateToAuthPage('register')}
                  disabled={navigating !== null}
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-70"
                >
                  {navigating === 'register' ? 'Otevírám…' : 'Otevřít registraci'}
                </button>
                <button
                  type="button"
                  onClick={() => navigateToAuthPage('login')}
                  disabled={navigating !== null}
                  className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-70"
                >
                  {navigating === 'login' ? 'Otevírám…' : 'Otevřít přihlášení'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {authMode ? (
        <GuestGateAuthPanel
          mode={authMode}
          returnTo={returnTo}
          onClose={() => {
            setAuthMode(null);
            onClose();
          }}
          onSwitchMode={setAuthMode}
        />
      ) : null}
    </>
  );
}
