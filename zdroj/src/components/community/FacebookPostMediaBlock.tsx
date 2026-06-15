'use client';

import { nestAbsoluteAssetUrl } from '@/lib/api';
import type { ResolvedFacebookPostMedia } from '@/lib/facebook-post-media';
import { getFacebookVideoContainerClass } from '@/lib/facebook-post-media';
import { FacebookEmbedCard } from '@/components/community/FacebookEmbedCard';

type Props = {
  media: ResolvedFacebookPostMedia;
  facebookPostType?: string | null;
  compact?: boolean;
  blurred?: boolean;
  muted?: boolean;
  showMuteToggle?: boolean;
  onOpenDetail?: () => void;
  className?: string;
};

export function FacebookPostMediaBlock({
  media,
  facebookPostType,
  compact = false,
  blurred = false,
  muted = false,
  showMuteToggle = false,
  onOpenDetail,
  className = 'mt-3',
}: Props) {
  if (media.mode === 'none') return null;

  const containerClass = getFacebookVideoContainerClass(facebookPostType);
  const paddedClass = `${className} w-full min-w-0 px-3 md:px-4`;

  if (media.mode === 'facebook-embed' && media.embedUrl) {
    return (
      <div className={paddedClass}>
        <div className={`${containerClass} overflow-hidden rounded-2xl bg-black`}>
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
          className={`${containerClass} relative overflow-hidden rounded-2xl border border-[#1877F2]/25 bg-zinc-900`}
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
      <div className="relative w-full overflow-hidden rounded-2xl bg-black">
        <img
          src={nestAbsoluteAssetUrl(media.imageUrl)}
          alt=""
          className={`h-auto max-h-[70vh] w-full object-contain ${blurred ? 'blur-sm' : ''}`}
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
    const video = (
      <div className={`${containerClass} overflow-hidden rounded-2xl bg-black`}>
        <video
          src={nestAbsoluteAssetUrl(media.videoUrl)}
          poster={media.posterUrl ? nestAbsoluteAssetUrl(media.posterUrl) : undefined}
          playsInline
          controls
          preload="metadata"
          muted={showMuteToggle ? muted : undefined}
          className={`h-full w-full object-contain ${blurred ? 'blur-sm' : ''}`}
        />
      </div>
    );
    if (onOpenDetail) {
      return (
        <button type="button" className={`${paddedClass} block text-left`} onClick={onOpenDetail}>
          {video}
        </button>
      );
    }
    return <div className={paddedClass}>{video}</div>;
  }

  return null;
}
