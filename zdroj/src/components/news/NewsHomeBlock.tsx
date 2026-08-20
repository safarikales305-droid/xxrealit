'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  nestPublicNewsArticles,
  newsCategoryLabel,
  type NewsPublicArticleCard,
} from '@/lib/news-editorial-client';

type Props = {
  limit?: number;
  compact?: boolean;
  className?: string;
};

function formatDate(value?: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
}

export function NewsHomeBlock({ limit = 4, compact = true, className = '' }: Props) {
  const [articles, setArticles] = useState<NewsPublicArticleCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void nestPublicNewsArticles({ limit: Math.min(6, Math.max(3, limit)) }).then((res) => {
      if (cancelled) return;
      setArticles(res?.items ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [limit]);

  if (loading) {
    return (
      <div className={`rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm ${className}`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Aktuality</p>
        <div className="mt-3 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-zinc-100" />
          ))}
        </div>
      </div>
    );
  }

  if (articles.length === 0) return null;

  return (
    <section className={`rounded-2xl border border-zinc-200 bg-white shadow-sm ${compact ? 'p-4' : 'p-5'} ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">📰 Aktuality</p>
        <Link
          href="/aktuality"
          className="text-[11px] font-semibold text-orange-700 hover:underline"
        >
          Vše →
        </Link>
      </div>
      <ul className={`mt-3 ${compact ? 'space-y-2.5' : 'space-y-3'}`}>
        {articles.map((article) => (
          <li key={article.id}>
            <Link
              href={`/aktuality/${article.slug}`}
              className="group block rounded-xl px-1 py-0.5 transition hover:bg-orange-50/60"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-700">
                {newsCategoryLabel(article.category)}
              </span>
              <p className={`mt-0.5 font-semibold leading-snug text-zinc-900 group-hover:text-orange-800 ${compact ? 'line-clamp-2 text-[13px]' : 'text-sm'}`}>
                {article.title}
              </p>
              {article.publishedAt ? (
                <time dateTime={article.publishedAt} className="mt-0.5 block text-[10px] text-zinc-400">
                  {formatDate(article.publishedAt)}
                </time>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
