'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

const HAVE_CURRENT_DATA = 2;

type Props = {
  clipId: string;
  src: string;
  posterUrl?: string;
  isActive?: boolean;
  loop?: boolean;
  controls?: boolean;
  muted?: boolean;
  videoRef?: RefObject<HTMLVideoElement | null>;
  videoClassName?: string;
  onError?: (clipId: string, error?: unknown) => void;
};

export function ShortsSlideVideo({
  clipId,
  src,
  posterUrl = '',
  isActive = true,
  loop = true,
  controls = true,
  muted = true,
  videoRef: videoRefProp,
  videoClassName = '',
  onError,
}: Props) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const videoRef = videoRefProp ?? internalRef;
  const [videoReady, setVideoReady] = useState(false);
  const poster = posterUrl.trim();

  useEffect(() => {
    setVideoReady(false);
  }, [clipId, src]);

  const syncReady = useCallback(() => {
    const el = videoRef.current;
    if (el && el.readyState >= HAVE_CURRENT_DATA) {
      setVideoReady(true);
    }
  }, [videoRef]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const onLoadedData = () => syncReady();
    const onCanPlay = () => syncReady();
    el.addEventListener('loadeddata', onLoadedData);
    el.addEventListener('canplay', onCanPlay);
    syncReady();

    return () => {
      el.removeEventListener('loadeddata', onLoadedData);
      el.removeEventListener('canplay', onCanPlay);
    };
  }, [clipId, src, syncReady, videoRef]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoReady) return;
    if (isActive) {
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }, [isActive, videoReady, videoRef]);

  const showPoster = Boolean(poster) && !videoReady;
  const showVideo = videoReady;

  return (
    <div className="shorts-slide absolute inset-0 flex items-center justify-center">
      {poster ? (
        <img
          src={poster}
          alt=""
          aria-hidden
          className={`shorts-slide-poster transition-opacity duration-200 ${
            showPoster ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ) : null}
      <video
        ref={videoRef}
        data-clip-id={clipId}
        src={src}
        poster={poster || undefined}
        preload="auto"
        playsInline
        loop={loop}
        controls={controls}
        muted={muted}
        className={`shorts-slide-video transition-opacity duration-200 ${
          showVideo ? 'opacity-100' : 'opacity-0'
        } ${videoClassName}`}
        onLoadedData={syncReady}
        onCanPlay={syncReady}
        onError={(event) => onError?.(clipId, event)}
      />
    </div>
  );
}
