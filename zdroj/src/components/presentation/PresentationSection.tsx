'use client';

import Link from 'next/link';
import { PortalTermsHtml } from '@/components/legal/PortalTermsHtml';
import { SupportContactButton } from '@/components/support/SupportContactButton';
import type { PortalPresentationSection } from '@/lib/portal-presentation';

type ProcessStep = { step: number; title: string; text: string };
type CtaItem = { label: string; url: string };

function isSupportUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u === 'support:' || u === '#support' || u.startsWith('mailto:');
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function sectionBg(bgStyle: string, accent?: string | null) {
  if (bgStyle === 'gradient') {
    const c = accent ?? '#ff6a00';
    return {
      isDark: true,
      className: 'text-white',
      style: {
        background: `linear-gradient(135deg, ${c} 0%, #1e1b4b 100%)`,
      } as React.CSSProperties,
    };
  }
  if (bgStyle === 'muted') {
    return { isDark: false, className: 'bg-zinc-50 text-zinc-900', style: undefined };
  }
  return { isDark: false, className: 'bg-white text-zinc-900', style: undefined };
}

type Props = {
  section: PortalPresentationSection;
  index: number;
  onCtaClick?: (anchor: string, label: string) => void;
};

export function PresentationSectionBlock({ section, index, onCtaClick }: Props) {
  const bg = sectionBg(section.bgStyle, section.accentColor);
  const isEven = index % 2 === 0;

  if (section.sectionType === 'process') {
    const steps = parseJson<ProcessStep[]>(section.bodyHtml, []);
    return (
      <section id={section.anchor} className={`scroll-mt-24 py-16 sm:py-20 ${bg.className}`} style={bg.style}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <header className="text-center">
            {section.icon ? <span className="text-4xl">{section.icon}</span> : null}
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">{section.title}</h2>
            {section.subtitle ? (
              <p className="mt-3 text-lg text-white/90">{section.subtitle}</p>
            ) : null}
          </header>
          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {steps.map((step) => (
              <li
                key={step.step}
                className={`relative rounded-2xl border p-5 ${
                  bg.isDark
                    ? 'border-white/25 bg-white/10 backdrop-blur-sm'
                    : 'border-orange-200 bg-orange-50/80'
                }`}
              >
                <span
                  className={`flex size-10 items-center justify-center rounded-full text-lg font-bold ${
                    bg.isDark ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-700'
                  }`}
                >
                  {step.step}
                </span>
                <h3 className={`mt-4 text-lg font-bold ${bg.isDark ? 'text-white' : 'text-zinc-900'}`}>
                  {step.title}
                </h3>
                <p className={`mt-2 text-sm leading-relaxed ${bg.isDark ? 'text-white/85' : 'text-zinc-600'}`}>
                  {step.text}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    );
  }

  if (section.sectionType === 'cta-grid') {
    const ctas = parseJson<CtaItem[]>(section.bodyHtml, []);
    return (
      <section id={section.anchor} className={`scroll-mt-24 py-16 sm:py-24 ${bg.className}`} style={bg.style}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <header className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{section.title}</h2>
            {section.subtitle ? (
              <p className="mt-3 text-lg text-white/90">{section.subtitle}</p>
            ) : null}
          </header>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ctas.map((cta) =>
              isSupportUrl(cta.url) ? (
                <div key={cta.label} className="flex justify-center">
                  <SupportContactButton
                    label={cta.label}
                    className="w-full rounded-2xl border border-white/30 bg-white/15 px-5 py-4 text-center text-sm font-bold text-white backdrop-blur transition hover:scale-[1.02] hover:border-white/50 hover:bg-white/25"
                  />
                </div>
              ) : (
                <Link
                  key={cta.label}
                  href={cta.url}
                  onClick={() => onCtaClick?.(section.anchor, cta.label)}
                  className="rounded-2xl border border-white/30 bg-white/15 px-5 py-4 text-center text-sm font-bold text-white backdrop-blur transition hover:scale-[1.02] hover:border-white/50 hover:bg-white/25"
                >
                  {cta.label}
                </Link>
              ),
            )}
          </div>
        </div>
      </section>
    );
  }

  const gridClass =
    section.sectionType === 'benefits-grid'
      ? 'lg:grid-cols-1'
      : `lg:grid-cols-2 ${isEven ? '' : 'lg:[&>div:first-child]:order-2'}`;

  return (
    <section id={section.anchor} className={`scroll-mt-24 py-16 sm:py-20 ${bg.className}`} style={bg.style}>
      <div className={`mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 ${gridClass}`}>
        <div className={section.sectionType === 'benefits-grid' ? 'max-w-3xl' : ''}>
          <div className="flex items-start gap-3">
            {section.icon ? (
              <span
                className={`flex size-12 shrink-0 items-center justify-center rounded-2xl text-2xl ${
                  bg.isDark ? 'bg-white/15' : 'bg-orange-500/15'
                }`}
              >
                {section.icon}
              </span>
            ) : null}
            <div>
              <h2 className={`text-2xl font-bold tracking-tight sm:text-3xl ${bg.isDark ? 'text-white' : 'text-zinc-900'}`}>
                {section.title}
              </h2>
              {section.subtitle ? (
                <p className={`mt-2 text-base sm:text-lg ${bg.isDark ? 'text-white/90' : 'text-zinc-600'}`}>
                  {section.subtitle}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-6">
            <PortalTermsHtml html={section.bodyHtml} onDark={bg.isDark} />
          </div>
          {section.ctaLabel && section.ctaUrl ? (
            isSupportUrl(section.ctaUrl) ? (
              <div className="mt-6">
                <SupportContactButton label={section.ctaLabel} />
              </div>
            ) : (
              <Link
                href={section.ctaUrl}
                onClick={() => onCtaClick?.(section.anchor, section.ctaLabel ?? '')}
                className="mt-6 inline-flex rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-95"
              >
                {section.ctaLabel}
              </Link>
            )
          ) : null}
        </div>

        {(section.imageUrl || section.youtubeUrl || section.galleryUrls.length > 0) && (
          <div className="space-y-4">
            {section.youtubeUrl ? (
              <div className="aspect-video overflow-hidden rounded-2xl border border-zinc-200 shadow-xl">
                <iframe
                  src={section.youtubeUrl.replace('watch?v=', 'embed/')}
                  title={section.title}
                  className="size-full"
                  allowFullScreen
                  loading="lazy"
                />
              </div>
            ) : section.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={section.imageUrl}
                alt={section.title}
                className="w-full rounded-2xl border border-zinc-200 object-cover shadow-xl"
                loading="lazy"
              />
            ) : null}
            {section.galleryUrls.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {section.galleryUrls.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={url} src={url} alt="" className="rounded-xl object-cover" loading="lazy" />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
