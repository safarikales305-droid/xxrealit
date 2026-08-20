import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PublicHeader } from '@/components/navigation/PublicHeader';
import { JsonLd } from '@/components/seo/JsonLd';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { getAppOrigin } from '@/lib/app-url';
import {
  nestPublicNewsArticle,
  nestPublicNewsRelated,
  newsCategoryLabel,
  type NewsArticleRow,
} from '@/lib/news-editorial-client';
import { buildSiteMetadata, getRobotsMetadata } from '@/lib/seo/metadata';

type Props = {
  params: Promise<{ slug: string }>;
};

function formatDate(value?: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function buildArticleJsonLd(article: NewsArticleRow, origin: string) {
  if (article.schemaJson && typeof article.schemaJson === 'object') {
    return article.schemaJson;
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.seoTitle || article.title,
    description: article.seoDescription || article.perex,
    datePublished: article.publishedAt ?? undefined,
    dateModified: article.updatedAt ?? article.publishedAt ?? undefined,
    author: {
      '@type': 'Organization',
      name: article.authorLabel ?? 'Redakce XXREALIT',
    },
    publisher: {
      '@type': 'Organization',
      name: 'XXREALIT',
      logo: {
        '@type': 'ImageObject',
        url: `${origin}/icons/icon-192.png`,
      },
    },
    mainEntityOfPage: `${origin}/aktuality/${article.slug}`,
    image: article.ogImageUrl ? nestAbsoluteAssetUrl(article.ogImageUrl) : undefined,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await nestPublicNewsArticle(slug);
  if (!article) {
    return buildSiteMetadata({ title: 'Článek nenalezen', path: `/aktuality/${slug}`, noindex: true });
  }

  const robotsMeta = getRobotsMetadata({
    indexable: article.indexable !== false,
    robots: article.robots,
  });

  const base = buildSiteMetadata({
    title: article.seoTitle || article.title,
    description: article.seoDescription || article.perex,
    path: `/aktuality/${article.slug}`,
    image: article.ogImageUrl,
    type: 'article',
    noindex: !robotsMeta.index,
  });

  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      type: 'article',
      publishedTime: article.publishedAt ?? undefined,
      modifiedTime: article.updatedAt ?? undefined,
      authors: [article.authorLabel ?? 'Redakce XXREALIT'],
    },
  };
}

export default async function AktualitaDetailPage({ params }: Props) {
  const { slug } = await params;
  const [article, related] = await Promise.all([
    nestPublicNewsArticle(slug),
    nestPublicNewsRelated(slug),
  ]);

  if (!article) notFound();

  const origin = getAppOrigin();
  const jsonLd = buildArticleJsonLd(article, origin);
  const bodyHtml = article.bodyHtml?.trim();
  const updatedLabel = formatDate(article.updatedAt ?? article.publishedAt);

  return (
    <div className="min-h-[100dvh] bg-[#fafafa] pb-16 text-zinc-900">
      <JsonLd data={jsonLd as Record<string, unknown>} />
      <PublicHeader activeSection="profiles" />

      <article className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
          <nav className="mb-6 text-sm text-zinc-500">
            <Link href="/aktuality" className="font-semibold text-orange-700 hover:underline">
              Aktuality
            </Link>
            <span className="mx-2">/</span>
            <span>{newsCategoryLabel(article.category)}</span>
          </nav>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-orange-50 px-2.5 py-0.5 font-semibold text-orange-800">
              {newsCategoryLabel(article.category)}
            </span>
            {article.region ? <span className="text-zinc-500">{article.region}</span> : null}
          </div>

          <h1 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            {article.title}
          </h1>

          <p className="mt-4 text-lg leading-relaxed text-zinc-600">{article.perex}</p>

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500">
            <span>{article.authorLabel ?? 'Redakce XXREALIT'}</span>
            {article.publishedAt ? (
              <time dateTime={article.publishedAt}>Publikováno {formatDate(article.publishedAt)}</time>
            ) : null}
            {updatedLabel ? <span>Aktualizováno {updatedLabel}</span> : null}
          </div>
        </div>
      </article>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {bodyHtml ? (
          <div
            className="prose prose-zinc max-w-none prose-headings:font-bold prose-a:text-orange-700 prose-img:rounded-xl"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        ) : (
          <div className="prose prose-zinc max-w-none">
            <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-700">
              {article.bodyMarkdown}
            </div>
          </div>
        )}

        {article.sourcesFooterHtml ? (
          <footer
            className="mt-10 rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600"
            dangerouslySetInnerHTML={{ __html: article.sourcesFooterHtml }}
          />
        ) : article.sources && article.sources.length > 0 ? (
          <footer className="mt-10 rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Zdroje</h2>
            <ul className="mt-3 space-y-2">
              {article.sources.map((source) => (
                <li key={source.id}>
                  <a
                    href={source.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-orange-700 hover:underline"
                  >
                    {source.sourceName}
                  </a>
                </li>
              ))}
            </ul>
          </footer>
        ) : null}

        {related && (related.listings.length > 0 || related.posts.length > 0 || related.companies.length > 0) ? (
          <aside className="mt-12 space-y-8">
            {related.listings.length > 0 ? (
              <section>
                <h2 className="text-lg font-bold text-zinc-900">Související inzeráty</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {related.listings.map((listing) => (
                    <Link
                      key={listing.id}
                      href={listing.slug ? `/nemovitosti/${listing.slug}` : `/nemovitosti/${listing.id}`}
                      className="rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-orange-200"
                    >
                      <p className="font-semibold text-zinc-900">{listing.title}</p>
                      <p className="mt-1 text-sm text-zinc-500">
                        {[listing.city, listing.price != null ? `${listing.price.toLocaleString('cs-CZ')} Kč` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {related.posts.length > 0 ? (
              <section>
                <h2 className="text-lg font-bold text-zinc-900">Související příspěvky</h2>
                <ul className="mt-4 space-y-2">
                  {related.posts.map((post) => (
                    <li key={post.id}>
                      <Link
                        href={post.slug ? `/prispevky/${post.slug}` : `/prispevky/${post.id}`}
                        className="block rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-800 hover:border-orange-200"
                      >
                        {post.seoTitle ?? post.content?.slice(0, 80) ?? 'Příspěvek'}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {related.companies.length > 0 ? (
              <section>
                <h2 className="text-lg font-bold text-zinc-900">Související firmy</h2>
                <ul className="mt-4 space-y-2">
                  {related.companies.map((company) => (
                    <li key={company.id}>
                      <Link
                        href={`/firmy/${company.slug}`}
                        className="block rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-800 hover:border-orange-200"
                      >
                        {company.name}
                        {company.city ? (
                          <span className="ml-2 font-normal text-zinc-500">{company.city}</span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </aside>
        ) : null}

        <div className="mt-12 border-t border-zinc-200 pt-8">
          <Link
            href="/aktuality"
            className="text-sm font-semibold text-orange-700 hover:underline"
          >
            ← Zpět na aktuality
          </Link>
        </div>
      </div>
    </div>
  );
}
