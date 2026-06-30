'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminGetStatisticsSettings,
  nestAdminUpdateStatisticsSettings,
  type StatisticsSettings,
} from '@/lib/nest-client';

export default function AdminPostsAutopilotPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [settings, setSettings] = useState<StatisticsSettings | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    const data = await nestAdminGetStatisticsSettings(token);
    if (data) setSettings(data);
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user?.role, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void refresh();
  }, [token, user?.role, refresh]);

  async function save() {
    if (!token || !settings) return;
    setBusy(true);
    setMsg(null);
    const res = await nestAdminUpdateStatisticsSettings(token, settings);
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error ?? 'Uložení selhalo.');
      return;
    }
    setSettings(res.data);
    setMsg('Nastavení autopilota like u příspěvků uloženo.');
  }

  if (isLoading || !settings) return <div className="min-h-[40vh] bg-zinc-50" />;

  const patch = (partial: Partial<StatisticsSettings>) =>
    setSettings((prev) => (prev ? { ...prev, ...partial } : prev));

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link href="/admin/statistiky/prehled" className="text-sm font-semibold text-orange-600 hover:underline">
          ← Statistiky
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-zinc-900">Autopilot příspěvků (like)</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Automatické navyšování počtu like u veřejných příspěvků. Celkem = reálné + ruční +
          autopilot like (bez falešných účtů).
        </p>
        {msg ? <p className="mt-3 text-sm text-zinc-700">{msg}</p> : null}

        <section className="mt-8 space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.postsLikesAutopilotEnabled}
              onChange={(e) => patch({ postsLikesAutopilotEnabled: e.target.checked })}
            />
            Zapnout autopilot like u příspěvků
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-zinc-700">
              Like za hodinu (výchozí)
              <input
                type="number"
                value={settings.postsLikesRatePerHour}
                onChange={(e) => patch({ postsLikesRatePerHour: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-medium text-zinc-700">
              Rozmezí min
              <input
                type="number"
                value={settings.postsLikesRateMin}
                onChange={(e) => patch({ postsLikesRateMin: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-medium text-zinc-700">
              Rozmezí max
              <input
                type="number"
                value={settings.postsLikesRateMax}
                onChange={(e) => patch({ postsLikesRateMax: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-medium text-zinc-700">
              Interval (min)
              <input
                type="number"
                value={settings.postsLikesIntervalMinutes}
                onChange={(e) => patch({ postsLikesIntervalMinutes: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-medium text-zinc-700">
              Max like za den (prvních 24 h)
              <input
                type="number"
                value={settings.postsLikesMaxPerDay}
                onChange={(e) => patch({ postsLikesMaxPerDay: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-medium text-zinc-700">
              Max like po 24 h od zveřejnění
              <input
                type="number"
                value={settings.postsLikesAfter24hMax}
                onChange={(e) => patch({ postsLikesAfter24hMax: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-medium text-zinc-700 sm:col-span-2">
              Max autopilot like na příspěvek celkem
              <input
                type="number"
                value={settings.postsLikesMaxTotal}
                onChange={(e) => patch({ postsLikesMaxTotal: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
          </div>
        </section>

        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="mt-8 rounded-full bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {busy ? 'Ukládám…' : 'Uložit nastavení'}
        </button>
      </div>
    </div>
  );
}
