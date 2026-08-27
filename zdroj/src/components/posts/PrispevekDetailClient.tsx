'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { absoluteShareUrl } from '@/lib/public-share-url';
import { ShareButtons } from '@/components/share/ShareButtons';
import { PublicHeader } from '@/components/navigation/PublicHeader';
import { LinkPreviewCard } from '@/components/community/LinkPreviewCard';
import { FacebookPostMediaBlock } from '@/components/community/FacebookPostMediaBlock';
import { FacebookInlineVideoPlayer } from '@/components/community/FacebookInlineVideoPlayer';
import { YoutubeLazyPlayer } from '@/components/community/YoutubeLazyPlayer';
import { nestFetchPostDetail, type ListingPost } from '@/lib/nest-client';
import { ListingPriceDisplay } from '@/components/pricing/ListingPriceDisplay';
import {
  filterPostMediaForDisplay,
  isFacebookImportPost,
  resolveFacebookPostMedia,
} from '@/lib/facebook-post-media';
import {
  buildMetaCentrumPromoteUrlFromPost,
  isPromotablePost,
} from '@/lib/meta-centrum-promote';

type Props = {
  postId: string;
  sharePath?: string;
};

export function PrispevekDetailClient({ postId, sharePath }: Props) {
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const [post, setPost] = useState<ListingPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!postId) return;
    setLoading(true);
    void nestFetchPostDetail(postId)
      .then((p) => setPost(p))
      .finally(() => setLoading(false));
  }, [postId]);

  const orderedMedia = useMemo(
    () => filterPostMediaForDisplay(post ?? ({} as ListingPost)),
    [post],
  );
  const resolvedMedia = useMemo(
    () =>
      post
        ? resolveFacebookPostMedia(post)
        : {
            mode: 'none' as const,
            videoUrl: null,
            imageUrl: null,
            posterUrl: null,
            embedUrl: null,
            permalink: null,
            isFacebookVideo: false,
          },
    [post],
  );
  const isFbImport = post ? isFacebookImportPost(post) : false;
  const useFbMediaRenderer = isFbImport && resolvedMedia.mode !== 'none';
  const showPrimaryMediaBlock =
    !useFbMediaRenderer && resolvedMedia.mode !== 'none' && orderedMedia.length === 0;

  const isCommunityPost = post?.type === 'post' || !post?.type;
  const youtubeVideoId = String(post?.youtubeVideoId ?? '').trim();
  const isYoutubeVideo =
    String(post?.type ?? '') === 'YOUTUBE_VIDEO' || Boolean(youtubeVideoId);
  const youtubeTitle = (post?.previewTitle ?? post?.title ?? '').trim();
  const youtubeTeaser = (post?.previewDescription ?? post?.description ?? '').trim();
  const youtubeChannel = String(post?.youtubeChannelTitle ?? '').trim();
  const youtubeWatchUrl = post?.externalUrl?.trim() ?? '';
  const authorName = post?.user?.name?.trim() || 'Redakce XXREALIT';
  const publishedLabel = post?.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString('cs-CZ', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  function scrollToIndex(index: number) {
    const el = carouselRef.current;
    if (!el) return;
    const safeIndex = Math.max(0, Math.min(index, orderedMedia.length - 1));
    const width = el.clientWidth;
    el.scrollTo({ left: safeIndex * width, behavior: 'smooth' });
    setActiveIndex(safeIndex);
  }

  function onCarouselScroll() {
    const el = carouselRef.current;
    if (!el) return;
    const width = el.clientWidth || 1;
    const idx = Math.round(el.scrollLeft / width);
    if (idx !== activeIndex) setActiveIndex(idx);
  }

  const shareTitle =
    (post?.title ?? '').trim().slice(0, 120) ||
    (post?.description ?? '').trim().slice(0, 80) ||
    'Příspěvek';
  const postSlug = post ? String((post as { slug?: string | null }).slug ?? '').trim() : '';
  const shareUrl = absoluteShareUrl(
    sharePath ?? (postSlug ? `/prispevek/${postSlug}` : `/prispevky/${encodeURIComponent(postId)}`),
  );

  return (
    <>
      <PublicHeader activeSection="posts" />
      <main className="min-h-[100dvh] bg-black px-0 py-0 text-white md:bg-[#fafafa] md:px-3 md:py-4 md:text-zinc-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 px-3 pt-3 md:px-0 md:pt-0">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="inline-flex items-center rounded-full border px-4 py-2 text-sm"
        >
          ← Zpět
        </button>
        {post ? (
          <div className="flex flex-wrap items-center gap-2">
            {user?.role === 'ADMIN' && isPromotablePost(post) ? (
              <Link
                href={buildMetaCentrumPromoteUrlFromPost(post)}
                className="inline-flex items-center rounded-full border border-[#1877f2]/40 bg-[#1877f2]/10 px-4 py-2 text-sm font-semibold text-[#1877f2]"
              >
                Propagovat
              </Link>
            ) : null}
            <ShareButtons title={shareTitle} url={shareUrl} variant="pill" label="Sdílet" />
          </div>
        ) : null}
      </div>

      {loading ? <p className="mt-4 text-sm text-zinc-600">Načítám…</p> : null}
      {!loading && !post ? (
        <p className="mt-4 text-sm text-zinc-600">Příspěvek nebyl nalezen.</p>
      ) : null}

      {post ? (
        <article className="mt-0 overflow-hidden bg-black md:mt-4 md:rounded-2xl md:border md:border-zinc-200 md:bg-white md:shadow-sm">
          {isYoutubeVideo && youtubeVideoId ? (
            <div className="bg-white px-3 py-4 md:px-6">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <span className="font-semibold text-zinc-800">{authorName}</span>
                <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">
                  🎥 YouTube
                </span>
                {publishedLabel ? <span>{publishedLabel}</span> : null}
              </div>
              {youtubeTitle ? (
                <h1 className="text-xl font-semibold text-zinc-900 md:text-2xl">{youtubeTitle}</h1>
              ) : null}
              {youtubeTeaser ? (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
                  {youtubeTeaser}
                </p>
              ) : null}
              <div className="mt-4 w-full max-w-3xl">
                <YoutubeLazyPlayer
                  videoId={youtubeVideoId}
                  title={youtubeTitle}
                  thumbnailUrl={post.youtubeThumbnailUrl ?? post.previewImage ?? post.imageUrl}
                  embeddable={post.youtubeEmbeddable !== false}
                  watchUrl={youtubeWatchUrl}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-zinc-600">
                {(post as { editorialSourceName?: string | null }).editorialSourceName ? (
                  <span>
                    Zdroj: {(post as { editorialSourceName?: string | null }).editorialSourceName}
                  </span>
                ) : null}
                {youtubeChannel ? <span>Kanál: {youtubeChannel}</span> : null}
                {youtubeWatchUrl ? (
                  <a
                    href={youtubeWatchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-red-700 hover:underline"
                  >
                    Otevřít na YouTube
                  </a>
                ) : null}
              </div>
            </div>
          ) : useFbMediaRenderer || showPrimaryMediaBlock ? (
            <FacebookPostMediaBlock
              media={resolvedMedia}
              facebookPostType={post.facebookPostType ?? null}
              postId={postId}
              showMuteToggle={resolvedMedia.mode === 'video'}
              muted
              className="mt-0"
              edgeToEdge
            />
          ) : orderedMedia.length > 0 ? (
            <div className="relative w-full bg-black">
              <div
                ref={carouselRef}
                onScroll={onCarouselScroll}
                className="flex w-full snap-x snap-mandatory overflow-x-auto scroll-smooth"
              >
                {orderedMedia.map((m) => (
                  <div key={m.id ?? m.url} className="w-full shrink-0 snap-center bg-black">
                    {m.type === 'image' ? (
                      <img
                        src={nestAbsoluteAssetUrl(m.url)}
                        alt=""
                        className="aspect-square w-full object-contain"
                      />
                    ) : (
                      <FacebookInlineVideoPlayer
                        src={m.url}
                        poster={
                          post.facebookVideoThumbnail || post.previewImage
                            ? String(post.facebookVideoThumbnail ?? post.previewImage)
                            : null
                        }
                        postId={`${postId}-${m.id ?? m.url}`}
                        muted
                        showMuteToggle
                      />
                    )}
                  </div>
                ))}
              </div>
              {orderedMedia.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => scrollToIndex(activeIndex - 1)}
                    className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/60 px-2.5 py-1.5 text-white md:block"
                    aria-label="Předchozí"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToIndex(activeIndex + 1)}
                    className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/60 px-2.5 py-1.5 text-white md:block"
                    aria-label="Další"
                  >
                    →
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          {!isYoutubeVideo ? (
          <div className="px-3 py-3 md:bg-white">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h1 className="text-lg font-semibold text-zinc-900">
                {isCommunityPost ? 'Komunitní příspěvek' : post.title}
              </h1>
            </div>
            {!isCommunityPost ? (
              <>
                <ListingPriceDisplay
                  as="p"
                  price={post.price}
                  isAuthenticated={isAuthenticated}
                  className="mt-1 text-xl font-bold text-zinc-900"
                  blurredClassName="blurred-price select-none blur-sm"
                />
                <p className="mt-1 text-sm text-zinc-600">{post.city}</p>
              </>
            ) : null}
            <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-800">
              {post.description}
            </p>
            {!useFbMediaRenderer &&
            !showPrimaryMediaBlock &&
            resolvedMedia.mode === 'none' &&
            post.externalUrl?.trim() ? (
              <LinkPreviewCard
                preview={{
                  url: post.externalUrl.trim(),
                  title: (post.previewTitle ?? '').trim() || post.externalUrl.trim(),
                  description: (post.previewDescription ?? '').trim(),
                  image: (post.previewImage ?? '').trim(),
                  siteName: (post.previewSiteName ?? '').trim(),
                }}
              />
            ) : null}
            <Link href="/" className="mt-4 inline-block text-sm font-semibold text-orange-600">
              Další příspěvky
            </Link>
          </div>
          ) : (
            <div className="border-t border-zinc-100 bg-white px-3 py-3 md:px-6">
              <Link href="/?tab=posts" className="text-sm font-semibold text-orange-600">
                Další příspěvky
              </Link>
            </div>
          )}
        </article>
      ) : null}
      </main>
    </>
  );
}
