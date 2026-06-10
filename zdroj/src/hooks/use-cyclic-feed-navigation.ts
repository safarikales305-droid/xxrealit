'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_SWITCH_LOCK_MS = 400;
const ANIMATION_MS = 360;
const SWIPE_THRESHOLD_PX = 48;
const WHEEL_DELTA_THRESHOLD = 10;

export type FeedDirection = 'next' | 'prev';
export type FeedSlideRole = 'current' | 'outgoing' | 'incoming';

export type FeedSlideRender<T> = {
  item: T;
  role: FeedSlideRole;
  className: string;
  key: string;
  zIndex: number;
};

type TransitionState = {
  direction: FeedDirection;
  fromIndex: number;
  toIndex: number;
  animate: boolean;
};

type Options<T> = {
  debugLabel?: string;
  getId?: (item: T) => string;
  switchLockMs?: number;
  enabled?: boolean;
  /** URL dalšího / předchozího prvku pro přednačtení videa. */
  prefetchSrc?: (item: T) => string | null;
};

function outgoingSlideClass(direction: FeedDirection, animate: boolean): string {
  if (!animate) return 'feed-slide--idle-active';
  return direction === 'next' ? 'feed-slide--exit-next' : 'feed-slide--exit-prev';
}

function incomingSlideClass(direction: FeedDirection, animate: boolean): string {
  if (!animate) {
    return direction === 'next' ? 'feed-slide--enter-next' : 'feed-slide--enter-prev';
  }
  return 'feed-slide--idle-active';
}

export function useCyclicFeedNavigation<T>(
  items: readonly T[],
  options: Options<T> = {},
) {
  const {
    debugLabel = 'FEED',
    getId,
    switchLockMs = DEFAULT_SWITCH_LOCK_MS,
    enabled = true,
    prefetchSrc,
  } = options;

  const total = items.length;
  const itemsKey = useMemo(
    () => items.map((item, i) => (getId ? getId(item) : String(i))).join('\0'),
    [items, getId],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [transition, setTransition] = useState<TransitionState | null>(null);
  const [direction, setDirection] = useState<FeedDirection | null>(null);
  const isSwitchingRef = useRef(false);
  const currentIndexRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartYRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  currentIndexRef.current = currentIndex;

  useEffect(() => {
    setCurrentIndex(0);
    setTransition(null);
    setDirection(null);
  }, [itemsKey]);

  useEffect(() => {
    setCurrentIndex((prev) => {
      if (total === 0) return 0;
      if (prev > total - 1) return total - 1;
      return prev;
    });
  }, [total]);

  const currentItem = total > 0 ? items[currentIndex] : undefined;
  const incomingItem =
    transition && total > 0 ? items[transition.toIndex] : undefined;

  const prefetchUrls = useMemo(() => {
    if (!prefetchSrc || total <= 1) return [] as string[];
    const nextItem = items[(currentIndex + 1) % total];
    const prevItem = items[(currentIndex - 1 + total) % total];
    const urls = new Set<string>();
    for (const item of [nextItem, prevItem]) {
      if (!item) continue;
      const url = prefetchSrc(item)?.trim();
      if (url) urls.add(url);
    }
    if (transition && total > 0) {
      const incoming = items[transition.toIndex];
      if (incoming) {
        const url = prefetchSrc(incoming)?.trim();
        if (url) urls.add(url);
      }
    }
    return [...urls];
  }, [currentIndex, items, prefetchSrc, total, transition]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    // eslint-disable-next-line no-console
    console.log(`${debugLabel} TOTAL ITEMS`, total);
    // eslint-disable-next-line no-console
    console.log(
      `${debugLabel} IDS`,
      items.map((v, i) => (getId ? getId(v) : i)),
    );
    // eslint-disable-next-line no-console
    console.log(
      `${debugLabel} CURRENT INDEX`,
      currentIndex,
      currentItem && getId ? getId(currentItem) : currentItem,
    );
  }, [debugLabel, total, items, currentIndex, currentItem, getId]);

  const slidesToRender = useMemo((): FeedSlideRender<T>[] => {
    if (total === 0) return [];
    const idOf = (item: T, index: number) =>
      getId ? getId(item) : String(index);

    if (!transition) {
      const item = items[currentIndex];
      if (!item) return [];
      return [
        {
          item,
          role: 'current',
          className: 'feed-slide--idle-active',
          key: `current-${idOf(item, currentIndex)}`,
          zIndex: 1,
        },
      ];
    }

    const outgoing = items[transition.fromIndex];
    const incoming = items[transition.toIndex];
    if (!outgoing || !incoming) return [];

    return [
      {
        item: outgoing,
        role: 'outgoing',
        className: outgoingSlideClass(transition.direction, transition.animate),
        key: `out-${idOf(outgoing, transition.fromIndex)}`,
        zIndex: 1,
      },
      {
        item: incoming,
        role: 'incoming',
        className: incomingSlideClass(transition.direction, transition.animate),
        key: `in-${idOf(incoming, transition.toIndex)}`,
        zIndex: 2,
      },
    ];
  }, [currentIndex, getId, items, total, transition]);

  const startTransition = useCallback(
    (nextDirection: FeedDirection) => {
      if (!enabled || total <= 1) return;
      if (isSwitchingRef.current) return;

      const fromIndex = currentIndexRef.current;
      const toIndex =
        nextDirection === 'next'
          ? (fromIndex + 1) % total
          : (fromIndex - 1 + total) % total;

      isSwitchingRef.current = true;
      setDirection(nextDirection);
      setTransition({ direction: nextDirection, fromIndex, toIndex, animate: false });

      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => {
          setTransition((prev) => (prev ? { ...prev, animate: true } : null));
          rafRef.current = null;
        });
      });

      window.setTimeout(() => {
        setCurrentIndex(toIndex);
        setTransition(null);
        setDirection(null);
        isSwitchingRef.current = false;
      }, Math.max(ANIMATION_MS, switchLockMs));
    },
    [enabled, switchLockMs, total],
  );

  const goNext = useCallback(() => {
    startTransition('next');
  }, [startTransition]);

  const goPrev = useCallback(() => {
    startTransition('prev');
  }, [startTransition]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (!enabled || total < 1) return;
    const root = containerRef.current;
    if (!root) return;

    const onWheel = (e: WheelEvent) => {
      if (isSwitchingRef.current) return;
      if (Math.abs(e.deltaY) < WHEEL_DELTA_THRESHOLD) return;
      e.preventDefault();
      if (e.deltaY > 0) goNext();
      else goPrev();
    };

    const onTouchStart = (e: TouchEvent) => {
      touchStartYRef.current = e.touches[0]?.clientY ?? 0;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (isSwitchingRef.current) return;
      const endY = e.changedTouches[0]?.clientY ?? touchStartYRef.current;
      const dy = endY - touchStartYRef.current;
      if (dy < -SWIPE_THRESHOLD_PX) goNext();
      else if (dy > SWIPE_THRESHOLD_PX) goPrev();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isSwitchingRef.current) return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        goPrev();
      }
    };

    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('keydown', onKeyDown);

    return () => {
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('touchstart', onTouchStart);
      root.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, total, goNext, goPrev]);

  return {
    currentIndex,
    currentItem,
    incomingItem,
    direction,
    transition,
    slidesToRender,
    goNext,
    goPrev,
    containerRef,
    total,
    isSwitchingRef,
    isAnimating: transition != null,
    prefetchUrls,
  };
}
