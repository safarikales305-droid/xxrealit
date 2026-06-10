'use client';

import type { ReactNode } from 'react';
import {
  useCyclicFeedNavigation,
  type FeedSlideRole,
} from '@/hooks/use-cyclic-feed-navigation';

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
  children,
}: Props<T>) {
  const { containerRef, slidesToRender, total, transition } = useCyclicFeedNavigation(
    items,
    {
      getId,
      debugLabel,
      switchLockMs: 400,
    },
  );

  if (total === 0) {
    return emptyState;
  }

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className={`outline-none ${className}`}
    >
      <div className={`feed-viewport ${viewportClassName}`}>
        {slidesToRender.map((slide) => {
          const itemIndex = items.findIndex((x) => getId(x) === getId(slide.item));
          const isActive =
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
