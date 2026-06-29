'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminListingApprovalSettingsGet,
  nestAdminListingApprovalSettingsPatch,
  type ListingApprovalSettings,
} from '@/lib/nest-client';

const FIELDS: Array<{
  key: keyof ListingApprovalSettings;
  label: string;
  hint: string;
}> = [
  {
    key: 'requireNewListingApproval',
    label: 'Vyžadovat schválení nových inzerátů administrátorem',
    hint: 'Vypnuto = nový inzerát je po vložení rovnou ACTIVE.',
  },
  {
    key: 'requireEditApproval',
    label: 'Vyžadovat schválení úprav inzerátu',
    hint: 'Po úpravě schváleného inzerátu se vrátí do stavu čekajícího na schválení.',
  },
  {
    key: 'autoPublishOnCreate',
    label: 'Automaticky publikovat inzerát po vložení',
    hint: 'Platí jen pokud je zapnuté schvalování — umožní výjimky níže.',
  },
  {
    key: 'autoPublishVerifiedUsersOnly',
    label: 'Automaticky publikovat jen inzeráty ověřených uživatelů',
    hint: 'Vyžaduje zapnutou auto-publikaci po vložení.',
  },
  {
    key: 'autoPublishProfessionalsOnly',
    label: 'Automaticky publikovat jen profesionály',
    hint: 'Vyžaduje zapnutou auto-publikaci po vložení.',
  },
  {
    key: 'privateListingsAlwaysPending',
    label: 'Soukromé inzeráty vždy čekají na schválení',
    hint: 'Inzeráty od běžných uživatelů / vlastníků vždy PENDING.',
  },
];

export default function AdminListingSettingsPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [settings, setSettings] = useState<ListingApprovalSettings | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const data = await nestAdminListingApprovalSettingsGet(token);
    if (data) setSettings(data);
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user?.role, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void refresh();
  }, [token, user?.role, refresh]);

  async function toggle(key: keyof ListingApprovalSettings, value: boolean) {
    if (!token) return;
    setBusyKey(key);
    setMsg(null);
    const r = await nestAdminListingApprovalSettingsPatch(token, { [key]: value });
    setBusyKey(null);
    if (!r.ok) {
      setMsg(r.error ?? 'Uložení selhalo.');
      return;
    }
    if (r.data) setSettings(r.data);
    setMsg('Uloženo.');
  }

  if (isLoading) return <div className="min-h-[40vh] bg-zinc-50" />;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm text-zinc-500">
          <Link href="/admin" className="hover:underline">
            Administrace
          </Link>{' '}
          / Nastavení / Inzeráty
        </p>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">Nastavení inzerátů</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Schvalování nových inzerátů a chování po vložení nebo úpravě.
        </p>

        {msg ? (
          <p className="mt-4 rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-800">{msg}</p>
        ) : null}

        <div className="mt-6 space-y-4">
          {settings
            ? FIELDS.map(({ key, label, hint }) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4 rounded border-zinc-300"
                    checked={settings[key]}
                    disabled={busyKey === key}
                    onChange={(e) => void toggle(key, e.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-zinc-900">{label}</span>
                    <span className="mt-1 block text-xs text-zinc-500">{hint}</span>
                  </span>
                </label>
              ))
            : (
                <p className="text-sm text-zinc-500">Načítám nastavení…</p>
              )}
        </div>
      </div>
    </div>
  );
}
