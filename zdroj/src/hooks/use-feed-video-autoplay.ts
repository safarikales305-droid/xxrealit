'use client';

import { useEffect, type RefObject } from 'react';

export function pauseOtherFeedVideos(except?: HTMLVideoElement | null) {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('video[data-feed-video]').forEach((node) => {
    if (node instanceof HTMLVideoElement && node !== except) {
      node.pause();
    }
  });
}

/** Mobilní feed — přehrát jen jedno viditelné video, ostatní pozastavit. */
export function useFeedVideoAutoplay(
  enabled: boolean,
  videoRef: RefObject<HTMLVideoElement | null>,
  postId: string,
  muted: boolean,
) {
  useEffect(() => {
    if (!enabled) return;
    const el = videoRef.current;
    if (!el) return;

    el.dataset.feedVideo = postId;

    const tryPlay = () => {
      el.muted = muted;
      pauseOtherFeedVideos(el);
      void el.play().catch(() => {
        /* autoplay blocked */
      });
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!el) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
          tryPlay();
        } else {
          el.pause();
        }
      },
      { threshold: [0, 0.55, 0.75] },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, postId, videoRef, muted]);
}
