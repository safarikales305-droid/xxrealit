import Link from 'next/link';
import type { ProgrammaticSeoPageData } from '@/lib/seo/programmatic-seo';

type Props = {
  data: ProgrammaticSeoPageData;
};

function LinkSection({
  title,
  links,
}: {
  title: string;
  links: Array<{ href: string; label: string }>;
}) {
  if (links.length === 0) return null;
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="inline-block rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProgrammaticInternalLinks({ data }: Props) {
  const { intent, location, internalLinks, relatedLocations } = data;

  return (
    <div className="mt-10 grid gap-4 lg:grid-cols-2">
      <LinkSection
        title={`Další ${intent.label.toLowerCase()} v okolí`}
        links={internalLinks.sameIntentNearby.map((l) => ({ href: l.path, label: l.name }))}
      />
      <LinkSection
        title={`${intent.label} — další lokality`}
        links={relatedLocations.map((l) => ({ href: l.path, label: l.name }))}
      />
      {internalLinks.regionIntent ? (
        <LinkSection
          title="Celý kraj"
          links={[
            {
              href: internalLinks.regionIntent.path,
              label: internalLinks.regionIntent.name,
            },
          ]}
        />
      ) : null}
      <LinkSection
        title={`Reality v ${location.name}`}
        links={internalLinks.otherIntents.map((l) => ({ href: l.path, label: l.label }))}
      />
      <LinkSection
        title="Další sekce portálu"
        links={[
          { href: '/nemovitosti', label: 'Všechny nemovitosti' },
          { href: '/makleri', label: 'Makléři' },
          { href: '/stavebni-firmy', label: 'Stavební firmy' },
          { href: '/hypoteky', label: 'Hypotéky' },
          { href: '/shorts', label: 'Video inzeráty' },
          { href: '/o-portalu', label: 'O portálu' },
          ...(internalLinks.extra?.map((l) => ({ href: l.path, label: l.label })) ?? []),
        ]}
      />
    </div>
  );
}
