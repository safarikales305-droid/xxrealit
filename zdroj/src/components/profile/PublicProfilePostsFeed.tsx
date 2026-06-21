'use client';

import { useState } from 'react';
import type { ListingPost } from '@/lib/nest-client';
import { FacebookPostMediaBlock } from '@/components/community/FacebookPostMediaBlock';
import { LinkPreviewCard, type LinkPreviewData } from '@/components/community/LinkPreviewCard';
import { PostSoundAudio } from '@/components/community/PostSoundAudio';
import {
  isFacebookImportPost,
  resolveFacebookPostMedia,
} from '@/lib/facebook-post-media';

export type PublicProfilePost = {
  id: string;
  title?: string | null;
  content?: string | null;
  description?: string | null;
  createdAt?: string | null;
  publishedAt?: string | null;
  videoUrl?: string | null;
  imageUrl?: string | null;
  externalUrl?: string | null;
  previewTitle?: string | null;
  previewDescription?: string | null;
  previewImage?: string | null;
  previewSiteName?: string | null;
  isFacebookPagePost?: boolean;
  facebookPermalink?: string | null;
  facebookEmbedUrl?: string | null;
  facebookPostType?: string | null;
  facebookVideoThumbnail?: string | null;
  facebookVideoHasAudio?: boolean | null;
  source?: string | null;
  soundTrack?: ListingPost['soundTrack'];
  media?: Array<{ url?: string; type?: string; order?: number }>;
};

function toListingPostShape(post: PublicProfilePost): ListingPost {
  return {
    id: post.id,
    title: String(post.title ?? ''),
    description: String(post.description ?? post.content ?? ''),
    price: null,
    city: '',
    type: 'post',
    createdAt: post.createdAt ?? new Date().toISOString(),
    publishedAt: post.publishedAt ?? null,
    media: (post.media ?? []).map((m, idx) => ({
      id: `${post.id}-m-${idx}`,
      url: String(m.url ?? ''),
      type: (m.type === 'video' ? 'video' : 'image') as 'image' | 'video',
      order: typeof m.order === 'number' ? m.order : idx,
    })),
    videoUrl: post.videoUrl ?? null,
    imageUrl: post.imageUrl ?? null,
    externalUrl: post.externalUrl ?? null,
    previewTitle: post.previewTitle ?? null,
    previewDescription: post.previewDescription ?? null,
    previewImage: post.previewImage ?? null,
    previewSiteName: post.previewSiteName ?? null,
    isFacebookPagePost: post.isFacebookPagePost,
    facebookPermalink: post.facebookPermalink ?? null,
    facebookEmbedUrl: post.facebookEmbedUrl ?? null,
    facebookPostType: post.facebookPostType ?? null,
    facebookVideoThumbnail: post.facebookVideoThumbnail ?? null,
    facebookVideoHasAudio: post.facebookVideoHasAudio ?? null,
    source: post.source as ListingPost['source'],
    soundTrack: post.soundTrack ?? null,
  };
}

function PublicProfilePostCard({ post }: { post: PublicProfilePost }) {
  const [muted, setMuted] = useState(true);
  const listingPost = toListingPostShape(post);
  const resolvedMedia = resolveFacebookPostMedia(listingPost);
  const hasFeedMedia = resolvedMedia.mode !== 'none';
  const hasPostSound = Boolean(listingPost.soundTrack?.fileUrl || listingPost.soundTrack?.previewUrl);
  const showMuteForVideo = resolvedMedia.mode === 'video' && !hasPostSound;
  const isFacebookImport = isFacebookImportPost(listingPost);
  const postText = String(listingPost.description ?? '').trim();

  const externalUrl = String(listingPost.externalUrl ?? '').trim();
  const linkPreview: LinkPreviewData | null = externalUrl
    ? {
        url: externalUrl,
        title: String(listingPost.previewTitle ?? '').trim() || externalUrl,
        description: String(listingPost.previewDescription ?? '').trim(),
        image: String(listingPost.previewImage ?? '').trim(),
        siteName: String(listingPost.previewSiteName ?? '').trim(),
      }
    : null;

  const when = post.publishedAt ?? post.createdAt;

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      {when ? (
        <p className="px-4 pt-4 text-xs text-zinc-500">
          {new Date(when).toLocaleString('cs-CZ')}
        </p>
      ) : null}

      {postText ? (
        <div className="px-4 pb-2 pt-2">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{postText}</p>
        </div>
      ) : null}

      {linkPreview && !hasFeedMedia && !isFacebookImport ? (
        <div className="px-4 pb-2">
          <LinkPreviewCard preview={linkPreview} compact />
        </div>
      ) : null}

      {hasFeedMedia ? (
        <div className="py-2">
          <FacebookPostMediaBlock
            media={resolvedMedia}
            facebookPostType={listingPost.facebookPostType ?? null}
            postId={post.id}
            feedAutoplay
            compact
            muted={hasPostSound ? true : muted}
            showMuteToggle={showMuteForVideo}
            onToggleMute={() => setMuted((v) => !v)}
            className="mt-0"
          />
          {hasPostSound ? <PostSoundAudio soundTrack={listingPost.soundTrack} /> : null}
        </div>
      ) : null}
    </article>
  );
}

type Props = {
  posts: PublicProfilePost[];
};

export function PublicProfilePostsFeed({ posts }: Props) {
  if (posts.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-4">
      {posts.map((post) => (
        <PublicProfilePostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
