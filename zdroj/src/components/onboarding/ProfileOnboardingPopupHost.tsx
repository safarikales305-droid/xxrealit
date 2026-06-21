'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  dismissAdminPopupThisSession,
  isAdminPopupDismissedThisSession,
  isProfileOnboardingShownThisSession,
  markProfileOnboardingShownThisSession,
  consumeJustLoggedIn,
  consumeJustRegistered,
} from '@/lib/onboarding-popup-session';
import {
  isRunningAsInstalledPwa,
} from '@/lib/pwa-push-onboarding-storage';
import {
  nestFetchMe,
  nestMarketingPopupsEligible,
  type MarketingPopupRow,
  type NestMeProfile,
} from '@/lib/nest-client';

const SKIP_PREFIXES = ['/onboarding/', '/login', '/registrace', '/prihlaseni', '/admin'];

function shouldSkipPath(pathname: string): boolean {
  return SKIP_PREFIXES.some((p) => pathname.startsWith(p));
}

function profileNeedsAttention(me: NestMeProfile | null): boolean {
  if (!me?.profileRequirements?.checklist?.length) return false;
  return me.profileRequirements.checklist.some((item) => !item.satisfied);
}

function showTipsterOffer(me: NestMeProfile | null): boolean {
  if (!me || me.isTipar) return false;
  const role = String(me.role ?? '').toUpperCase();
  return role !== 'TIPSTER' && role !== 'ADMIN';
}

export function ProfileOnboardingPopupHost() {
  const pathname = usePathname() ?? '/';
  const { isAuthenticated, isLoading, apiAccessToken, user } = useAuth();
  const token = apiAccessToken;

  const [me, setMe] = useState<NestMeProfile | null>(null);
  const [adminPopups, setAdminPopups] = useState<MarketingPopupRow[]>([]);
  const [showBuiltIn, setShowBuiltIn] = useState(false);
  const [adminPopup, setAdminPopup] = useState<MarketingPopupRow | null>(null);
  const [ready, setReady] = useState(false);

  const missingItems = useMemo(
    () => me?.profileRequirements?.checklist?.filter((i) => !i.satisfied) ?? [],
    [me],
  );

  const evaluate = useCallback(async () => {
    if (!token || !isAuthenticated || isLoading) return;
    if (user?.role === 'ADMIN') return;
    if (shouldSkipPath(pathname)) return;
    if (isProfileOnboardingShownThisSession()) return;

    const profile = await nestFetchMe(token);
    setMe(profile);
    if (!profile) return;

    const justRegistered = consumeJustRegistered();
    const justLoggedIn = consumeJustLoggedIn() || justRegistered;
    const needsProfile = profileNeedsAttention(profile);
    const tipOffer = showTipsterOffer(profile);

    if (needsProfile || tipOffer) {
      setShowBuiltIn(true);
      markProfileOnboardingShownThisSession();
      return;
    }

    const popups = await nestMarketingPopupsEligible(token, {
      justRegistered,
      justLoggedIn,
      isPwaInstalled: isRunningAsInstalledPwa(),
    });
    setAdminPopups(popups);
    const next = popups.find((p) => !isAdminPopupDismissedThisSession(p.id));
    if (next) {
      setAdminPopup(next);
      markProfileOnboardingShownThisSession();
    }
  }, [token, isAuthenticated, isLoading, user?.role, pathname]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    const t = window.setTimeout(() => {
      setReady(true);
      void evaluate();
    }, 600);
    return () => window.clearTimeout(t);
  }, [isLoading, isAuthenticated, evaluate]);

  function closeBuiltIn() {
    setShowBuiltIn(false);
    const next = adminPopups.find((p) => !isAdminPopupDismissedThisSession(p.id));
    if (next) setAdminPopup(next);
  }

  function closeAdminPopup() {
    if (adminPopup) dismissAdminPopupThisSession(adminPopup.id);
    const rest = adminPopups.filter(
      (p) => p.id !== adminPopup?.id && !isAdminPopupDismissedThisSession(p.id),
    );
    setAdminPopup(rest[0] ?? null);
  }

  if (!ready) return null;

  if (showBuiltIn && me) {
    return (
      <div className="fixed inset-0 z-[240] flex items-end justify-center bg-black/45 p-4 backdrop-blur-sm sm:items-center">
        <div
          role="dialog"
          aria-labelledby="onboarding-popup-title"
          className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl"
        >
          <h2 id="onboarding-popup-title" className="text-lg font-bold text-zinc-900">
            Dokončete profil pro plné využití portálu
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            Aby vám fungovaly kredity, leady, tipaření a upozornění, doplňte prosím tyto kroky.
          </p>

          {missingItems.length > 0 ? (
            <ul className="mt-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm">
              {missingItems.map((item) => (
                <li key={item.id} className="text-red-800">
                  ❌ {item.missingLabel}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4 flex flex-col gap-2">
            {!me.whatsappVerified ? (
              <Link
                href="/profil/dashboard?tab=settings#whatsapp-verify"
                onClick={closeBuiltIn}
                className="rounded-full bg-[#25D366] px-4 py-3 text-center text-sm font-bold text-white"
              >
                Ověřit WhatsApp číslo
              </Link>
            ) : null}
            {!me.emailVerified ? (
              <Link
                href="/profil/dashboard?tab=settings#profile-details-form"
                onClick={closeBuiltIn}
                className="rounded-full bg-zinc-900 px-4 py-3 text-center text-sm font-bold text-white"
              >
                Ověřit e-mail
              </Link>
            ) : null}
            {missingItems.some((i) => !['whatsapp', 'email'].includes(i.id)) ? (
              <Link
                href="/profil/dashboard?tab=settings#profile-details-form"
                onClick={closeBuiltIn}
                className="rounded-full border border-zinc-300 px-4 py-3 text-center text-sm font-semibold text-zinc-800"
              >
                Doplnit údaje profilu
              </Link>
            ) : null}
            {showTipsterOffer(me) ? (
              <Link
                href="/profil#tipar"
                onClick={closeBuiltIn}
                className="rounded-full border-2 border-orange-300 bg-orange-50 px-4 py-3 text-center text-sm font-bold text-orange-900"
              >
                Stát se tipařem a vydělávat na kontaktech
              </Link>
            ) : null}
          </div>

          <button
            type="button"
            onClick={closeBuiltIn}
            className="mt-4 w-full rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-600"
          >
            Zavřít
          </button>
        </div>
      </div>
    );
  }

  if (!adminPopup) return null;

  return (
    <div className="fixed inset-0 z-[240] flex items-end justify-center bg-black/45 p-4 backdrop-blur-sm sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl">
        <h2 className="text-lg font-bold text-zinc-900">{adminPopup.title}</h2>
        <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{adminPopup.body}</div>
        {adminPopup.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={adminPopup.imageUrl} alt="" className="mt-3 max-h-48 w-full rounded-xl object-cover" />
        ) : null}
        {adminPopup.videoUrl ? (
          <video src={adminPopup.videoUrl} controls className="mt-3 w-full rounded-xl" />
        ) : null}
        {adminPopup.buttons?.length ? (
          <div className="mt-4 flex flex-col gap-2">
            {adminPopup.buttons.map((btn) => (
              <Link
                key={`${btn.href}-${btn.label}`}
                href={btn.href}
                onClick={closeAdminPopup}
                className="rounded-full bg-[#ff6a00] px-4 py-3 text-center text-sm font-bold text-white"
              >
                {btn.label}
              </Link>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          onClick={closeAdminPopup}
          className="mt-4 w-full rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-600"
        >
          Zavřít
        </button>
      </div>
    </div>
  );
}
