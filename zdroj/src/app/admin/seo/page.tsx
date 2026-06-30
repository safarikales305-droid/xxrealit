'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminSeoBackfillSlugs,
  nestAdminSeoHealth,
  nestAdminSeoSettings,
  nestAdminSeoUpdateSettings,
  type NestSeoHealth,
  type NestSeoSettings,
} from '@/lib/nest-client';

export default function AdminSeoPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [settings, setSettings] = useState<NestSeoSettings | null>(null);
  const [health, setHealth] = useState<NestSeoHealth | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [s, h] = await Promise.all([nestAdminSeoSettings(token), nestAdminSeoHealth(token)]);
    setSettings(s);
    setHealth(h);
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function save(patch: Partial<NestSeoSettings>) {
    if (!token) return;
    setBusy(true);
    const r = await nestAdminSeoUpdateSettings(token, patch);
    setBusy(false);
    if (r) {
      setSettings(r);
      setMsg('SEO nastavení uloženo.');
    }
  }

  if (!token || user?.role !== 'ADMIN') return null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/admin" className="text-sm text-zinc-500 hover:underline">
        ← Administrace
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-zinc-900">SEO nastavení portálu</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Globální metadata, analytika, webmaster nástroje a SEO zdraví portálu XXREALIT.
      </p>
      <p className="mt-2">
        <Link href="/admin/seo/indexace" className="text-sm font-semibold text-orange-600 hover:underline">
          Přehled indexace veřejného obsahu →
        </Link>
      </p>

      {health ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-3xl font-bold text-orange-600">{health.seoScore}%</p>
            <p className="text-sm text-zinc-600">SEO skóre</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-3xl font-bold">{health.indexedListings}</p>
            <p className="text-sm text-zinc-600">Indexovaných inzerátů (se slug)</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-3xl font-bold">{health.missingMetaTitle}</p>
            <p className="text-sm text-zinc-600">Chybí meta title</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-3xl font-bold">{health.missingMetaDescription}</p>
            <p className="text-sm text-zinc-600">Chybí meta description</p>
          </div>
        </div>
      ) : null}

      {msg ? (
        <p className="mt-4 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm">{msg}</p>
      ) : null}

      {settings ? (
        <form
          className="mt-8 space-y-4 rounded-2xl border border-zinc-200 bg-white p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void save({
              defaultTitle: String(fd.get('defaultTitle') ?? ''),
              defaultDescription: String(fd.get('defaultDescription') ?? ''),
              googleAnalyticsId: String(fd.get('googleAnalyticsId') ?? '') || null,
              googleTagManagerId: String(fd.get('googleTagManagerId') ?? '') || null,
              googleSearchConsoleVerification:
                String(fd.get('googleSearchConsoleVerification') ?? '') || null,
              metaPixelId: String(fd.get('metaPixelId') ?? '') || null,
              seznamWebmasterVerification:
                String(fd.get('seznamWebmasterVerification') ?? '') || null,
              bingWebmasterVerification:
                String(fd.get('bingWebmasterVerification') ?? '') || null,
              yandexVerification: String(fd.get('yandexVerification') ?? '') || null,
              tiktokPixelId: String(fd.get('tiktokPixelId') ?? '') || null,
              linkedInInsightId: String(fd.get('linkedInInsightId') ?? '') || null,
              robotsIndex: fd.get('robotsIndex') === 'on',
              cookieConsentEnabled: fd.get('cookieConsentEnabled') === 'on',
            });
          }}
        >
          <h2 className="font-semibold">Globální metadata</h2>
          <input
            name="defaultTitle"
            defaultValue={settings.defaultTitle}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="Výchozí title"
          />
          <textarea
            name="defaultDescription"
            defaultValue={settings.defaultDescription}
            rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="Výchozí description"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="robotsIndex" defaultChecked={settings.robotsIndex} />
            Povolit indexaci (robots index)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="cookieConsentEnabled"
              defaultChecked={settings.cookieConsentEnabled}
            />
            Cookie consent banner
          </label>

          <h2 className="pt-4 font-semibold">Analytika a pixely</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {(
              [
                ['googleAnalyticsId', 'Google Analytics (GA4)'],
                ['googleTagManagerId', 'Google Tag Manager'],
                ['metaPixelId', 'Meta Pixel'],
                ['tiktokPixelId', 'TikTok Pixel'],
                ['linkedInInsightId', 'LinkedIn Insight'],
              ] as const
            ).map(([key, label]) => (
              <input
                key={key}
                name={key}
                defaultValue={settings[key] ?? ''}
                className="rounded-lg border px-3 py-2 text-sm"
                placeholder={label}
              />
            ))}
          </div>

          <h2 className="pt-4 font-semibold">Webmaster ověření</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {(
              [
                ['googleSearchConsoleVerification', 'Google Search Console'],
                ['seznamWebmasterVerification', 'Seznam Webmaster'],
                ['bingWebmasterVerification', 'Bing Webmaster'],
                ['yandexVerification', 'Yandex'],
              ] as const
            ).map(([key, label]) => (
              <input
                key={key}
                name={key}
                defaultValue={settings[key] ?? ''}
                className="rounded-lg border px-3 py-2 text-sm"
                placeholder={label}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white"
            >
              {busy ? 'Ukládám…' : 'Uložit nastavení'}
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-semibold"
              onClick={() => void nestAdminSeoBackfillSlugs(token).then(() => refresh())}
            >
              Doplnit SEO slugy inzerátů
            </button>
          </div>
        </form>
      ) : null}

      <p className="mt-6 text-xs text-zinc-500">
        Sitemap: <a href="/sitemap.xml" className="underline">/sitemap.xml</a> · Robots:{' '}
        <a href="/robots.txt" className="underline">/robots.txt</a>
      </p>
    </main>
  );
}
