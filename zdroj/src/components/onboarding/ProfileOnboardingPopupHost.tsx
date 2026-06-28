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
import { isRunningAsInstalledPwa } from '@/lib/pwa-push-onboarding-storage';
import {
  nestFetchMe,
  nestMarketingPopupRecordView,
  nestMarketingPopupsEligible,
  type MarketingPopupRow,
  type NestMeProfile,
} from '@/lib/nest-client';

const SKIP_PREFIXES = ['/onboarding/', '/login', '/registrace', '/prihlaseni', '/admin'];

function shouldSkipPath(pathname: string): boolean {
  return SKIP_PREFIXES.some((p) => pathname.startsWith(p));
}

function workerMissingItems(me: NestMeProfile | null) {
  if (!me) return [];
  const items: Array<{ id: string; label: string; href: string }> = [];
  if (!String(me.phone ?? '').trim()) {
    items.push({ id: 'phone', label: 'Doplňte telefonní číslo', href: '/pracovnik/nastaveni' });
  }
  if (!me.emailVerified) {
    items.push({ id: 'email', label: 'Ověřte e-mail', href: '/pracovnik/nastaveni' });
  }
  if (!me.whatsappVerified) {
    items.push({ id: 'whatsapp', label: 'Ověřte WhatsApp', href: '/pracovnik/nastaveni' });
  }
  if (!me.avatarUrl) {
    items.push({ id: 'avatar', label: 'Nahrajte profilovou fotku', href: '/pracovnik/nastaveni' });
  }
  items.push({
    id: 'clients_intro',
    label: 'Seznamte se s prací s klienty',
    href: '/pracovnik/klienti',
  });
  return items;
}

function PopupShell({
  popup,
  onClose,
  children,
}: {
  popup: MarketingPopupRow;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[240] flex items-end justify-center bg-black/45 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-labelledby={`popup-title-${popup.id}`}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl"
      >
        <h2 id={`popup-title-${popup.id}`} className="text-lg font-bold text-zinc-900">
          {popup.title}
        </h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{popup.body}</p>
        {popup.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={popup.imageUrl} alt="" className="mt-3 max-h-48 w-full rounded-xl object-cover" />
        ) : null}
        {popup.videoUrl ? (
          <video src={popup.videoUrl} controls className="mt-3 w-full rounded-xl" />
        ) : null}
        {children}
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-600"
        >
          Zavřít
        </button>
      </div>
    </div>
  );
}

export function ProfileOnboardingPopupHost() {
  const pathname = usePathname() ?? '/';
  const { isAuthenticated, isLoading, apiAccessToken, user } = useAuth();
  const token = apiAccessToken;

  const [me, setMe] = useState<NestMeProfile | null>(null);
  const [queue, setQueue] = useState<MarketingPopupRow[]>([]);
  const [active, setActive] = useState<MarketingPopupRow | null>(null);
  const [ready, setReady] = useState(false);

  const onWorkerPanel = pathname.startsWith('/pracovnik');
  const role = String(user?.role ?? me?.role ?? '').toUpperCase();

  const missingProfileItems = useMemo(
    () => me?.profileRequirements?.checklist?.filter((i) => !i.satisfied) ?? [],
    [me],
  );

  const evaluate = useCallback(async () => {
    if (!token || !isAuthenticated || isLoading) return;
    if (role === 'ADMIN') return;
    if (shouldSkipPath(pathname)) return;
    if (isProfileOnboardingShownThisSession()) return;

    const profile = await nestFetchMe(token);
    setMe(profile);
    if (!profile) return;

    const justRegistered = consumeJustRegistered();
    const justLoggedIn = consumeJustLoggedIn() || justRegistered;

    const popups = await nestMarketingPopupsEligible(token, {
      justRegistered,
      justLoggedIn,
      isPwaInstalled: isRunningAsInstalledPwa(),
      onWorkerPanel: onWorkerPanel && role === 'PORTAL_WORKER',
    });

    const visible = popups.filter(
      (p) =>
        !isAdminPopupDismissedThisSession(p.id) &&
        !['pwa_install', 'pwa_push', 'guest_gate', 'inline_overlay', 'share_gate'].includes(
          p.variant,
        ),
    );
    setQueue(visible);
    const first = visible[0] ?? null;
    if (first) {
      setActive(first);
      markProfileOnboardingShownThisSession();
      void nestMarketingPopupRecordView(token, first.id);
    }
  }, [token, isAuthenticated, isLoading, role, pathname, onWorkerPanel]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    const t = window.setTimeout(() => {
      setReady(true);
      void evaluate();
    }, 600);
    return () => window.clearTimeout(t);
  }, [isLoading, isAuthenticated, evaluate]);

  function closeActive() {
    if (!active) return;
    dismissAdminPopupThisSession(active.id);
    const rest = queue.filter((p) => p.id !== active.id && !isAdminPopupDismissedThisSession(p.id));
    setQueue(rest);
    const next = rest[0] ?? null;
    setActive(next);
    if (next && token) void nestMarketingPopupRecordView(token, next.id);
  }

  if (!ready || !active) return null;

  if (active.variant === 'profile_checklist' && me) {
    return (
      <PopupShell popup={active} onClose={closeActive}>
        {missingProfileItems.length > 0 ? (
          <ul className="mt-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm">
            {missingProfileItems.map((item) => (
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
              onClick={closeActive}
              className="rounded-full bg-[#25D366] px-4 py-3 text-center text-sm font-bold text-white"
            >
              Ověřit WhatsApp číslo
            </Link>
          ) : null}
          {!me.emailVerified ? (
            <Link
              href="/profil/dashboard?tab=settings#profile-details-form"
              onClick={closeActive}
              className="rounded-full bg-zinc-900 px-4 py-3 text-center text-sm font-bold text-white"
            >
              Ověřit e-mail
            </Link>
          ) : null}
          {missingProfileItems.some((i) => !['whatsapp', 'email'].includes(i.id)) ? (
            <Link
              href="/profil/dashboard?tab=settings#profile-details-form"
              onClick={closeActive}
              className="rounded-full border border-zinc-300 px-4 py-3 text-center text-sm font-semibold text-zinc-800"
            >
              Doplnit údaje profilu
            </Link>
          ) : null}
        </div>
      </PopupShell>
    );
  }

  if (active.variant === 'worker_checklist' && me) {
    const workerItems = workerMissingItems(me);
    return (
      <PopupShell popup={active} onClose={closeActive}>
        <ul className="mt-4 space-y-2 rounded-xl border border-blue-200 bg-blue-50/80 p-3 text-sm">
          {workerItems.map((item) => (
            <li key={item.id}>
              <Link href={item.href} onClick={closeActive} className="font-medium text-blue-900 hover:underline">
                → {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </PopupShell>
    );
  }

  return (
    <PopupShell popup={active} onClose={closeActive}>
      {active.buttons?.length ? (
        <div className="mt-4 flex flex-col gap-2">
          {active.buttons.map((btn) => (
            <Link
              key={`${btn.href}-${btn.label}`}
              href={btn.href}
              onClick={closeActive}
              className="rounded-full bg-[#ff6a00] px-4 py-3 text-center text-sm font-bold text-white"
            >
              {btn.label}
            </Link>
          ))}
        </div>
      ) : null}
    </PopupShell>
  );
}
