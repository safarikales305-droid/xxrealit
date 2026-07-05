'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminRegistrationGamificationGet,
  nestAdminRegistrationGamificationPatch,
  nestAdminRegistrationGamificationStats,
  type RegistrationGamificationAdminSettings,
} from '@/lib/nest-client';

export default function AdminRegistrationGamificationPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [settings, setSettings] = useState<RegistrationGamificationAdminSettings | null>(null);
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [s, st] = await Promise.all([
      nestAdminRegistrationGamificationGet(token),
      nestAdminRegistrationGamificationStats(token),
    ]);
    setSettings(s);
    setStats(st);
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || !user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, token, user, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void refresh();
  }, [token, user?.role, refresh]);

  async function save(patch: Partial<RegistrationGamificationAdminSettings>) {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    const r = await nestAdminRegistrationGamificationPatch(token, patch);
    setBusy(false);
    if (!r.ok) {
      setMsg(r.error ?? 'Uložení selhalo.');
      return;
    }
    setSettings(r.settings);
    setMsg('Uloženo.');
    void refresh();
  }

  if (!settings) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-zinc-600">
        {msg ?? 'Načítám…'}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <Link href="/admin" className="text-sm font-bold text-[#e85d00]">
              ← Admin
            </Link>
            <h1 className="text-lg font-bold">🎮 Gamifikace registrace</h1>
          </div>
          <Link
            href="/admin/marketing/leady-z-her"
            className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-bold"
          >
            Leady z her
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        {msg ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
            {msg}
          </p>
        ) : null}

        {stats ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ['Spuštění', stats.gameStarts],
                ['Dokončení', stats.gameCompletions],
                ['E-maily', stats.emailsCollected],
                ['Konverze %', stats.conversionRate],
              ] as Array<[string, string | number | null | undefined]>
            ).map(([label, val]) => (
              <div key={String(label)} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase text-zinc-500">{label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{String(val ?? '—')}</p>
              </div>
            ))}
          </div>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => void save({ enabled: e.target.checked })}
            />
            Zapnout hru „Staň se realitním magnátem“
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold text-zinc-600">
              Komu zobrazit
              <select
                value={settings.audience}
                onChange={(e) => setSettings({ ...settings, audience: e.target.value })}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              >
                <option value="GUESTS_ONLY">Pouze hostům</option>
                <option value="UNAUTHENTICATED">Nepřihlášeným</option>
                <option value="ALL">Všem</option>
              </select>
            </label>
            <label className="text-xs font-bold text-zinc-600">
              Jak často
              <select
                value={settings.frequency}
                onChange={(e) => setSettings({ ...settings, frequency: e.target.value })}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              >
                <option value="ONCE">Pouze jednou</option>
                <option value="DAILY">Jednou za den</option>
                <option value="WEEKLY">Jednou za týden</option>
                <option value="EVERY_VISIT">Při každé návštěvě</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            {(
              [
                ['showOnHome', 'Hlavní stránka'],
                ['showOnShorts', 'Shorts'],
                ['showOnClassic', 'Klasik inzeráty'],
                ['showOnPosts', 'Příspěvky'],
                ['showOnProfessionalProfile', 'Profil profesionála'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1.5">
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold text-zinc-600">
              Spustit po
              <select
                value={settings.triggerType}
                onChange={(e) => setSettings({ ...settings, triggerType: e.target.value })}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              >
                <option value="SHORTS_VIEWS">Zobrazených Shorts</option>
                <option value="SECONDS_ON_SITE">Sekundách na webu</option>
                <option value="PAGES_VISITED">Navštívených stránkách</option>
              </select>
            </label>
            <label className="text-xs font-bold text-zinc-600">
              Hodnota triggeru
              <input
                type="number"
                min={1}
                value={
                  settings.triggerType === 'SHORTS_VIEWS'
                    ? settings.triggerShortsViews
                    : settings.triggerType === 'SECONDS_ON_SITE'
                      ? settings.triggerSecondsOnSite
                      : settings.triggerPagesVisited
                }
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (settings.triggerType === 'SHORTS_VIEWS') {
                    setSettings({ ...settings, triggerShortsViews: n });
                  } else if (settings.triggerType === 'SECONDS_ON_SITE') {
                    setSettings({ ...settings, triggerSecondsOnSite: n });
                  } else {
                    setSettings({ ...settings, triggerPagesVisited: n });
                  }
                }}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-xs font-bold text-zinc-600">
              Počet rozhodnutí
              <input
                type="number"
                min={4}
                max={15}
                value={settings.decisionsCount}
                onChange={(e) => setSettings({ ...settings, decisionsCount: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-bold text-zinc-600">
              Bonus kreditů
              <input
                type="number"
                min={0}
                value={settings.bonusCredits}
                onChange={(e) => setSettings({ ...settings, bonusCredits: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-bold text-zinc-600">
              Interval nabídek (s)
              <input
                type="number"
                min={1}
                value={settings.offerIntervalSec}
                onChange={(e) => setSettings({ ...settings, offerIntervalSec: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block text-xs font-bold text-zinc-600">
            Popis bonusu
            <input
              value={settings.bonusDescription}
              onChange={(e) => setSettings({ ...settings, bonusDescription: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.autoEmailMarketing}
                onChange={(e) => setSettings({ ...settings, autoEmailMarketing: e.target.checked })}
              />
              Auto e-mail marketing
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.autoWhatsAppCampaign}
                onChange={(e) => setSettings({ ...settings, autoWhatsAppCampaign: e.target.checked })}
              />
              Auto WhatsApp (při telefonu)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.autoCrm}
                onChange={(e) => setSettings({ ...settings, autoCrm: e.target.checked })}
              />
              Auto CRM / databáze kontaktů
            </label>
          </div>

          <label className="block text-xs font-bold text-zinc-600">
            Úvodní text hry
            <textarea
              rows={3}
              value={settings.config.introText}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  config: { ...settings.config, introText: e.target.value },
                })
              }
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-zinc-600">
              Barva primární
              <input
                type="color"
                value={settings.config.colors.primary}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    config: {
                      ...settings.config,
                      colors: { ...settings.config.colors, primary: e.target.value },
                    },
                  })
                }
                className="mt-1 h-10 w-full"
              />
            </label>
            <label className="text-xs font-bold text-zinc-600">
              Barva pozadí
              <input
                type="color"
                value={settings.config.colors.background}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    config: {
                      ...settings.config,
                      colors: { ...settings.config.colors, background: e.target.value },
                    },
                  })
                }
                className="mt-1 h-10 w-full"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void save(settings)}
            className="rounded-full bg-[#e85d00] px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Ukládám…' : 'Uložit nastavení'}
          </button>
        </section>
      </main>
    </div>
  );
}
