'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { PortalPostFeedItem } from '@/lib/company-seo-admin-client';
import { nestGetLatestPortalPosts } from '@/lib/company-seo-admin-client';

type Props = {
  title?: string;
  initialItems?: PortalPostFeedItem[];
};

export function CompanyPortalPostsBlock({ title = 'Co je nového na XXREALIT', initialItems }: Props) {
  const [items, setItems] = useState<PortalPostFeedItem[]>(initialItems ?? []);

  useEffect(() => {
    if (initialItems?.length) return;
    void nestGetLatestPortalPosts(5).then((data) => {
      if (data?.items?.length) setItems(data.items);
    });
    const id = window.setInterval(() => {
      void nestGetLatestPortalPosts(5).then((data) => {
        if (data?.items?.length) setItems(data.items);
      });
    }, 90_000);
    return () => window.clearInterval(id);
  }, [initialItems]);

  if (!items.length) return null;

  return (
    <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
        <Link href="/posts" className="text-sm font-semibold text-orange-700 hover:underline">
          Všechny příspěvky
        </Link>
      </div>
      <ul className="mt-4 space-y-3">
        {items.map((post) => {
          const isCompanyReview = post.postType === 'COMPANY_REVIEW';
          return (
          <li key={post.id} className="flex gap-3 rounded-xl border border-zinc-100 p-3">
            {post.thumbnailUrl ? (
              <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                <Image src={post.thumbnailUrl} alt="" fill className="object-cover" sizes="56px" />
              </div>
            ) : (
              <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-xs text-zinc-400">
                Post
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-zinc-500">
                {isCompanyReview ? '⭐ Nová recenze firmy' : (post.authorName ?? 'Uživatel')}
                {post.category ? ` · ${post.category}` : ''}
                {post.publishedAt
                  ? ` · ${new Date(post.publishedAt).toLocaleDateString('cs-CZ')}`
                  : ''}
              </p>
              <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-zinc-700">{post.excerpt}</p>
              <Link href={post.href} className="mt-1 inline-block text-xs font-semibold text-orange-700 hover:underline">
                {isCompanyReview ? 'Zobrazit příspěvek' : 'Zobrazit příspěvek'}
              </Link>
            </div>
          </li>
        );
        })}
      </ul>
    </section>
  );
}
