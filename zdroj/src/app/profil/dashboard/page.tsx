'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useMessagesUnreadCount } from '@/hooks/use-messages-unread';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  nestChangeMyPassword,
  nestDeleteMyProperty,
  nestFetchMe,
  nestFetchMyListings,
  nestListMyCompanyAds,
  nestListNotifications,
  nestMarkNotificationRead,
  nestPatchBrokerLeadPrefs,
  nestPatchBrokerPublicProfile,
  nestPatchProfileBio,
  nestPatchProfileVisibility,
  nestPatchProfessionalVisibility,
  nestTopMyProperty,
  type NestMeProfile,
  type NestMyListingRow,
  type UserNotificationRow,
  type NestCompanyAdRow,
} from '@/lib/nest-client';
import { dashboardPathForRole } from '@/lib/roles';

type Tab = 'settings' | 'listings' | 'ads' | 'messages' | 'notifications';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'settings', label: 'Nastavení profilu' },
  { id: 'listings', label: 'Správa inzerátů' },
  { id: 'ads', label: 'Nastavení reklam' },
  { id: 'messages', label: 'Zprávy' },
  { id: 'notifications', label: 'Notifikace' },
];

function parseTab(raw: string | null): Tab {
  if (raw === 'listings' || raw === 'ads' || raw === 'messages' || raw === 'notifications') {
    return raw;
  }
  return 'settings';
}

