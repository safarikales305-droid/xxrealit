'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { LoopingVideoWithSound } from '@/components/registration/LoopingVideoWithSound';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  nestAdminRegistrationGateGet,
  nestAdminRegistrationGatePatch,
  nestAdminRegistrationGateUploadBanner,
  nestAdminRegistrationGateUploadVideo,
  nestAdminShortsSignupStats,
  type RegistrationGateAdminSettings,
  type ShortsSignupStats,
} from '@/lib/nest-client';

export default function AdminRegistrationGatePage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [settings, setSettings] = useState<RegistrationGateAdminSettings | null>(null);
  const [stats, setStats] = useState<ShortsSignupStats | null>(null);
  const [statsDays, setStatsDays] = useState(7);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    const data = await nestAdminRegistrationGateGet(token);
    if (!data) {
      setLoadError('Nepodařilo se načíst nastavení.');
      return;
    }
    setSettings(data);
  }, [token]);

  const refreshStats = useCallback(async () => {
    if (!token) return;
    const data = await nestAdminShortsSignupStats(token, statsDays);
    setStats(data);
  }, [token, statsDays]);

  useEffect(() => {
    if (!isLoading && (!token || !user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, token, user, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void refresh();
  }, [token, user?.role, refresh]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void refreshStats();
  }, [token, user?.role, refreshStats]);

  async function save(patch: Partial<RegistrationGateAdminSettings>) {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    const r = await nestAdminRegistrationGatePatch(token, patch);
    setBusy(false);
    if (!r.ok) {
      setMsg(r.error ?? 'Uložení selhalo.');
      return;
    }
    setSettings(r.settings);
    setMsg('Uloženo.');
  }

  async function uploadVideo(file: File) {
    if (!token) return;
    setBusy(true);
    const r = await nestAdminRegistrationGateUploadVideo(token, file);
    setBusy(false);
    if (!r.ok) {
      setMsg(r.error ?? 'Nahrání videa selhalo.');
      return;
    }
    setSettings(r.settings);
    setMsg('Video nahráno.');
  }

  async function uploadBanner(file: File) {
    if (!token) return;
    setBusy(true);
    const r = await nestAdminRegistrationGateUploadBanner(token, file);
    setBusy(false);
    if (!r.ok) {
      setMsg(r.error ?? 'Nahrání banneru selhalo.');
      return;
    }
    setSettings(r.settings);
    setMsg('Banner nahrán.');
  }

  if (isLoading || !settings) {
    return <div className="min-h-[40vh] bg-zinc-50" />;
  }

  const videoPreviewUrl = settings.videoUrl
    ? nestAbsoluteAssetUrl(settings.videoUrl)
    : '';
  const bannerPreviewUrl = settings.bannerImageUrl
    ? nestAbsoluteAssetUrl(settings.bannerImageUrl)
    : '';

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Admin</p>
            <h1 className="text-xl font-bold text-zinc-900">Registrace a výzvy</h1>
          </div>
          <Link href="/admin" className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold">
            ← Administrace
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
        {loadError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</p>
        ) : null}
        {msg ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{msg}</p>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">A) Podmínka prvního obsahu</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Nový uživatel po registraci musí vložit první inzerát nebo tip, jinak je přesměrován na onboarding.
          </p>
          <label className="mt-4 flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={settings.requireFirstContent}
              onChange={(e) => void save({ requireFirstContent: e.target.checked })}
              disabled={busy}
            />
            Vyžadovat první inzerát nebo tip po registraci
          </label>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">B) Výzva ve Shorts (hosté)</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Nepřihlášení uživatelé uvidí výzvu po nastaveném počtu zhlédnutých Shorts. Výzva se opakuje
              pravidelně.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={settings.shortsGateEnabled}
              onChange={(e) => void save({ shortsGateEnabled: e.target.checked })}
              disabled={busy}
            />
            Zapnout výzvu ve Shorts
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Počet zhlédnutých Shorts</span>
            <input
              type="number"
              min={1}
              max={100}
              className="w-full max-w-[8rem] rounded-xl border border-zinc-200 px-3 py-2"
              value={settings.shortsGateAfterViews}
              onChange={(e) =>
                setSettings((s) =>
                  s ? { ...s, shortsGateAfterViews: Number(e.target.value) || 4 } : s,
                )
              }
              onBlur={() => void save({ shortsGateAfterViews: settings.shortsGateAfterViews })}
            />
          </label>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Typ výzvy</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="gateType"
                value="VIDEO"
                checked={settings.gateType.toUpperCase() === 'VIDEO'}
                onChange={() => void save({ gateType: 'VIDEO' })}
                disabled={busy}
              />
              Video
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="gateType"
                value="BANNER"
                checked={settings.gateType.toUpperCase() === 'BANNER'}
                onChange={() => void save({ gateType: 'BANNER' })}
                disabled={busy}
              />
              Banner
            </label>
          </fieldset>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Titulek</span>
            <input
              className="w-full rounded-xl border border-zinc-200 px-3 py-2"
              value={settings.title}
              onChange={(e) => setSettings((s) => (s ? { ...s, title: e.target.value } : s))}
              onBlur={() => void save({ title: settings.title })}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Popis</span>
            <textarea
              rows={3}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2"
              value={settings.description}
              onChange={(e) => setSettings((s) => (s ? { ...s, description: e.target.value } : s))}
              onBlur={() => void save({ description: settings.description })}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Text tlačítka</span>
            <input
              className="w-full rounded-xl border border-zinc-200 px-3 py-2"
              value={settings.buttonText}
              onChange={(e) => setSettings((s) => (s ? { ...s, buttonText: e.target.value } : s))}
              onBlur={() => void save({ buttonText: settings.buttonText })}
              placeholder="Založit účet"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Čas přeskočení videa (sekund)</span>
            <input
              type="number"
              min={0}
              max={120}
              className="w-full max-w-[8rem] rounded-xl border border-zinc-200 px-3 py-2"
              value={settings.skipAfterSeconds}
              onChange={(e) =>
                setSettings((s) =>
                  s ? { ...s, skipAfterSeconds: Number(e.target.value) || 5 } : s,
                )
              }
              onBlur={() => void save({ skipAfterSeconds: settings.skipAfterSeconds })}
            />
          </label>

          <div className="space-y-4 border-t border-zinc-100 pt-4">
            <div>
              <label className="block text-sm font-medium">Nahrát video</label>
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                disabled={busy}
                className="mt-2 block w-full text-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadVideo(f);
                  e.target.value = '';
                }}
              />
              {settings.videoUrl ? (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-zinc-500">URL videa</p>
                  <p className="break-all rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                    {settings.videoUrl}
                  </p>
                  {videoPreviewUrl ? (
                    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-black">
                      <LoopingVideoWithSound
                        src={videoPreviewUrl}
                        className="aspect-video w-full"
                        videoClassName="h-full w-full object-contain"
                        showNativeControls
                      />
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">Zatím není nahráno žádné video.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium">Nahrát banner</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                className="mt-2 block w-full text-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadBanner(f);
                  e.target.value = '';
                }}
              />
              {settings.bannerImageUrl ? (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-zinc-500">URL banneru</p>
                  <p className="break-all rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                    {settings.bannerImageUrl}
                  </p>
                  {bannerPreviewUrl ? (
                    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={bannerPreviewUrl}
                        alt="Náhled banneru výzvy"
                        className="max-h-64 w-full object-contain"
                      />
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">Zatím není nahrán žádný banner.</p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">C) Registrační výzva ze Shorts (e-mail)</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Lehká registrace pouze e-mailem po nastaveném počtu zhlédnutých Shorts. Heslo si uživatel
              nastaví z odkazu v e-mailu.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={settings.emailSignupEnabled}
              onChange={(e) => void save({ emailSignupEnabled: e.target.checked })}
              disabled={busy}
            />
            Aktivní
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Zobrazit po (Shorts)</span>
            <input
              type="number"
              min={1}
              max={100}
              className="w-full max-w-[8rem] rounded-xl border border-zinc-200 px-3 py-2"
              value={settings.emailSignupAfterViews}
              onChange={(e) =>
                setSettings((s) =>
                  s ? { ...s, emailSignupAfterViews: Number(e.target.value) || 10 } : s,
                )
              }
              onBlur={() => void save({ emailSignupAfterViews: settings.emailSignupAfterViews })}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Titulek</span>
            <input
              className="w-full rounded-xl border border-zinc-200 px-3 py-2"
              value={settings.emailSignupTitle}
              onChange={(e) => setSettings((s) => (s ? { ...s, emailSignupTitle: e.target.value } : s))}
              onBlur={() => void save({ emailSignupTitle: settings.emailSignupTitle })}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Text</span>
            <textarea
              rows={2}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2"
              value={settings.emailSignupDescription}
              onChange={(e) =>
                setSettings((s) => (s ? { ...s, emailSignupDescription: e.target.value } : s))
              }
              onBlur={() => void save({ emailSignupDescription: settings.emailSignupDescription })}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Tlačítko</span>
            <input
              className="w-full rounded-xl border border-zinc-200 px-3 py-2"
              value={settings.emailSignupButtonText}
              onChange={(e) =>
                setSettings((s) => (s ? { ...s, emailSignupButtonText: e.target.value } : s))
              }
              onBlur={() => void save({ emailSignupButtonText: settings.emailSignupButtonText })}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Text odmítnutí</span>
            <input
              className="w-full rounded-xl border border-zinc-200 px-3 py-2"
              value={settings.emailSignupDismissText}
              onChange={(e) =>
                setSettings((s) => (s ? { ...s, emailSignupDismissText: e.target.value } : s))
              }
              onBlur={() => void save({ emailSignupDismissText: settings.emailSignupDismissText })}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Znovu zobrazit po odmítnutí (dny)</span>
            <input
              type="number"
              min={1}
              max={90}
              className="w-full max-w-[8rem] rounded-xl border border-zinc-200 px-3 py-2"
              value={settings.emailSignupDismissCooldownDays}
              onChange={(e) =>
                setSettings((s) =>
                  s
                    ? { ...s, emailSignupDismissCooldownDays: Number(e.target.value) || 7 }
                    : s,
                )
              }
              onBlur={() =>
                void save({ emailSignupDismissCooldownDays: settings.emailSignupDismissCooldownDays })
              }
            />
          </label>

          <div className="grid gap-4 border-t border-zinc-100 pt-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Náhled desktop
              </p>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="mx-auto w-full max-w-sm rounded-2xl bg-white p-5 shadow-md">
                  <h3 className="text-lg font-bold text-zinc-900">{settings.emailSignupTitle}</h3>
                  <p className="mt-1 text-sm text-zinc-600">{settings.emailSignupDescription}</p>
                  <div className="mt-4 h-10 rounded-xl border border-zinc-300 bg-white" />
                  <div className="mt-3 h-10 rounded-xl bg-orange-600" />
                  <p className="mt-2 text-center text-xs text-zinc-500">{settings.emailSignupDismissText}</p>
                </div>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Náhled mobil
              </p>
              <div className="mx-auto max-w-[220px] rounded-[2rem] border-4 border-zinc-800 bg-zinc-800 p-2">
                <div className="rounded-[1.25rem] bg-black/40 p-3">
                  <div className="rounded-2xl bg-white p-4">
                    <h3 className="text-sm font-bold text-zinc-900">{settings.emailSignupTitle}</h3>
                    <p className="mt-1 text-xs text-zinc-600">{settings.emailSignupDescription}</p>
                    <div className="mt-3 h-9 rounded-lg border border-zinc-300" />
                    <div className="mt-2 h-9 rounded-lg bg-orange-600" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 border-t border-zinc-100 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-zinc-900">Statistiky konverze</h3>
              <div className="flex gap-2">
                {[1, 7, 30].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      statsDays === d
                        ? 'bg-orange-600 text-white'
                        : 'border border-zinc-300 bg-white text-zinc-700'
                    }`}
                    onClick={() => setStatsDays(d)}
                  >
                    {d === 1 ? 'Dnes' : `${d} dní`}
                  </button>
                ))}
              </div>
            </div>

            {stats ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ['Popup zobrazen', stats.counts.popupShown],
                    ['E-mail zadán', stats.counts.submitted],
                    ['Nové účty', stats.counts.success],
                    ['Nastavené heslo', stats.counts.passwordSet],
                    ['Odmítnuto', stats.counts.dismissed],
                    ['E-maily odeslány', stats.counts.passwordEmails],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
                      <p className="mt-1 text-2xl font-bold text-zinc-900">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-zinc-200 px-4 py-3 text-sm">
                    <p>Popup → e-mail: <strong>{stats.conversion.emailSubmitRate}%</strong></p>
                    <p>Popup → registrace: <strong>{stats.conversion.registrationRate}%</strong></p>
                  </div>
                  <div className="rounded-xl border border-zinc-200 px-4 py-3 text-sm">
                    <p>Registrace → heslo: <strong>{stats.conversion.passwordCompletionRate}%</strong></p>
                    <p>Popup → odmítnutí: <strong>{stats.conversion.dismissRate}%</strong></p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-zinc-500">Statistiky se načítají…</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
