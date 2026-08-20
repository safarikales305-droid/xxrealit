import Link from 'next/link';
import type { Metadata } from 'next';
import { PublicHeader } from '@/components/navigation/PublicHeader';
import { buildSiteMetadata } from '@/lib/seo/metadata';
import {
  NEWS_ARTICLE_CATEGORIES,
  nestPublicNewsArticles,
  newsCategoryLabel,
  type NewsPublicArticleCard,
} from '@/lib/news-editorial-client';

export const metadata: Metadata = buildSiteMetadata({
  title: 'Aktuality z realitního trhu',
  description:
    'Nejnovější zprávy o realitním trhu, hypotékách, bydlení, stavebnictví a investicích na portálu XXREALIT.',
  path: '/aktuality',
  keywords: ['aktuality', 'reality', 'hypotéky', 'bydlení', 'realitní trh'],
});

function formatDate(value?: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function ArticleCard({ article }: { article: NewsPublicArticleCard }) {
  return (
    <Link
      href={`/aktuality/${article.slug}`}
      className="group block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-orange-200 hover:shadow-md"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-orange-50 px-2.5 py-0.5 font-semibold text-orange-800">
          {newsCategoryLabel(article.category)}
        </span>
        {article.region ? (
          <span className="text-zinc-500">{article.region}</span>
        ) : null}
        {article.publishedAt ? (
          <time dateTime={article.publishedAt} className="text-zinc-400">
            {formatDate(article.publishedAt)}
          </time>
        ) : null}
      </div>
      <h2 className="mt-3 text-lg font-bold tracking-tight text-zinc-900 group-hover:text-orange-700">
        {article.title}
      </h2>
      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-zinc-600">{article.perex}</p>
      <span className="mt-3 inline-block text-sm font-semibold text-orange-700 group-hover:underline">
        Číst dále →
      </span>
    </Link>
  );
}

export default async function AktualityPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string }>;
}) {
  const params = await searchParams;
  const category = params.category?.trim() || undefined;
  const page = Math.max(1, Number(params.page) || 1);

  const data = await nestPublicNewsArticles({
    category,
    page,
    limit: 24,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="min-h-[100dvh] bg-[#fafafa] pb-16 text-zinc-900">
      <PublicHeader activeSection="profiles" />
      <div className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <h1 className="text-3xl font-bold tracking-tight">Aktuality</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600">
            Zpravodajství z realitního trhu, hypoték, bydlení a stavebnictví — redigované pro portál XXREALIT.
          </p>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
            <Link
              href="/aktuality"
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                !category
                  ? 'bg-orange-600 text-white'
                  : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              Vše
            </Link>
            {NEWS_ARTICLE_CATEGORIES.map((cat) => (
              <Link
                key={cat.value}
                href={`/aktuality?category=${cat.value}`}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  category === cat.value
                    ? 'bg-orange-600 text-white'
                    : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                {cat.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center">
            <p className="text-lg font-semibold text-zinc-800">Zatím žádné aktuality</p>
            <p className="mt-2 text-sm text-zinc-500">
              {category
                ? `V kategorii „${newsCategoryLabel(category)}" zatím nejsou publikované články.`
                : 'Brzy zde najdete novinky z realitního trhu.'}
            </p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-zinc-500">
              {total} {total === 1 ? 'článek' : total < 5 ? 'články' : 'článků'}
              {category ? ` · ${newsCategoryLabel(category)}` : ''}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {items.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
            {total > 24 ? (
              <div className="mt-8 flex justify-center gap-2">
                {page > 1 ? (
                  <Link
                    href={`/aktuality?${category ? `category=${category}&` : ''}page=${page - 1}`}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50"
                  >
                    ← Předchozí
                  </Link>
                ) : null}
                {page * 24 < total ? (
                  <Link
                    href={`/aktuality?${category ? `category=${category}&` : ''}page=${page + 1}`}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50"
                  >
                    Další →
                  </Link>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
