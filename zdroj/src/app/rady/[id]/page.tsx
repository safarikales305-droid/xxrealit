'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  nestGetPurchaseAdviceArticle,
  type PurchaseAdviceArticleRow,
} from '@/lib/nest-client';

export default function PurchaseAdviceArticlePage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const [article, setArticle] = useState<PurchaseAdviceArticleRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let active = true;
    void nestGetPurchaseAdviceArticle(id)
      .then((row) => {
        if (active) setArticle(row);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-zinc-500">Načítám článek…</p>
      </main>
    );
  }

  if (!article) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-xl font-bold text-zinc-900">Článek nenalezen</h1>
        <Link href="/" className="mt-4 inline-flex text-sm font-semibold text-[#e85d00] hover:underline">
          Zpět na úvod
        </Link>
      </main>
    );
  }

  const imageSrc = article.imageUrl
    ? nestAbsoluteAssetUrl(article.imageUrl) ?? article.imageUrl
    : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="text-sm font-semibold text-[#e85d00] hover:underline">
        ← Zpět
      </Link>
      {article.category ? (
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {article.category}
        </p>
      ) : null}
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900">{article.title}</h1>
      {imageSrc ? (
        <img
          src={imageSrc}
          alt=""
          className="mt-6 w-full rounded-2xl border border-zinc-200 object-cover"
        />
      ) : null}
      <article className="prose prose-zinc mt-6 max-w-none whitespace-pre-wrap text-base leading-7 text-zinc-800">
        {article.body}
      </article>
    </main>
  );
}
