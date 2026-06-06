'use client';

import type { ReactNode } from 'react';

type Props = {
  src: string;
  className?: string;
  controls?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  playsInline?: boolean;
  children?: ReactNode;
};

/** Mobilní 9:16 rámeček pro Shorts video — na PC max 420px, na mobilu přes šířku. */
export function ShortsVideoFrame({
  src,
  className = '',
  controls = true,
  autoPlay = false,
  muted = false,
  playsInline = true,
  children,
}: Props) {
  return (
    <div
      className={`shorts-video-frame mx-auto w-full max-w-[420px] overflow-hidden rounded-[20px] bg-black shadow-lg max-md:max-w-none max-md:rounded-none ${className}`}
      style={{ aspectRatio: '9 / 16', maxHeight: 'calc(100vh - 140px)' }}
    >
      <video
        src={src}
        controls={controls}
        autoPlay={autoPlay}
        muted={muted}
        playsInline={playsInline}
        className="h-full w-full object-cover max-md:h-[calc(100dvh-140px)] max-md:w-full"
      />
      {children}
    </div>
  );
}
