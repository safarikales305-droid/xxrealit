'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminRegistrationGateGet,
  nestAdminRegistrationGatePatch,
  nestAdminRegistrationGateUploadBanner,
  nestAdminRegistrationGateUploadVideo,
  type RegistrationGateAdminSettings,
} from '@/lib/nest-client';

export default function AdminRegistrationGatePage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [settings, setSettings] = useState<RegistrationGateAdminSettings | null>(null);
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

  useEffect(() => {
    if (!isLoading && (!token || !user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, token, user, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void refresh();
  }, [token, user?.role, refresh]);

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

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900">B) Výzva ve Shorts (hosté)</h2>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={settings.shortsGateEnabled}
              onChange={(e) => void save({ shortsGateEnabled: e.target.checked })}
              disabled={busy}
            />
            Zapnout výzvu k registraci ve Shorts
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

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Typ výzvy</span>
            <select
              className="w-full max-w-xs rounded-xl border border-zinc-200 px-3 py-2"
              value={settings.gateType}
              onChange={(e) => void save({ gateType: e.target.value })}
              disabled={busy}
            >
              <option value="BANNER">Banner</option>
              <option value="VIDEO">Video</option>
            </select>
          </label>

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
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Skip po sekundách (video)</span>
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

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Nahrát video</span>
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadVideo(f);
                  e.target.value = '';
                }}
              />
              {settings.videoUrl ? (
                <p className="mt-1 truncate text-xs text-zinc-500">{settings.videoUrl}</p>
              ) : null}
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Nahrát banner</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadBanner(f);
                  e.target.value = '';
                }}
              />
              {settings.bannerImageUrl ? (
                <p className="mt-1 truncate text-xs text-zinc-500">{settings.bannerImageUrl}</p>
              ) : null}
            </label>
          </div>
        </section>
      </main>
    </div>
  );
}
