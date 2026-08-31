'use client';

import { useCallback, useRef, type ReactNode } from 'react';
import { useShortsFeedNav } from '@/components/shorts/shorts-feed-nav-context';
import { useMobileShortsHeader } from '@/components/video-feed/mobile-shorts-header-context';

const SWIPE_THRESHOLD_PX = 32;

type ShortsGestureLayerProps = {
  children?: ReactNode;
  className?: string;
  onTap?: () => void;
  enabled?: boolean;
};

function isNoSwipeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('[data-no-swipe]'));
}

export function ShortsGestureLayer({
  children,
  className = '',
  onTap,
  enabled = true,
}: ShortsGestureLayerProps) {
  const nav = useShortsFeedNav();
  const mobileHeader = useMobileShortsHeader();
  const startRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const swipedRef = useRef(false);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || mobileHeader?.scrollLocked) return;
      if (isNoSwipeTarget(e.target)) return;
      const touch = e.touches[0];
      if (!touch) return;
      startRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      swipedRef.current = false;
    },
    [enabled, mobileHeader],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || mobileHeader?.scrollLocked || !startRef.current || swipedRef.current) return;
      if (isNoSwipeTarget(e.target)) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startRef.current.x;
      const dy = touch.clientY - startRef.current.y;
      if (Math.abs(dy) > SWIPE_THRESHOLD_PX && Math.abs(dy) > Math.abs(dx)) {
        swipedRef.current = true;
        if (dy < 0) mobileHeader?.notifyVerticalSwipe('up');
        else mobileHeader?.notifyVerticalSwipe('down');
        if (!nav) return;
        if (dy < 0) nav.goNext();
        else nav.goPrev();
      }
    },
    [enabled, nav, mobileHeader],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !startRef.current) return;
      if (isNoSwipeTarget(e.target)) {
        startRef.current = null;
        return;
      }
      if (swipedRef.current) {
        startRef.current = null;
        return;
      }
      const touch = e.changedTouches[0];
      if (!touch) {
        startRef.current = null;
        return;
      }
      const dx = touch.clientX - startRef.current.x;
      const dy = touch.clientY - startRef.current.y;
      const elapsed = Date.now() - startRef.current.time;
      startRef.current = null;
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX && Math.abs(dy) < SWIPE_THRESHOLD_PX && elapsed < 400) {
        if (onTap) {
          onTap();
        } else {
          const layer = e.currentTarget as HTMLElement;
          layer.style.pointerEvents = 'none';
          const el = document.elementFromPoint(touch.clientX, touch.clientY);
          layer.style.pointerEvents = '';
          if (el instanceof HTMLElement && !isNoSwipeTarget(el)) {
            el.click();
          }
        }
      }
    },
    [enabled, onTap],
  );

  return (
    <div
      className={`shorts-gesture-layer touch-pan-y ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {children}
    </div>
  );
}
