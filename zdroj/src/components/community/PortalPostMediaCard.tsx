'use client';

import Link from 'next/link';
import type { PortalPostFeedItem } from '@/lib/portal-post-feed';
import { portalPostFeedItemToListingPost } from '@/lib/portal-post-feed';
import { resolveFacebookPostMedia } from '@/lib/facebook-post-media';
import { FacebookPostMediaBlock } from '@/components/community/FacebookPostMediaBlock';
import { PostCompactMediaPreview } from '@/components/community/PostCompactMediaPreview';

type Props = {
  post: PortalPostFeedItem;
  mediaClassName?: string;
  compact?: boolean;
};

function isPlayableVideoPost(post: PortalPostFeedItem): boolean {
  const media = resolveFacebookPostMedia(portalPostFeedItemToListingPost(post));
  return (
    media.mode === 'video' ||
    media.mode === 'facebook-embed' ||
    media.mode === 'facebook-external'
  );
}

export function PortalPostMediaCard({ post, mediaClassName = '', compact = false }: Props) {
  const listingPost = portalPostFeedItemToListingPost(post);
  const media = resolveFacebookPostMedia(listingPost);
  const hasVideo = isPlayableVideoPost(post);

  if (hasVideo) {
    return (
      <FacebookPostMediaBlock
        media={media}
        facebookPostType={post.facebookPostType}
        postId={post.id}
        compact={compact}
        className="mt-0"
        onOpenDetail={() => {
          window.location.href = post.href;
        }}
      />
    );
  }

  return (
    <Link href={post.href} className="block">
      <PostCompactMediaPreview post={post} className={mediaClassName} />
    </Link>
  );
}
