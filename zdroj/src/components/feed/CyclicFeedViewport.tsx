'use client';

import { useEffect, type ReactNode } from 'react';
import {
  useCyclicFeedNavigation,
  type FeedSlideRole,
} from '@/hooks/use-cyclic-feed-navigation';

export type CyclicFeedNav = {
  goNext: () => void;
  goPrev: () => void;
  total: number;
  currentIndex: number;
};

type SlideContext = {
  role: FeedSlideRole;
  isActive: boolean;
  index: number;
};

type Props<T> = {
  items: readonly T[];
  getId: (item: T) => string;
  debugLabel?: string;
  className?: string;
  viewportClassName?: string;
  slideClassName?: string;
  emptyState?: ReactNode;
  prefetchSrc?: (item: T) => string | null;
  onNavigation?: (nav: CyclicFeedNav) => void;
  initialIndex?: number;
  children: (item: T, ctx: SlideContext) => ReactNode;
};

export function CyclicFeedViewport<T>({
  items,
  getId,
  debugLabel,
  className = '',
  viewportClassName = '',
  slideClassName = '',
  emptyState = null,
  prefetchSrc,
  onNavigation,
  initialIndex = 0,
  children,
}: Props<T>) {
  const {
    containerRef,
    slidesToRender,
    total,
    transition,
    goNext,
    goPrev,
    currentIndex,
    prefetchUrls,
  } = useCyclicFeedNavigation(items, {
    getId,
    debugLabel,
    switchLockMs: 400,
    prefetchSrc,
    initialIndex,
  });

  useEffect(() => {
    onNavigation?.({ goNext, goPrev, total, currentIndex });
  }, [onNavigation, goNext, goPrev, total, currentIndex]);

  if (total === 0) {
    return emptyState;
  }

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className={`outline-none ${className}`}
    >
      {prefetchUrls.map((url) => (
        <video
          key={`prefetch-${url}`}
          src={url}
          preload="auto"
          muted
          playsInline
          className="pointer-events-none absolute size-0 overflow-hidden opacity-0"
          aria-hidden
          tabIndex={-1}
        />
      ))}
      <div className={`feed-viewport ${viewportClassName}`}>
        {slidesToRender.map((slide) => {
          const itemIndex = items.findIndex((x) => getId(x) === getId(slide.item));
          const isActive =
            slide.role === 'outgoing' ||
            slide.role === 'incoming' ||
            (slide.role === 'current' && !transition);
          return (
            <div
              key={slide.key}
              className={`feed-slide ${slide.className} ${slideClassName}`}
              style={{ zIndex: slide.zIndex }}
            >
              {children(slide.item, {
                role: slide.role,
                isActive,
                index: itemIndex >= 0 ? itemIndex : 0,
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
