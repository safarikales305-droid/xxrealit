'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { SiteFooter } from '@/components/legal/SiteFooter';
import { PortalTermsHtml } from '@/components/legal/PortalTermsHtml';
import { PresentationSectionBlock } from '@/components/presentation/PresentationSection';
import type { PortalPresentationPage } from '@/lib/portal-presentation';
import { API_BASE_URL } from '@/lib/api';

type Props = {
  page: PortalPresentationPage;
};

function visitorId(): string {
  if (typeof window === 'undefined') return '';
  const key = 'xxr_visitor_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function sessionId(): string {
  if (typeof window === 'undefined') return '';
  const key = 'xxr_session_id';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

async function track(eventType: string, payload?: Record<string, unknown>) {
  const base = API_BASE_URL?.endsWith('/api') ? API_BASE_URL : API_BASE_URL ? `${API_BASE_URL}/api` : null;
  if (!base) return;
  try {
    await fetch(`${base}/portal-presentation/analytics?locale=cs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        eventType,
        visitorId: visitorId(),
        sessionId: sessionId(),
        referrer: typeof document !== 'undefined' ? document.referrer : undefined,
        payload,
      }),
    });
  } catch {
    /* ignore */
  }
}

export function PresentationLanding({ page }: Props) {
  const [navScrolled, setNavScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  const navSections = useMemo(
    () => page.sections.filter((s) => s.sectionType !== 'cta-grid').slice(0, 12),
    [page.sections],
  );

  useEffect(() => {
    void track('page_view', { path: '/o-portalu' });
    const onScroll = () => {
      setNavScrolled(window.scrollY > 24);
      const h = document.documentElement.scrollHeight - window.innerHeight;
      if (h <= 0) return;
      const pct = Math.round((window.scrollY / h) * 100);
      if (pct >= 25 && pct < 30) void track('scroll_depth', { depth: 25 });
      if (pct >= 50 && pct < 55) void track('scroll_depth', { depth: 50 });
      if (pct >= 75 && pct < 80) void track('scroll_depth', { depth: 75 });
      if (pct >= 95) void track('scroll_depth', { depth: 100 });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const onCtaClick = useCallback((anchor: string, label: string) => {
    void track('cta_click', { anchor, label });
  }, []);

  const heroStyle = {
    background: `linear-gradient(145deg, ${page.heroGradientFrom} 0%, ${page.heroGradientTo} 45%, #0f172a 100%)`,
  };

  return (
    <div className="min-h-[100dvh] bg-[#fafafa] text-zinc-900">
      <header
        className={`fixed inset-x-0 top-0 z-50 border-b transition ${
          navScrolled ? 'border-zinc-200/80 bg-white/95 shadow-sm backdrop-blur-md' : 'border-transparent bg-transparent'
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="shrink-0" aria-label="XXREALIT — domů">
            <Logo className={`h-7 w-auto transition ${navScrolled ? '' : 'brightness-0 invert'}`} />
          </Link>
          <nav className="hidden items-center gap-4 lg:flex" aria-label="Sekce stránky">
            {navSections.map((s) => (
              <a
                key={s.anchor}
                href={`#${s.anchor}`}
                className={`text-xs font-semibold transition hover:text-[#ff6a00] ${navScrolled ? 'text-zinc-600' : 'text-white/90'}`}
              >
                {s.title.length > 18 ? `${s.title.slice(0, 16)}…` : s.title}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className={`rounded-full px-3 py-1.5 text-xs font-semibold sm:text-sm ${
                navScrolled ? 'text-zinc-700 hover:bg-zinc-100' : 'text-white hover:bg-white/10'
              }`}
            >
              Přihlásit
            </Link>
            <Link
              href="/registrace"
              onClick={() => onCtaClick('header', 'Registrace')}
              className="rounded-full bg-white px-4 py-1.5 text-xs font-bold text-[#ff6a00] shadow sm:text-sm"
            >
              Registrovat
            </Link>
          </div>
        </div>
      </header>

      <section className="relative flex min-h-[100dvh] items-center overflow-hidden text-white" style={heroStyle}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.12),transparent_45%)]" />
        <div className="pointer-events-none absolute -right-20 top-20 size-72 rounded-full bg-white/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-28 sm:px-6 sm:pt-32">
          <p className="animate-[app-menu-in_0.6s_ease-out] text-sm font-semibold uppercase tracking-[0.2em] text-white/80">
            Představení portálu
          </p>
          <h1 className="mt-4 max-w-4xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            {page.heroTitle}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/90 sm:text-xl">{page.heroSubtitle}</p>
          <div className="mt-10 flex flex-wrap gap-3">
            {page.heroCtaLabel && page.heroCtaUrl ? (
              <Link
                href={page.heroCtaUrl}
                onClick={() => onCtaClick('hero', page.heroCtaLabel ?? '')}
                className="rounded-full bg-white px-7 py-3.5 text-sm font-bold text-[#ff6a00] shadow-xl transition hover:scale-[1.02]"
              >
                {page.heroCtaLabel}
              </Link>
            ) : null}
            {page.heroSecondaryCtaLabel && page.heroSecondaryCtaUrl ? (
              <Link
                href={page.heroSecondaryCtaUrl}
                onClick={() => onCtaClick('hero-secondary', page.heroSecondaryCtaLabel ?? '')}
                className="rounded-full border-2 border-white/40 px-7 py-3.5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/10"
              >
                {page.heroSecondaryCtaLabel}
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {page.sections.map((section, index) => (
        <PresentationSectionBlock
          key={section.id}
          section={section}
          index={index}
          onCtaClick={onCtaClick}
        />
      ))}

      {page.faq.length > 0 ? (
        <section id="faq" className="scroll-mt-24 bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold">Časté dotazy</h2>
            <ul className="mt-10 space-y-3">
              {page.faq.map((item) => (
                <li key={item.id} className="rounded-2xl border border-zinc-200 bg-zinc-50/50">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-bold text-zinc-900"
                    onClick={() => setOpenFaq((o) => (o === item.id ? null : item.id))}
                    aria-expanded={openFaq === item.id}
                  >
                    {item.question}
                    <span className="text-xl text-orange-500">{openFaq === item.id ? '−' : '+'}</span>
                  </button>
                  {openFaq === item.id ? (
                    <div className="border-t border-zinc-200 px-5 py-4">
                      <PortalTermsHtml html={item.answerHtml} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <SiteFooter />
    </div>
  );
}
