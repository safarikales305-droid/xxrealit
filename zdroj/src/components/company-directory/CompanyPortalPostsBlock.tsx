'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PortalPostFeedItem } from '@/lib/portal-post-feed';
import { nestGetLatestPortalPosts } from '@/lib/company-seo-admin-client';
import { portalPostFeedItemToListingPost } from '@/lib/portal-post-feed';
import { resolveFacebookPostMedia } from '@/lib/facebook-post-media';
import { FacebookPostMediaBlock } from '@/components/community/FacebookPostMediaBlock';
import { PostCompactMediaPreview } from '@/components/community/PostCompactMediaPreview';

type Props = {
  title?: string;
  initialItems?: PortalPostFeedItem[];
};

function isPlayableVideoPost(post: PortalPostFeedItem): boolean {
  const media = resolveFacebookPostMedia(portalPostFeedItemToListingPost(post));
  return (
    media.mode === 'video' ||
    media.mode === 'facebook-embed' ||
    media.mode === 'facebook-external'
  );
}

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
        <Link href="/?tab=posts" className="text-sm font-semibold text-orange-700 hover:underline">
          Všechny příspěvky
        </Link>
      </div>
      <ul className="mt-4 space-y-3">
        {items.map((post) => {
          const isCompanyReview = post.postType === 'COMPANY_REVIEW';
          const listingPost = portalPostFeedItemToListingPost(post);
          const media = resolveFacebookPostMedia(listingPost);
          const hasVideo = isPlayableVideoPost(post);

          return (
            <li key={post.id} className="rounded-xl border border-zinc-100 p-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="w-full shrink-0 sm:w-44 md:w-52">
                  {hasVideo ? (
                    <FacebookPostMediaBlock
                      media={media}
                      facebookPostType={post.facebookPostType}
                      postId={post.id}
                      compact
                      className="mt-0"
                      onOpenDetail={() => {
                        window.location.href = post.href;
                      }}
                    />
                  ) : (
                    <Link href={post.href} className="block">
                      <PostCompactMediaPreview
                        post={post}
                        className="aspect-[16/10] w-full sm:aspect-square"
                      />
                    </Link>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-zinc-500">
                    {isCompanyReview ? '⭐ Nová recenze firmy' : (post.authorName ?? 'Uživatel')}
                    {post.category ? ` · ${post.category}` : ''}
                    {post.publishedAt
                      ? ` · ${new Date(post.publishedAt).toLocaleDateString('cs-CZ')}`
                      : ''}
                  </p>
                  <Link href={post.href} className="mt-1 block">
                    <p className="line-clamp-3 whitespace-pre-line text-sm text-zinc-700">
                      {post.excerpt}
                    </p>
                    <span className="mt-2 inline-block text-xs font-semibold text-orange-700">
                      {hasVideo ? 'Otevřít příspěvek' : 'Zobrazit příspěvek'}
                    </span>
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
