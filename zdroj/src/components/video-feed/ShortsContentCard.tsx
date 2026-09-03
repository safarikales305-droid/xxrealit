'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { YoutubeLazyPlayer } from '@/components/community/YoutubeLazyPlayer';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  formatShortsDate,
  resolveShortsMediaUrl,
  resolveYoutubeVideoId,
  SHORTS_BADGE_LABELS,
  type ShortsFeedItem,
} from '@/lib/shorts-feed';
import { ShortsPostSocialRail } from './ShortsPostSocialRail';
import { ShortsItemShell } from './ShortsItemShell';
import { ShortsMobileExpandableText } from './ShortsMobileExpandableText';

type Props = {
  item: ShortsFeedItem;
  isActive: boolean;
  onSkip?: () => void;
};

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm lg:bg-white/90 lg:text-zinc-800">
      {label}
    </span>
  );
}

function MetaPanel({
  categoryLabel,
  title,
  teaser,
  sourceName,
  publishedLabel,
  href,
  ctaLabel,
}: {
  categoryLabel: string;
  title: string;
  teaser: string;
  sourceName: string;
  publishedLabel: string;
  href: string;
  ctaLabel: string;
}) {
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">{categoryLabel}</p>
        <h2 className="mt-2 line-clamp-3 text-base font-semibold leading-snug text-zinc-900">{title}</h2>
        {teaser ? (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-zinc-600">{teaser}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span>{sourceName}</span>
          {publishedLabel ? <span>· {publishedLabel}</span> : null}
        </div>
      </div>
      <Link
        href={href}
        className="inline-flex w-full items-center justify-center rounded-full border-2 border-orange-200/90 bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-3 text-sm font-bold text-white shadow-[0_8px_26px_rgba(255,80,0,0.32)] transition hover:brightness-110 active:scale-[0.99]"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}

function MobileOverlay({
  categoryLabel,
  title,
  teaser,
  sourceName,
  publishedLabel,
  href,
  ctaLabel,
}: {
  categoryLabel: string;
  title: string;
  teaser: string;
  sourceName: string;
  publishedLabel: string;
  href: string;
  ctaLabel: string;
}) {
  return (
    <div className="shorts-mobile-overlay-gradient px-3 pt-8 pr-[3.75rem] text-white max-[1023px]:pb-[max(1rem,calc(env(safe-area-inset-bottom,0px)+0.75rem))] sm:px-4 sm:pr-24 sm:pt-10">
      <div className="pointer-events-auto space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-300">{categoryLabel}</p>
        <h2 className="line-clamp-2 text-base font-bold leading-snug">{title}</h2>
        {teaser ? <ShortsMobileExpandableText text={teaser} /> : null}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-white/65">{sourceName}</span>
          {publishedLabel ? <span className="text-xs text-white/50">· {publishedLabel}</span> : null}
          <Link
            href={href}
            data-no-swipe
            className="ml-auto inline-flex rounded-full border border-white/40 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}

export function ShortsContentCard({ item, isActive, onSkip }: Props) {
  const p = item.payload;
  const title = String(p.title ?? '').trim();
  const teaser = String(p.teaser ?? '').trim();
  const sourceName = String(p.sourceName ?? 'XXREALIT');
  const href = String(p.href ?? '#');
  const categoryLabel = String(p.categoryLabel ?? SHORTS_BADGE_LABELS[item.contentType]);
  const publishedLabel = formatShortsDate(item.publishedAt);
  const [imgError, setImgError] = useState(false);
  const videoId = item.contentType === 'youtube' ? resolveYoutubeVideoId(p) ?? '' : '';
  const thumb = item.contentType === 'youtube' ? resolveShortsMediaUrl(p) ?? '' : '';
  const resolvedImg = item.contentType !== 'youtube' ? resolveShortsMediaUrl(p) : null;
  const imageSrc = resolvedImg ? nestAbsoluteAssetUrl(resolvedImg) : '';

  useEffect(() => {
    if (!title) onSkip?.();
    else if (item.contentType === 'youtube' && !videoId) onSkip?.();
    else if (item.contentType !== 'youtube' && !imageSrc) onSkip?.();
  }, [title, item.contentType, videoId, imageSrc, onSkip]);

  useEffect(() => {
    if (imgError) onSkip?.();
  }, [imgError, onSkip]);

  if (!title) return null;

  if (item.contentType === 'youtube') {
    if (!videoId) return null;
    const postId = String(p.id ?? '').trim();
    const likeCount = typeof p.likeCount === 'number' ? p.likeCount : 0;
    const commentCount = typeof p.commentCount === 'number' ? p.commentCount : 0;
    const likedByMe = Boolean(p.likedByMe);

    return (
      <ShortsItemShell
        badge={<Badge label={SHORTS_BADGE_LABELS.youtube} />}
        rightRail={
          postId ? (
            <ShortsPostSocialRail
              postId={postId}
              initialLikeCount={likeCount}
              initialCommentCount={commentCount}
              initialLikedByMe={likedByMe}
              shareUrl={href.startsWith('http') ? href : undefined}
              shareTitle={title}
            />
          ) : undefined
        }
        leftPanel={
          <MetaPanel
            categoryLabel={SHORTS_BADGE_LABELS.youtube}
            title={title}
            teaser={teaser}
            sourceName={sourceName}
            publishedLabel={publishedLabel}
            href={href}
            ctaLabel="Otevřít detail"
          />
        }
        center={
          <div className="absolute inset-0 lg:relative lg:h-full lg:w-full">
            <YoutubeLazyPlayer
              videoId={videoId}
              title={title}
              thumbnailUrl={thumb}
              embeddable={p.youtubeEmbeddable !== false}
              watchUrl={href.startsWith('http') ? href : undefined}
              fillStage
              autoPlay={isActive}
            />
          </div>
        }
        mobileOverlay={
          <MobileOverlay
            categoryLabel={SHORTS_BADGE_LABELS.youtube}
            title={title}
            teaser={teaser}
            sourceName={sourceName}
            publishedLabel={publishedLabel}
            href={href}
            ctaLabel="Otevřít"
          />
        }
      />
    );
  }

  if (!imageSrc || imgError) return null;

  const handleImgError = () => {
    setImgError(true);
  };

  return (
    <ShortsItemShell
      badge={<Badge label={SHORTS_BADGE_LABELS[item.contentType]} />}
      leftPanel={
        <MetaPanel
          categoryLabel={categoryLabel}
          title={title}
          teaser={teaser}
          sourceName={sourceName}
          publishedLabel={publishedLabel}
          href={href}
          ctaLabel="Číst více"
        />
      }
      center={
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt={title}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          onError={handleImgError}
        />
      }
      mobileOverlay={
        <MobileOverlay
          categoryLabel={categoryLabel}
          title={title}
          teaser={teaser}
          sourceName={sourceName}
          publishedLabel={publishedLabel}
          href={href}
          ctaLabel="Číst více"
        />
      }
    />
  );
}
