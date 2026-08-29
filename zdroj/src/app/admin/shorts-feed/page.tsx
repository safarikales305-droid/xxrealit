'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminShortsFeedSettingsGet,
  nestAdminShortsFeedSettingsPatch,
  type ShortsFeedSettings,
} from '@/lib/nest-client';

const TOGGLE_FIELDS: Array<{
  key: keyof Pick<
    ShortsFeedSettings,
    | 'showProperties'
    | 'showYoutube'
    | 'showArticles'
    | 'showNews'
    | 'showEditorial'
    | 'showUserPosts'
    | 'showFinanceNews'
  >;
  label: string;
}> = [
  { key: 'showProperties', label: 'Zobrazovat reality' },
  { key: 'showYoutube', label: 'Zobrazovat YouTube' },
  { key: 'showArticles', label: 'Zobrazovat články' },
  { key: 'showNews', label: 'Zobrazovat aktuality' },
  { key: 'showEditorial', label: 'Zobrazovat AI redakci' },
  { key: 'showUserPosts', label: 'Zobrazovat uživatelské příspěvky' },
  { key: 'showFinanceNews', label: 'Zobrazovat finanční aktuality' },
];

export default function AdminShortsFeedSettingsPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [settings, setSettings] = useState<ShortsFeedSettings | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    const data = await nestAdminShortsFeedSettingsGet(token);
    if (data) setSettings(data);
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user?.role, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void refresh();
  }, [token, user?.role, refresh]);

  async function save(patch: Partial<ShortsFeedSettings>) {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    const r = await nestAdminShortsFeedSettingsPatch(token, patch);
    setBusy(false);
    if (!r.ok) {
      setMsg(r.error ?? 'Uložení selhalo.');
      return;
    }
    if (r.data) setSettings(r.data);
    setMsg('Uloženo.');
  }

  if (isLoading || !settings) return <div className="min-h-[40vh] bg-zinc-50" />;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm text-zinc-500">
          <Link href="/admin" className="hover:underline">
            Administrace
          </Link>{' '}
          / Shorts / Nastavení feedu
        </p>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">Shorts — nastavení feedu</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Smíšený vertikální feed na homepage (záložka Shorts). Reality mají prioritu, ostatní obsah
          doplňuje feed podle poměru.
        </p>

        {msg ? <p className="mt-4 text-sm text-emerald-700">{msg}</p> : null}

        <section className="mt-8 space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-800">Typy obsahu</h2>
          {TOGGLE_FIELDS.map((field) => (
            <label key={field.key} className="flex items-center gap-3 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={settings[field.key]}
                disabled={busy}
                onChange={(e) => void save({ [field.key]: e.target.checked })}
              />
              {field.label}
            </label>
          ))}
        </section>

        <section className="mt-6 space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-800">Algoritmus míchání</h2>
          <label className="block text-sm text-zinc-700">
            <span className="mb-1 block font-medium">Priorita realit</span>
            <select
              className="w-full rounded-lg border border-zinc-300 px-3 py-2"
              value={settings.propertyPriority}
              disabled={busy}
              onChange={(e) =>
                void save({
                  propertyPriority: e.target.value as ShortsFeedSettings['propertyPriority'],
                })
              }
            >
              <option value="high">Vysoká</option>
              <option value="medium">Střední</option>
              <option value="low">Nízká</option>
            </select>
          </label>
          <label className="block text-sm text-zinc-700">
            <span className="mb-1 block font-medium">Obsahová položka každých (položek)</span>
            <input
              type="number"
              min={2}
              max={12}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2"
              value={settings.contentEveryNItems}
              disabled={busy}
              onChange={(e) =>
                void save({ contentEveryNItems: Number.parseInt(e.target.value, 10) || 3 })
              }
            />
          </label>
          <label className="block text-sm text-zinc-700">
            <span className="mb-1 block font-medium">Minimální podíl realit (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2"
              value={settings.minPropertyRatioPercent}
              disabled={busy}
              onChange={(e) =>
                void save({ minPropertyRatioPercent: Number.parseInt(e.target.value, 10) || 70 })
              }
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ['propertyRatioTierLow', '0–10 realit (%)'],
                ['propertyRatioTierMid', '10–50 realit (%)'],
                ['propertyRatioTierHigh', '50+ realit (%)'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm text-zinc-700">
                <span className="mb-1 block text-xs font-medium">{label}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2"
                  value={settings[key]}
                  disabled={busy}
                  onChange={(e) =>
                    void save({ [key]: Number.parseInt(e.target.value, 10) || 50 } as Partial<ShortsFeedSettings>)
                  }
                />
              </label>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
