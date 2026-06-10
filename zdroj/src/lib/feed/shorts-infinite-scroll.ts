const SNAP_TOLERANCE_PX = 8;
const WRAP_COOLDOWN_MS = 450;
const SWIPE_UP_THRESHOLD_PX = 48;

function getMaxScroll(root: HTMLElement): number {
  return Math.max(0, root.scrollHeight - root.clientHeight);
}

function isAtLastSlide(root: HTMLElement): boolean {
  const max = getMaxScroll(root);
  if (max <= SNAP_TOLERANCE_PX) return true;
  return root.scrollTop >= max - SNAP_TOLERANCE_PX;
}

function isAtFirstSlide(root: HTMLElement): boolean {
  return root.scrollTop <= SNAP_TOLERANCE_PX;
}

/**
 * Nekonečná smyčka shorts feedu: poslední slide zůstane viditelný,
 * teprve další scroll dolů (kolečko / swipe / šipka) přejde na první.
 */
export function attachShortsInfiniteScrollLoop(root: HTMLElement): () => void {
  let wrapCooldown = false;
  let touchStartY = 0;
  let touchStartedAtLast = false;

  const wrapToStart = () => {
    if (wrapCooldown) return;
    wrapCooldown = true;
    root.scrollTo({ top: 0, behavior: 'auto' });
    window.setTimeout(() => {
      wrapCooldown = false;
    }, WRAP_COOLDOWN_MS);
  };

  const onWheel = (e: WheelEvent) => {
    if (e.deltaY <= 0) return;
    const max = getMaxScroll(root);
    if (max <= SNAP_TOLERANCE_PX) return;
    if (!isAtLastSlide(root)) return;
    e.preventDefault();
    wrapToStart();
  };

  const onTouchStart = (e: TouchEvent) => {
    touchStartY = e.touches[0]?.clientY ?? 0;
    touchStartedAtLast = isAtLastSlide(root);
  };

  const onTouchEnd = (e: TouchEvent) => {
    const max = getMaxScroll(root);
    if (max <= SNAP_TOLERANCE_PX) return;
    if (!touchStartedAtLast) return;
    const endY = e.changedTouches[0]?.clientY ?? touchStartY;
    const dy = endY - touchStartY;
    if (dy < -SWIPE_UP_THRESHOLD_PX) {
      wrapToStart();
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'PageDown') return;
    const max = getMaxScroll(root);
    if (max <= SNAP_TOLERANCE_PX) return;
    if (!isAtLastSlide(root)) return;
    e.preventDefault();
    wrapToStart();
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
}

export function clampShortsScrollToLastSlide(root: HTMLElement): void {
  const max = getMaxScroll(root);
  if (max > 0 && root.scrollTop > max) {
    root.scrollTop = max;
  }
}

export { isAtFirstSlide, isAtLastSlide, getMaxScroll };
