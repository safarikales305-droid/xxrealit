'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  resolveFacebookPostMedia,
  type ResolvedFacebookPostMedia,
} from '@/lib/facebook-post-media';
import type { PortalPostFeedItem } from '@/lib/portal-post-feed';
import { portalPostFeedItemToListingPost } from '@/lib/portal-post-feed';

function previewImageUrl(resolved: ResolvedFacebookPostMedia): string | null {
  if (resolved.mode === 'image' && resolved.imageUrl) return resolved.imageUrl;
  if (resolved.posterUrl) return resolved.posterUrl;
  return null;
}

function isVideoPreview(resolved: ResolvedFacebookPostMedia): boolean {
  return (
    resolved.mode === 'video' ||
    resolved.mode === 'facebook-embed' ||
    resolved.mode === 'facebook-external'
  );
}

type Props = {
  post: PortalPostFeedItem;
  className?: string;
};

export function PostCompactMediaPreview({ post, className = '' }: Props) {
  const resolved = resolveFacebookPostMedia(portalPostFeedItemToListingPost(post));
  const [broken, setBroken] = useState(false);
  const previewUrl = previewImageUrl(resolved);
  const isVideo = isVideoPreview(resolved);
  const extraCount = Math.max(0, (post.mediaCount ?? post.media?.length ?? 0) - 1);

  if (resolved.mode === 'none') {
    return (
      <div
        className={`flex items-center justify-center rounded-lg bg-zinc-100 text-xs text-zinc-400 ${className}`}
      >
        Post
      </div>
    );
  }

  if (broken) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg bg-zinc-100 text-xs text-zinc-400 ${className}`}
      >
        {isVideo ? 'Video' : 'Post'}
      </div>
    );
  }

  if (previewUrl) {
    return (
      <div className={`relative overflow-hidden rounded-lg bg-zinc-100 ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={nestAbsoluteAssetUrl(previewUrl)}
          alt=""
          className="h-full w-full object-cover"
          onError={() => {
            if (process.env.NODE_ENV === 'development') {
              console.warn('[PostCompactMediaPreview] failed to load media preview', {
                postId: post.id,
                previewUrl,
              });
            }
            setBroken(true);
          }}
        />
        {isVideo ? (
          <>
            <div className="absolute inset-0 flex items-center justify-center bg-black/25">
              <Play className="size-7 text-white drop-shadow" fill="currentColor" aria-hidden />
            </div>
            <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
              ▶ Video
            </span>
          </>
        ) : null}
        {extraCount > 0 ? (
          <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            +{extraCount}
          </span>
        ) : null}
      </div>
    );
  }

  if (isVideo) {
    return (
      <div
        className={`relative flex items-center justify-center rounded-lg bg-zinc-900 ${className}`}
      >
        <Play className="size-7 text-white" fill="currentColor" aria-hidden />
        <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
          ▶ Video
        </span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-lg bg-zinc-100 text-xs text-zinc-400 ${className}`}
    >
      Post
    </div>
  );
}
