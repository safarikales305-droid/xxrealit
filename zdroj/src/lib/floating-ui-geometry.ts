export const FLOATING_Z = {
  actions: 500,
  aiBubble: 520,
  chatPanel: 700,
  modal: 1000,
} as const;

export const AI_BUBBLE_SIZE = 60;
export const AI_DRAG_THRESHOLD_PX = 8;
export const DESKTOP_LAUNCHER_MIN_WIDTH = 1024;

export type BubbleSide = 'left' | 'right';

export type StoredBubblePosition = {
  side: BubbleSide;
  yRatio: number;
};

export type SafeInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function readSafeInsets(): SafeInsets {
  if (typeof window === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:env(safe-area-inset-top);right:env(safe-area-inset-right);bottom:env(safe-area-inset-bottom);left:env(safe-area-inset-left);pointer-events:none;visibility:hidden;';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const inset = (v: string) => Number.parseFloat(v) || 0;
  const result = {
    top: inset(cs.top),
    right: inset(cs.right),
    bottom: inset(cs.bottom),
    left: inset(cs.left),
  };
  probe.remove();
  return result;
}

export function bubbleRect(side: BubbleSide, y: number, size = AI_BUBBLE_SIZE, vw = window.innerWidth): Rect {
  const x = side === 'left' ? 0 : vw - size;
  return { x: side === 'left' ? 12 : x - 12, y, width: size, height: size };
}

export function clampBubbleY(
  y: number,
  size: number,
  insets: SafeInsets,
  vh = window.innerHeight,
): number {
  const minY = insets.top + 8;
  const maxY = vh - size - insets.bottom - 8;
  return Math.max(minY, Math.min(y, maxY));
}

export function rectsIntersect(a: Rect, b: Rect, padding = 8): boolean {
  return !(
    a.x + a.width + padding <= b.x ||
    b.x + b.width + padding <= a.x ||
    a.y + a.height + padding <= b.y ||
    b.y + b.height + padding <= a.y
  );
}

export function domRectToRect(r: DOMRect): Rect {
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

export function defaultBubblePosition(
  insets: SafeInsets,
  size = AI_BUBBLE_SIZE,
  vh = window.innerHeight,
): { side: BubbleSide; y: number; yRatio: number } {
  const bottomOffset = 100 + insets.bottom;
  const y = clampBubbleY(vh - bottomOffset - size, size, insets, vh);
  return { side: 'right', y, yRatio: y / vh };
}

export function snapSide(centerX: number, vw = window.innerWidth): BubbleSide {
  return centerX < vw / 2 ? 'left' : 'right';
}

export function findNearestFreePosition(
  preferred: { side: BubbleSide; y: number },
  obstacles: Rect[],
  insets: SafeInsets,
  size = AI_BUBBLE_SIZE,
): { side: BubbleSide; y: number } {
  const sides: BubbleSide[] = [preferred.side, preferred.side === 'left' ? 'right' : 'left'];
  const vh = window.innerHeight;
  const step = 72;
  const candidates: Array<{ side: BubbleSide; y: number }> = [];

  for (const side of sides) {
    for (let offset = 0; offset <= vh; offset += step) {
      candidates.push({ side, y: clampBubbleY(preferred.y - offset, size, insets, vh) });
      if (offset > 0) {
        candidates.push({ side, y: clampBubbleY(preferred.y + offset, size, insets, vh) });
      }
    }
  }

  for (const c of candidates) {
    const rect =
      c.side === 'left'
        ? { x: insets.left + 12, y: c.y, width: size, height: size }
        : { x: window.innerWidth - size - insets.right - 12, y: c.y, width: size, height: size };
    const collides = obstacles.some((o) => rectsIntersect(rect, o));
    if (!collides) return c;
  }

  return { side: preferred.side, y: clampBubbleY(preferred.y, size, insets, vh) };
}