export default function ProfileDashboardPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { isAuthenticated, isLoading, apiAccessToken, user } = useAuth();
  const unreadMessages = useMessagesUnreadCount(apiAccessToken);
  const tab = parseTab(params.get('tab'));

  const [me, setMe] = useState<NestMeProfile | null>(null);
  const [loadingMe, setLoadingMe] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [bioDraft, setBioDraft] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');

  const [listings, setListings] = useState<NestMyListingRow[]>([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [busyListingId, setBusyListingId] = useState<string | null>(null);

  const [notifications, setNotifications] = useState<UserNotificationRow[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [companyAds, setCompanyAds] = useState<NestCompanyAdRow[]>([]);

  const isProfessional = ['AGENT', 'COMPANY', 'AGENCY', 'FINANCIAL_ADVISOR', 'INVESTOR'].includes(
    user?.role ?? '',
  );
  const adsDashboardPath = user?.role
    ? dashboardPathForRole(user.role as Parameters<typeof dashboardPathForRole>[0])
    : '/dashboard';

  const setTab = useCallback(
    (next: Tab) => {
      router.replace(`/profil/dashboard?tab=${encodeURIComponent(next)}`);
    },
    [router],
  );

  const loadMe = useCallback(async () => {
    if (!apiAccessToken) return;
    setLoadingMe(true);
    const profile = await nestFetchMe(apiAccessToken);
    setLoadingMe(false);
    if (!profile) return;
    setMe(profile);
    setBioDraft(profile.bio ?? '');
  }, [apiAccessToken]);

  const loadListings = useCallback(async () => {
    if (!apiAccessToken) return;
    setListingsLoading(true);
    const rows = await nestFetchMyListings(apiAccessToken);
    setListingsLoading(false);
    setListings(rows ?? []);
  }, [apiAccessToken]);

  const loadNotifications = useCallback(async () => {
    if (!apiAccessToken) return;
    setNotifLoading(true);
    const rows = await nestListNotifications(apiAccessToken);
    setNotifLoading(false);
    setNotifications(rows ?? []);
  }, [apiAccessToken]);

  useEffect(() => {
    void loadMe();
    void loadListings();
    void loadNotifications();
  }, [loadMe, loadListings, loadNotifications]);

  const activeCompanyAds = useMemo(
    () => companyAds.filter((x) => x.isActive).length,
    [companyAds],
  );
  const inactiveCompanyAds = useMemo(
    () => companyAds.filter((x) => !x.isActive).length,
    [companyAds],
  );

  useEffect(() => {
    if (!apiAccessToken || user?.role !== 'COMPANY') return;
    void nestListMyCompanyAds(apiAccessToken).then((rows) => {
      if (!rows) return;
      setCompanyAds(rows);
    });
  }, [apiAccessToken, user?.role]);

  if (!isLoading && !isAuthenticated) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-zinc-700">Pro správu účtu se přihlaste.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <Link href="/profil" className="inline-flex text-sm font-semibold text-[#e85d00] hover:underline">
        ← Zpět na profil
      </Link>

      <section className="mt-4 grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <nav className="space-y-1">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                  tab === item.id ? 'bg-orange-50 text-orange-900' : 'text-zinc-700 hover:bg-zinc-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
          {ok ? <p className="mb-3 text-sm text-emerald-700">{ok}</p> : null}

          {tab === 'settings' ? (
            <div className="space-y-5">
              <h1 className="text-xl font-bold text-zinc-900">Nastavení profilu</h1>
              {loadingMe ? <p className="text-sm text-zinc-600">Načítám…</p> : null}
              <label className="block text-sm font-semibold text-zinc-800">
                Bio
                <textarea
                  value={bioDraft}
                  onChange={(e) => setBioDraft(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={!apiAccessToken || saving}
                className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => {
                  if (!apiAccessToken) return;
                  setSaving(true);
                  setError(null);
                  setOk(null);
                  void nestPatchProfileBio(apiAccessToken, { bio: bioDraft }).then((res) => {
                    setSaving(false);
                    if (!res.ok) {
                      setError(res.error ?? 'Uložení bio selhalo.');
                      return;
                    }
                    setOk('Bio bylo uloženo.');
                    void loadMe();
                  });
                }}
              >
                Uložit bio
              </button>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="inline-flex items-center gap-2 text-sm text-zinc-800">
                  <input
                    type="checkbox"
                    checked={Boolean(me?.isPublicBrokerProfile)}
                    onChange={(e) => {
                      if (!apiAccessToken) return;
                      void nestPatchProfileVisibility(apiAccessToken, e.target.checked).then(() => void loadMe());
                    }}
                  />
                  Veřejný profil
                </label>
                {isProfessional ? (
                  <label className="inline-flex items-center gap-2 text-sm text-zinc-800">
                    <input
                      type="checkbox"
                      checked={
                        user?.role === 'COMPANY'
                          ? Boolean(me?.companyProfile?.isPublic)
                          : user?.role === 'AGENCY'
                            ? Boolean(me?.agencyProfile?.isPublic)
                            : user?.role === 'FINANCIAL_ADVISOR'
                              ? Boolean(me?.financialAdvisorProfile?.isPublic)
                              : user?.role === 'INVESTOR'
                                ? Boolean(me?.investorProfile?.isPublic)
                                : Boolean(me?.isPublicBrokerProfile)
                      }
                      onChange={(e) => {
                        if (!apiAccessToken) return;
                        void nestPatchProfessionalVisibility(apiAccessToken, e.target.checked).then(() => void loadMe());
                      }}
                    />
                    Veřejný profesní profil
                  </label>
                ) : null}
                {user?.role === 'AGENT' ? (
                  <>
                    <label className="inline-flex items-center gap-2 text-sm text-zinc-800">
                      <input
                        type="checkbox"
                        checked={Boolean(me?.allowBrokerReviews)}
                        onChange={(e) => {
                          if (!apiAccessToken) return;
                          void nestPatchBrokerPublicProfile(apiAccessToken, {
                            allowBrokerReviews: e.target.checked,
                          }).then(() => void loadMe());
                        }}
                      />
                      Povolit recenze
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-zinc-800">
                      <input
                        type="checkbox"
                        checked={me?.brokerLeadNotificationEnabled !== false}
                        onChange={(e) => {
                          if (!apiAccessToken) return;
                          void nestPatchBrokerLeadPrefs(apiAccessToken, {
                            brokerLeadNotificationEnabled: e.target.checked,
                          }).then(() => void loadMe());
                        }}
                      />
                      Notifikace leadů vlastníků
                    </label>
                  </>
                ) : null}
              </div>

              {user?.role === 'AGENT' ? (
                <p className="text-sm text-zinc-700">
                  Premium: <strong>{me?.isPremiumBroker ? 'ano' : 'ne'}</strong>, body:{' '}
                  <strong>{me?.brokerPoints ?? 0}</strong>, volné leady:{' '}
                  <strong>{me?.brokerFreeLeads ?? 0}</strong>
                </p>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-3">
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Aktuální heslo" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Nové heslo" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input type="password" value={newPasswordConfirm} onChange={(e) => setNewPasswordConfirm(e.target.value)} placeholder="Potvrzení hesla" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
              </div>
              <button
                type="button"
                disabled={!apiAccessToken || saving}
                className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => {
                  if (!apiAccessToken) return;
                  setSaving(true);
                  setError(null);
                  setOk(null);
                  void nestChangeMyPassword(apiAccessToken, {
                    currentPassword,
                    newPassword,
                    confirmPassword: newPasswordConfirm,
                  }).then((res) => {
                    setSaving(false);
                    if (!res.ok) {
                      setError(res.error ?? 'Změna hesla selhala.');
                      return;
                    }
                    setCurrentPassword('');
                    setNewPassword('');
                    setNewPasswordConfirm('');
                    setOk('Heslo bylo změněno.');
                  });
                }}
              >
                Změnit heslo
              </button>
            </div>
          ) : null}

          {tab === 'listings' ? (
            <div>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h1 className="text-xl font-bold text-zinc-900">Správa inzerátů</h1>
                <Link href="/inzerat/pridat" className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-2 text-sm font-semibold text-white">Přidat inzerát</Link>
              </div>
              {listingsLoading ? <p className="text-sm text-zinc-600">Načítám inzeráty…</p> : null}
              <div className="grid gap-3 md:grid-cols-2">
                {listings.map((item) => (
                  <article key={item.id} className="rounded-xl border border-zinc-200 p-3">
                    <img src={nestAbsoluteAssetUrl(item.coverUrl ?? '')} alt={item.title} className="h-36 w-full rounded-lg object-cover" />
                    <p className="mt-2 text-sm font-semibold">{item.title}</p>
                    <p className="text-xs text-zinc-600">{item.city}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={`/inzerat/upravit/${encodeURIComponent(item.id)}`} className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-800">Upravit</Link>
                      <button
                        type="button"
                        disabled={busyListingId === item.id || !apiAccessToken}
                        onClick={() => {
                          if (!apiAccessToken) return;
                          setBusyListingId(item.id);
                          void nestTopMyProperty(apiAccessToken, item.id).then(() => {
                            setBusyListingId(null);
                            void loadListings();
                          });
                        }}
                        className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"
                      >
                        Topovat
                      </button>
                      <button
                        type="button"
                        disabled={busyListingId === item.id || !apiAccessToken}
                        onClick={() => {
                          if (!apiAccessToken) return;
                          if (!window.confirm('Opravdu chcete inzerát smazat?')) return;
                          setBusyListingId(item.id);
                          void nestDeleteMyProperty(apiAccessToken, item.id).then(() => {
                            setBusyListingId(null);
                            void loadListings();
                          });
                        }}
                        className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700"
                      >
                        Smazat
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {tab === 'ads' ? (
            <div>
              <h1 className="text-xl font-bold text-zinc-900">Nastavení reklam</h1>
              <p className="mt-2 text-sm text-zinc-600">
                Aktivní reklamy: <strong>{activeCompanyAds}</strong>, neaktivní:{' '}
                <strong>{inactiveCompanyAds}</strong>
              </p>
              <Link href={adsDashboardPath} className="mt-4 inline-flex rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">
                Otevřít reklamní dashboard
              </Link>
            </div>
          ) : null}

          {tab === 'messages' ? (
            <div>
              <h1 className="text-xl font-bold text-zinc-900">Zprávy</h1>
              <p className="mt-2 text-sm text-zinc-600">
                Nepřečtené zprávy: <strong>{unreadMessages}</strong>
              </p>
              <Link href="/profil/zpravy" className="mt-4 inline-flex rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">
                Otevřít schránku
              </Link>
            </div>
          ) : null}

          {tab === 'notifications' ? (
            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h1 className="text-xl font-bold text-zinc-900">Notifikace</h1>
                <button type="button" onClick={() => void loadNotifications()} className="text-xs font-semibold text-[#e85d00] hover:underline">
                  Obnovit
                </button>
              </div>
              {notifLoading ? <p className="text-sm text-zinc-600">Načítám…</p> : null}
              <ul className="space-y-2">
                {notifications.map((n) => (
                  <li key={n.id} className="rounded-lg border border-zinc-200 p-3">
                    <p className="text-sm font-semibold text-zinc-900">{n.title}</p>
                    <p className="mt-1 text-sm text-zinc-600">{n.body}</p>
                    {!n.readAt ? (
                      <button
                        type="button"
                        className="mt-2 text-xs font-semibold text-[#e85d00] hover:underline"
                        onClick={() => {
                          if (!apiAccessToken) return;
                          void nestMarkNotificationRead(apiAccessToken, n.id).then(() => void loadNotifications());
                        }}
                      >
                        Označit jako přečtené
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
