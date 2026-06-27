'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { TiptapEditor } from '@/components/admin/TiptapEditor';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminDeletePresentationFaq,
  nestAdminDeletePresentationSection,
  nestAdminGetPresentation,
  nestAdminGetPresentationAnalytics,
  nestAdminReorderPresentationSections,
  nestAdminUpdatePresentationPage,
  nestAdminUpsertPresentationFaq,
  nestAdminUpsertPresentationSection,
  type PortalPresentationPageRow,
  type PresentationAnalyticsSummary,
} from '@/lib/nest-client';

type Tab = 'hero' | 'sections' | 'faq' | 'stats';

export default function AdminPredstaveniPortaluPage() {
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const token = apiAccessToken;

  const [tab, setTab] = useState<Tab>('hero');
  const [page, setPage] = useState<PortalPresentationPageRow | null>(null);
  const [stats, setStats] = useState<PresentationAnalyticsSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionDraft, setSectionDraft] = useState({
    anchor: '',
    sectionType: 'feature',
    title: '',
    subtitle: '',
    bodyHtml: '',
    icon: '',
    ctaLabel: '',
    ctaUrl: '',
    bgStyle: 'white',
    accentColor: '',
    imageUrl: '',
    youtubeUrl: '',
    isVisible: true,
  });

  const refresh = useCallback(async () => {
    if (!token) return;
    const data = await nestAdminGetPresentation(token);
    setPage(data);
  }, [token]);

  const refreshStats = useCallback(async () => {
    if (!token) return;
    const data = await nestAdminGetPresentationAnalytics(token);
    setStats(data);
  }, [token]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') {
      router.replace('/admin');
      return;
    }
    void refresh();
  }, [isLoading, user, router, refresh]);

  useEffect(() => {
    if (tab === 'stats') void refreshStats();
  }, [tab, refreshStats]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function saveHero() {
    if (!token || !page) return;
    setBusy(true);
    setError(null);
    const res = await nestAdminUpdatePresentationPage(token, {
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      metaKeywords: page.metaKeywords ?? undefined,
      ogImageUrl: page.ogImageUrl ?? undefined,
      canonicalUrl: page.canonicalUrl ?? undefined,
      heroTitle: page.heroTitle,
      heroSubtitle: page.heroSubtitle,
      heroCtaLabel: page.heroCtaLabel ?? undefined,
      heroCtaUrl: page.heroCtaUrl ?? undefined,
      heroSecondaryCtaLabel: page.heroSecondaryCtaLabel ?? undefined,
      heroSecondaryCtaUrl: page.heroSecondaryCtaUrl ?? undefined,
      heroImageUrl: page.heroImageUrl ?? undefined,
      heroGradientFrom: page.heroGradientFrom,
      heroGradientTo: page.heroGradientTo,
      contactEmail: page.contactEmail ?? undefined,
      contactPhone: page.contactPhone ?? undefined,
      contactAddress: page.contactAddress ?? undefined,
      isPublished: page.isPublished,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Uložení selhalo');
      return;
    }
    setPage(res.page ?? page);
    setToast('Nastavení uloženo');
  }

  function loadSection(id: string) {
    const s = page?.sections.find((x) => x.id === id);
    if (!s) return;
    setEditingSectionId(id);
    setSectionDraft({
      anchor: s.anchor,
      sectionType: s.sectionType,
      title: s.title,
      subtitle: s.subtitle ?? '',
      bodyHtml: s.bodyHtml,
      icon: s.icon ?? '',
      ctaLabel: s.ctaLabel ?? '',
      ctaUrl: s.ctaUrl ?? '',
      bgStyle: s.bgStyle,
      accentColor: s.accentColor ?? '',
      imageUrl: s.imageUrl ?? '',
      youtubeUrl: s.youtubeUrl ?? '',
      isVisible: s.isVisible,
    });
  }

  async function saveSection() {
    if (!token) return;
    setBusy(true);
    const res = await nestAdminUpsertPresentationSection(token, {
      id: editingSectionId ?? undefined,
      ...sectionDraft,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Uložení sekce selhalo');
      return;
    }
    setToast('Sekce uložena');
    setEditingSectionId(null);
    await refresh();
  }

  async function moveSection(id: string, dir: -1 | 1) {
    if (!token || !page) return;
    const ids = [...page.sections].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => s.id);
    const idx = ids.indexOf(id);
    if (idx < 0) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= ids.length) return;
    [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
    await nestAdminReorderPresentationSections(token, ids);
    await refresh();
  }

  const inputClass =
    'w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20';

  if (!page) {
    return <div className="p-8 text-sm text-zinc-500">Načítám…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-500">Marketing</p>
          <h1 className="text-2xl font-bold text-zinc-900">Představení portálu</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Veřejná stránka:{' '}
            <Link href="/o-portalu" target="_blank" className="font-semibold text-orange-600 hover:underline">
              /o-portalu
            </Link>
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
            page.isPublished ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {page.isPublished ? 'Publikováno' : 'Koncept'}
        </span>
      </div>

      {toast ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{toast}</div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-2">
        {(
          [
            ['hero', 'SEO & Hero'],
            ['sections', 'Sekce'],
            ['faq', 'FAQ'],
            ['stats', 'Statistiky'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === id ? 'bg-orange-500 text-white' : 'bg-zinc-100 text-zinc-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'hero' ? (
        <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          {(
            [
              ['metaTitle', 'META title'],
              ['metaDescription', 'META description'],
              ['metaKeywords', 'META keywords'],
              ['canonicalUrl', 'Canonical URL'],
              ['ogImageUrl', 'OG obrázek URL'],
              ['heroTitle', 'Hero nadpis'],
              ['heroSubtitle', 'Hero podnadpis'],
              ['heroCtaLabel', 'Hero CTA text'],
              ['heroCtaUrl', 'Hero CTA URL'],
              ['heroSecondaryCtaLabel', 'Sekundární CTA text'],
              ['heroSecondaryCtaUrl', 'Sekundární CTA URL'],
              ['contactEmail', 'Kontakt e-mail'],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="mb-1 block text-sm font-semibold">{label}</label>
              <input
                className={inputClass}
                value={(page[key] as string | null) ?? ''}
                onChange={(e) => setPage({ ...page, [key]: e.target.value })}
              />
            </div>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={page.isPublished}
              onChange={(e) => setPage({ ...page, isPublished: e.target.checked })}
            />
            Publikováno (okamžitě viditelné na /o-portalu)
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveHero()}
            className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            Uložit nastavení
          </button>
        </div>
      ) : null}

      {tab === 'sections' ? (
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold uppercase text-zinc-500">Sekce ({page.sections.length})</h2>
            <ul className="mt-3 max-h-[70vh] space-y-2 overflow-y-auto">
              {[...page.sections]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((s) => (
                  <li key={s.id} className="rounded-xl border border-zinc-200 p-2 text-sm">
                    <button type="button" className="w-full text-left font-semibold" onClick={() => loadSection(s.id)}>
                      {s.icon} {s.title}
                    </button>
                    <p className="text-[11px] text-zinc-500">#{s.anchor}</p>
                    <div className="mt-2 flex gap-1">
                      <button type="button" className="text-xs text-zinc-600" onClick={() => void moveSection(s.id, -1)}>
                        ↑
                      </button>
                      <button type="button" className="text-xs text-zinc-600" onClick={() => void moveSection(s.id, 1)}>
                        ↓
                      </button>
                      <button
                        type="button"
                        className="text-xs text-red-600"
                        onClick={async () => {
                          if (!token || !confirm('Smazat sekci?')) return;
                          await nestAdminDeletePresentationSection(token, s.id);
                          await refresh();
                        }}
                      >
                        Smazat
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
            <button
              type="button"
              className="mt-3 w-full rounded-lg border border-dashed border-zinc-300 py-2 text-xs font-semibold"
              onClick={() => {
                setEditingSectionId(null);
                setSectionDraft({
                  anchor: `nova-sekce-${Date.now()}`,
                  sectionType: 'feature',
                  title: 'Nová sekce',
                  subtitle: '',
                  bodyHtml: '<p>Obsah sekce…</p>',
                  icon: '✨',
                  ctaLabel: '',
                  ctaUrl: '',
                  bgStyle: 'white',
                  accentColor: '',
                  imageUrl: '',
                  youtubeUrl: '',
                  isVisible: true,
                });
              }}
            >
              + Nová sekce
            </button>
          </aside>

          <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold">{editingSectionId ? 'Upravit sekci' : 'Nová sekce'}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm font-semibold">Anchor (URL hash)</label>
                <input className={inputClass} value={sectionDraft.anchor} onChange={(e) => setSectionDraft({ ...sectionDraft, anchor: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-semibold">Typ sekce</label>
                <select className={inputClass} value={sectionDraft.sectionType} onChange={(e) => setSectionDraft({ ...sectionDraft, sectionType: e.target.value })}>
                  <option value="feature">Feature</option>
                  <option value="intro">Úvod</option>
                  <option value="benefits-grid">Výhody</option>
                  <option value="process">Proces (JSON kroky)</option>
                  <option value="cta-grid">CTA mřížka (JSON)</option>
                </select>
              </div>
            </div>
            <input className={inputClass} placeholder="Nadpis" value={sectionDraft.title} onChange={(e) => setSectionDraft({ ...sectionDraft, title: e.target.value })} />
            <input className={inputClass} placeholder="Podnadpis" value={sectionDraft.subtitle} onChange={(e) => setSectionDraft({ ...sectionDraft, subtitle: e.target.value })} />
            <input className={inputClass} placeholder="Ikona (emoji)" value={sectionDraft.icon} onChange={(e) => setSectionDraft({ ...sectionDraft, icon: e.target.value })} />
            <TiptapEditor label="Obsah" value={sectionDraft.bodyHtml} onChange={(html) => setSectionDraft({ ...sectionDraft, bodyHtml: html })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <input className={inputClass} placeholder="CTA text" value={sectionDraft.ctaLabel} onChange={(e) => setSectionDraft({ ...sectionDraft, ctaLabel: e.target.value })} />
              <input className={inputClass} placeholder="CTA URL" value={sectionDraft.ctaUrl} onChange={(e) => setSectionDraft({ ...sectionDraft, ctaUrl: e.target.value })} />
              <input className={inputClass} placeholder="Obrázek URL" value={sectionDraft.imageUrl} onChange={(e) => setSectionDraft({ ...sectionDraft, imageUrl: e.target.value })} />
              <input className={inputClass} placeholder="YouTube URL" value={sectionDraft.youtubeUrl} onChange={(e) => setSectionDraft({ ...sectionDraft, youtubeUrl: e.target.value })} />
            </div>
            <button type="button" disabled={busy} onClick={() => void saveSection()} className="rounded-full bg-orange-500 px-5 py-2 text-sm font-bold text-white">
              Uložit sekci
            </button>
          </div>
        </div>
      ) : null}

      {tab === 'faq' ? (
        <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          {page.faq.map((f) => (
            <div key={f.id} className="rounded-xl border border-zinc-200 p-3">
              <p className="font-semibold">{f.question}</p>
              <button
                type="button"
                className="mt-2 text-xs text-red-600"
                onClick={async () => {
                  if (!token) return;
                  await nestAdminDeletePresentationFaq(token, f.id);
                  await refresh();
                }}
              >
                Smazat
              </button>
            </div>
          ))}
          <button
            type="button"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold"
            onClick={async () => {
              if (!token) return;
              const q = window.prompt('Otázka');
              if (!q) return;
              await nestAdminUpsertPresentationFaq(token, { question: q, answerHtml: '<p>Odpověď…</p>' });
              await refresh();
            }}
          >
            + Přidat FAQ
          </button>
        </div>
      ) : null}

      {tab === 'stats' && stats ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-zinc-500">Návštěvy ({stats.days} dní)</p>
            <p className="text-2xl font-bold">{stats.pageViews}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-zinc-500">Unikátní návštěvníci</p>
            <p className="text-2xl font-bold">{stats.uniqueVisitors}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-zinc-500">Kliknutí na CTA</p>
            <p className="text-2xl font-bold">{stats.ctaClicks}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-zinc-500">Celkem událostí</p>
            <p className="text-2xl font-bold">{stats.totalEvents}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
