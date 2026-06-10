'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_SWITCH_LOCK_MS = 350;
const SWIPE_THRESHOLD_PX = 48;
const WHEEL_DELTA_THRESHOLD = 10;

type Options<T> = {
  debugLabel?: string;
  getId?: (item: T) => string;
  switchLockMs?: number;
  enabled?: boolean;
};

export function useCyclicFeedNavigation<T>(
  items: readonly T[],
  options: Options<T> = {},
) {
  const {
    debugLabel = 'FEED',
    getId,
    switchLockMs = DEFAULT_SWITCH_LOCK_MS,
    enabled = true,
  } = options;

  const total = items.length;
  const itemsKey = useMemo(
    () => items.map((item, i) => (getId ? getId(item) : String(i))).join('\0'),
    [items, getId],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const isSwitchingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartYRef = useRef(0);

  useEffect(() => {
    setCurrentIndex(0);
  }, [itemsKey]);

  useEffect(() => {
    setCurrentIndex((prev) => {
      if (total === 0) return 0;
      if (prev > total - 1) return total - 1;
      return prev;
    });
  }, [total]);

  const currentItem = total > 0 ? items[currentIndex] : undefined;

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

  const goNext = useCallback(() => {
    if (!enabled || total <= 1) return;
    if (isSwitchingRef.current) return;
    isSwitchingRef.current = true;
    setCurrentIndex((prev) => (prev + 1) % total);
    window.setTimeout(() => {
      isSwitchingRef.current = false;
    }, switchLockMs);
  }, [enabled, total, switchLockMs]);

  const goPrev = useCallback(() => {
    if (!enabled || total <= 1) return;
    if (isSwitchingRef.current) return;
    isSwitchingRef.current = true;
    setCurrentIndex((prev) => (prev - 1 + total) % total);
    window.setTimeout(() => {
      isSwitchingRef.current = false;
    }, switchLockMs);
  }, [enabled, total, switchLockMs]);

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
    goNext,
    goPrev,
    containerRef,
    total,
    isSwitchingRef,
  };
}
