'use client';

import { useCallback } from 'react';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { nestFacebookPostRefreshMedia } from '@/lib/nest-client';
import type { ResolvedFacebookPostMedia } from '@/lib/facebook-post-media';
import { getFacebookVideoContainerClass } from '@/lib/facebook-post-media';
import { FacebookEmbedCard } from '@/components/community/FacebookEmbedCard';
import { FacebookInlineVideoPlayer } from '@/components/community/FacebookInlineVideoPlayer';

type Props = {
  media: ResolvedFacebookPostMedia;
  facebookPostType?: string | null;
  postId?: string;
  feedAutoplay?: boolean;
  compact?: boolean;
  blurred?: boolean;
  muted?: boolean;
  showMuteToggle?: boolean;
  onToggleMute?: () => void;
  onOpenDetail?: () => void;
  className?: string;
  /** Mobilní feed — video až ke krajům obrazovky. */
  edgeToEdge?: boolean;
};

export function FacebookPostMediaBlock({
  media,
  facebookPostType,
  postId,
  feedAutoplay = false,
  compact = false,
  blurred = false,
  muted = true,
  showMuteToggle = false,
  onToggleMute,
  onOpenDetail,
  className = 'mt-3',
  edgeToEdge = false,
}: Props) {
  const refreshVideoSrc = useCallback(async () => {
    if (!postId) return null;
    const res = await nestFacebookPostRefreshMedia(postId);
    if (!res.ok) return null;
    return res.videoUrl?.trim() || null;
  }, [postId]);

  if (media.mode === 'none') return null;

  const containerClass = getFacebookVideoContainerClass(facebookPostType);
  const paddedClass = edgeToEdge
    ? `${className} w-full min-w-0`
    : `${className} w-full min-w-0 px-3 md:px-4`;

  if (media.mode === 'facebook-embed' && media.embedUrl) {
    return (
      <div className={paddedClass}>
        <div className={`${containerClass} overflow-hidden ${edgeToEdge ? '' : 'rounded-2xl'} bg-black`}>
          <FacebookEmbedCard
            embedUrl={media.embedUrl}
            fallbackUrl={media.permalink || media.embedUrl}
            fallbackImage={null}
            postType={facebookPostType ?? null}
            compact={compact}
            fillContainer
          />
        </div>
      </div>
    );
  }

  if (media.mode === 'facebook-external' && media.permalink) {
    return (
      <div className={paddedClass}>
        <div
          className={`${containerClass} relative overflow-hidden ${edgeToEdge ? '' : 'rounded-2xl'} border border-[#1877F2]/25 bg-zinc-900`}
        >
          <div className="flex h-full min-h-[200px] items-center justify-center bg-gradient-to-br from-[#1877F2]/40 via-[#1877F2]/20 to-zinc-900">
            <span className="text-5xl text-white/90">f</span>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 p-4 text-center">
            <p className="text-sm font-medium text-white">Video z Facebooku</p>
            <a
              href={media.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-[#1877F2] px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-[#166fe0]"
            >
              Přehrát na Facebooku
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (media.mode === 'image' && media.imageUrl) {
    const body = (
      <div className={`relative w-full overflow-hidden bg-zinc-100 ${edgeToEdge ? '' : 'rounded-2xl'}`}>
        <img
          src={nestAbsoluteAssetUrl(media.imageUrl)}
          alt=""
          className={`aspect-[16/9] w-full object-cover ${blurred ? 'blur-sm' : ''}`}
        />
      </div>
    );
    if (onOpenDetail) {
      return (
        <button type="button" className={`${paddedClass} block text-left`} onClick={onOpenDetail}>
          {body}
        </button>
      );
    }
    return <div className={paddedClass}>{body}</div>;
  }

  if (media.mode === 'video' && media.videoUrl) {
    return (
      <div className={paddedClass}>
        <FacebookInlineVideoPlayer
          src={media.videoUrl}
          poster={media.posterUrl}
          postId={postId}
          permalinkFallback={media.permalink}
          onRefreshSrc={postId ? refreshVideoSrc : undefined}
          feedAutoplay={feedAutoplay}
          blurred={blurred}
          muted={muted}
          showMuteToggle={showMuteToggle}
          onToggleMute={onToggleMute}
          onOpenDetail={onOpenDetail}
        />
      </div>
    );
  }

  return null;
}
