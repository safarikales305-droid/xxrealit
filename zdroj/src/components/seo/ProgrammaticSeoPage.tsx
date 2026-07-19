import Link from 'next/link';
import Image from 'next/image';
import type { ProgrammaticSeoPageData } from '@/lib/seo/programmatic-seo';
import { SeoBreadcrumbs } from '@/components/seo/SeoBreadcrumbs';
import { ProgrammaticInternalLinks } from '@/components/seo/ProgrammaticInternalLinks';

type Props = {
  data: ProgrammaticSeoPageData;
};

function formatPrice(price: number | null, currency: string): string {
  if (price == null || price <= 0) return 'Cena na dotaz';
  return `${new Intl.NumberFormat('cs-CZ').format(price)} ${currency === 'CZK' ? 'Kč' : currency}`;
}

export function ProgrammaticSeoPage({ data }: Props) {
  const { intent, location, h1, bodyText, faq, listings, totalCount } = data;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <SeoBreadcrumbs
        items={[
          { name: 'Domů', path: '/' },
          { name: intent.label, path: `/${intent.slug}/${location.slug}` },
          { name: location.name, path: data.path },
        ]}
      />

      <header className="mt-6">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">{h1}</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {totalCount > 0
            ? `${totalCount} aktuálních nabídek`
            : 'Aktuální nabídky — průběžně doplňujeme'}
        </p>
      </header>

      <article className="prose prose-zinc mt-8 max-w-none">
        <p className="text-base leading-relaxed text-zinc-700">{bodyText}</p>
      </article>

      {listings.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-xl font-semibold text-zinc-900">Aktuální nabídka</h2>
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

      {faq.length > 0 ? (
        <section className="mt-10 rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-zinc-900">Časté dotazy</h2>
          <dl className="mt-4 space-y-4">
            {faq.map((item) => (
              <div key={item.question}>
                <dt className="font-medium text-zinc-900">{item.question}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-zinc-600">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <ProgrammaticInternalLinks data={data} />
    </div>
  );
}
