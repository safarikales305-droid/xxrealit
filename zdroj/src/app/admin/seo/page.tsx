'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminSeoDashboard,
  nestAdminSeoHealth,
  nestAdminSeoSettings,
  nestAdminSeoUpdateSettings,
  type NestSeoSettings,
  type SeoDashboard,
} from '@/lib/nest-client';

function StatCard({ value, label, warn }: { value: string | number; label: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <p className={`text-2xl font-bold ${warn ? 'text-red-600' : 'text-zinc-900'}`}>{value}</p>
      <p className="text-sm text-zinc-600">{label}</p>
    </div>
  );
}

export default function AdminSeoDashboardPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [settings, setSettings] = useState<NestSeoSettings | null>(null);
  const [dashboard, setDashboard] = useState<SeoDashboard | null>(null);
  const [health, setHealth] = useState<Awaited<ReturnType<typeof nestAdminSeoHealth>>>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [s, d, h] = await Promise.all([
      nestAdminSeoSettings(token),
      nestAdminSeoDashboard(token),
      nestAdminSeoHealth(token),
    ]);
    setSettings(s);
    setDashboard(d);
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
    <>
      <p className="mb-6 text-sm text-zinc-600">
        Přehled programatického SEO, analytiky a zdraví portálu XXREALIT.
      </p>

      {dashboard ? (
        <>
          <h2 className="mb-3 text-lg font-semibold">Programatické SEO stránky</h2>
          <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <StatCard value={dashboard.totalPages} label="Celkem SEO stránek" />
            <StatCard value={dashboard.indexed} label="Indexovaných" />
            <StatCard value={dashboard.notIndexed} label="Neindexovaných" warn />
            <StatCard value={dashboard.withoutTitle} label="Bez Meta Title" warn />
            <StatCard value={dashboard.withoutDescription} label="Bez Description" warn />
            <StatCard value={dashboard.withoutH1} label="Bez H1" warn />
            <StatCard value={dashboard.withoutFaq} label="Bez FAQ" warn />
            <StatCard value={dashboard.withoutOg} label="Bez OG" warn />
            <StatCard value={dashboard.withoutSchema} label="Bez Schema" warn />
            <StatCard value={dashboard.withoutCanonical} label="Bez Canonical" warn />
            <StatCard value={dashboard.errors404} label="404" />
            <StatCard value={dashboard.redirects301} label="301 přesměrování" />
            <StatCard value={dashboard.duplicateUrls} label="Duplicitní URL" warn />
            <StatCard value={dashboard.duplicateH1} label="Duplicitní H1" warn />
            <StatCard value={dashboard.duplicateDescription} label="Duplicitní Description" warn />
            <StatCard value={dashboard.clicks} label="Kliknutí (GSC)" />
            <StatCard value={`${dashboard.ctr}%`} label="CTR" />
            <StatCard value={dashboard.avgPosition ?? '—'} label="Průměrná pozice" />
          </div>

          <div className="mb-8 grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-zinc-200 bg-white p-4">
              <h3 className="font-semibold">Nejlepší stránky</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {dashboard.topPages.length ? (
                  dashboard.topPages.map((p) => (
                    <li key={p.pageKey} className="flex justify-between">
                      <span className="truncate">{p.pageKey}</span>
                      <span className="text-zinc-500">{p.clicks} kliků</span>
                    </li>
                  ))
                ) : (
                  <li className="text-zinc-500">Zatím bez dat</li>
                )}
              </ul>
            </section>
            <section className="rounded-2xl border border-zinc-200 bg-white p-4">
              <h3 className="font-semibold">Nejhorší stránky (pozice)</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {dashboard.worstPages.length ? (
                  dashboard.worstPages.map((p) => (
                    <li key={p.pageKey} className="flex justify-between">
                      <span className="truncate">{p.pageKey}</span>
                      <span className="text-zinc-500">poz. {p.position ?? '—'}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-zinc-500">Zatím bez dat</li>
                )}
              </ul>
            </section>
          </div>

          <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-4">
            <h3 className="font-semibold">Nové stránky</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {dashboard.newPages.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <Link href={`/admin/seo/stranky/${p.id}`} className="text-orange-600 hover:underline">
                    {p.title ?? p.pageKey}
                  </Link>
                  <span className="text-zinc-500">{p.status}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      {health ? (
        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard value={health.programmaticSeoPages ?? '—'} label="Programatických URL (sitemap)" />
          <StatCard value={`${health.seoScore}%`} label="SEO skóre inzerátů" />
          <StatCard value={health.indexedListings} label="Indexovaných inzerátů" />
          <StatCard value={health.missingMetaTitle} label="Inzerátů bez meta title" warn />
        </div>
      ) : null}

      {msg ? (
        <p className="mb-4 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm">{msg}</p>
      ) : null}

      {settings ? (
        <form
          className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5"
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
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white"
          >
            {busy ? 'Ukládám…' : 'Uložit nastavení'}
          </button>
        </form>
      ) : null}
    </>
  );
}
