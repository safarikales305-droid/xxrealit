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

function numField(
  label: string,
  value: number,
  onChange: (v: number) => void,
  hint?: string,
) {
  return (
    <label className="block text-sm font-medium text-zinc-700">
      {label}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
      />
      {hint ? <span className="mt-1 block text-xs text-zinc-500">{hint}</span> : null}
    </label>
  );
}

export default function AdminViewsAutopilotPage() {
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
    setMsg('Globální nastavení autopilota zobrazení uloženo.');
  }

  if (isLoading || !settings) return <div className="min-h-[40vh] bg-zinc-50" />;

  const patch = (partial: Partial<StatisticsSettings>) =>
    setSettings((prev) => (prev ? { ...prev, ...partial } : prev));

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Link href="/admin/statistiky/prehled" className="text-sm font-semibold text-orange-600 hover:underline">
          ← Statistiky
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-zinc-900">Autopilot zobrazení</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Globální pravidla pro automatické přičítání zhlédnutí u shorts a klasických inzerátů.
          Celkem = ruční základ + autopilot + reálná zhlédnutí.
        </p>
        {msg ? <p className="mt-3 text-sm text-zinc-700">{msg}</p> : null}

        <section className="mt-8 space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Shorts inzeráty</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.shortsViewsAutopilotEnabled}
              onChange={(e) => patch({ shortsViewsAutopilotEnabled: e.target.checked })}
            />
            Zapnout autopilot pro shorts
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            {numField('Zobrazení za hodinu (výchozí)', settings.shortsViewsRatePerHour, (v) =>
              patch({ shortsViewsRatePerHour: v }),
            )}
            {numField('Náhodné rozmezí min', settings.shortsViewsRateMin, (v) =>
              patch({ shortsViewsRateMin: v }),
            )}
            {numField('Náhodné rozmezí max', settings.shortsViewsRateMax, (v) =>
              patch({ shortsViewsRateMax: v }),
            )}
            {numField('Interval přičítání (min)', settings.shortsViewsIntervalMinutes, (v) =>
              patch({ shortsViewsIntervalMinutes: v }),
            )}
            {numField('Max za den', settings.shortsViewsMaxPerDay, (v) =>
              patch({ shortsViewsMaxPerDay: v }),
            )}
            {numField('Max celkem na inzerát', settings.shortsViewsMaxTotal, (v) =>
              patch({ shortsViewsMaxTotal: v }),
            )}
          </div>
        </section>

        <section className="mt-6 space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Klasické inzeráty</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.classicViewsAutopilotEnabled}
              onChange={(e) => patch({ classicViewsAutopilotEnabled: e.target.checked })}
            />
            Zapnout autopilot pro klasické inzeráty
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            {numField('Zobrazení za hodinu', settings.classicViewsRatePerHour, (v) =>
              patch({ classicViewsRatePerHour: v }),
            )}
            {numField('Rozmezí min', settings.classicViewsRateMin, (v) =>
              patch({ classicViewsRateMin: v }),
            )}
            {numField('Rozmezí max', settings.classicViewsRateMax, (v) =>
              patch({ classicViewsRateMax: v }),
            )}
            {numField('Interval (min)', settings.classicViewsIntervalMinutes, (v) =>
              patch({ classicViewsIntervalMinutes: v }),
            )}
            {numField('Max za den', settings.classicViewsMaxPerDay, (v) =>
              patch({ classicViewsMaxPerDay: v }),
            )}
            {numField('Max celkem', settings.classicViewsMaxTotal, (v) =>
              patch({ classicViewsMaxTotal: v }),
            )}
          </div>
        </section>

        <section className="mt-6 space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Nový inzerát a ochrana</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {numField('Boost nového inzerátu (hodiny)', settings.newListingBoostHours, (v) =>
              patch({ newListingBoostHours: v }),
            )}
            {numField('Násobitel boostu', settings.newListingBoostMultiplier, (v) =>
              patch({ newListingBoostMultiplier: v }),
            )}
            {numField(
              'Dedup reálných zhlédnutí (hodiny)',
              settings.viewDedupHours,
              (v) => patch({ viewDedupHours: v }),
              'Stejný návštěvník se započítá jen jednou za toto období.',
            )}
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
