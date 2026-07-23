import Link from 'next/link';
import Image from 'next/image';
import type { ProgrammaticSeoPageData } from '@/lib/seo/programmatic-seo';
import { SeoBreadcrumbs } from '@/components/seo/SeoBreadcrumbs';
import { ProgrammaticInternalLinks } from '@/components/seo/ProgrammaticInternalLinks';
import { ProgrammaticSeoHero } from '@/components/seo/ProgrammaticSeoHero';
import { ProgrammaticSeoComingSoon } from '@/components/seo/ProgrammaticSeoComingSoon';
import { ProgrammaticSeoRegisterCta } from '@/components/seo/ProgrammaticSeoRegisterCta';

type Props = {
  data: ProgrammaticSeoPageData;
};

function formatPrice(price: number | null, currency: string): string {
  if (price == null || price <= 0) return 'Cena na dotaz';
  return `${new Intl.NumberFormat('cs-CZ').format(price)} ${currency === 'CZK' ? 'Kč' : currency}`;
}

function RichParagraph({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="text-base leading-relaxed text-zinc-700">
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i} className="font-semibold text-zinc-900">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

export function ProgrammaticSeoPage({ data }: Props) {
  const {
    intent,
    location,
    h1,
    h2,
    bodyText,
    sections,
    faq,
    listings,
    totalCount,
    hasListings,
    heroSubtitle,
    heroImageUrl,
    heroImageAlt,
  } = data;

  const showComingSoon = !hasListings && listings.length === 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <SeoBreadcrumbs
        items={[
          { name: 'Domů', path: '/' },
          { name: intent.label, path: `/${intent.slug}/${location.slug}` },
          { name: location.name, path: data.path },
        ]}
      />

      <div className="mt-6">
        <ProgrammaticSeoHero
          h1={h1}
          subtitle={heroSubtitle}
          imageUrl={heroImageUrl}
          imageAlt={heroImageAlt}
          hasListings={hasListings}
          totalCount={totalCount}
        />
      </div>

      {showComingSoon ? (
        <div className="mt-8">
          <ProgrammaticSeoComingSoon locationName={location.name} intentLabel={intent.label} />
        </div>
      ) : null}

      {listings.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-2xl font-bold text-zinc-900">Aktuální nabídka</h2>
          <p className="mt-1 text-sm text-zinc-600">{totalCount} aktivních inzerátů v lokalitě</p>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {listings.map((item) => {
              const href = item.slug ? `/nemovitosti/${item.slug}` : `/nemovitost/${item.id}`;
              return (
                <li key={item.id}>
                  <Link
                    href={href}
                    className="flex gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-orange-200 hover:shadow-md"
                  >
                    <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-xl bg-zinc-100">
                      {item.mainImage ? (
                        <Image
                          src={item.mainImage}
                          alt={item.title}
                          fill
                          className="object-cover"
                          sizes="128px"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-zinc-400">
                          Bez fotky
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 font-semibold text-zinc-900">{item.title}</h3>
                      <p className="mt-1 text-sm text-zinc-600">{item.city}</p>
                      <p className="mt-2 text-sm font-semibold text-orange-600">
                        {formatPrice(item.price, item.currency)}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <article className="mt-12 space-y-10">
        <header>
          <h2 className="text-2xl font-bold text-zinc-900">{h2}</h2>
        </header>

        {sections.length > 0
          ? sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-8">
                <h2 className="text-xl font-bold text-zinc-900">{section.h2}</h2>
                {section.h3 && section.h3.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {section.h3.map((sub) => (
                      <li
                        key={sub}
                        className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600"
                      >
                        {sub}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-4 space-y-4">
                  {section.paragraphs.map((para, idx) => (
                    <RichParagraph key={`${section.id}-${idx}`} text={para} />
                  ))}
                </div>
              </section>
            ))
          : (
            <div className="space-y-4">
              {bodyText.split('\n\n').map((para, idx) => (
                <RichParagraph key={idx} text={para} />
              ))}
            </div>
          )}
      </article>

      <div className="mt-12">
        <ProgrammaticSeoRegisterCta locationName={location.name} />
      </div>

      {faq.length > 0 ? (
        <section className="mt-12 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
          <h2 className="text-2xl font-bold text-zinc-900">Časté dotazy</h2>
          <dl className="mt-6 space-y-5">
            {faq.map((item) => (
              <div key={item.question} className="border-b border-zinc-100 pb-5 last:border-0">
                <dt className="text-base font-semibold text-zinc-900">{item.question}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-zinc-600">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <ProgrammaticInternalLinks data={data} />
    </div>
  );
}
