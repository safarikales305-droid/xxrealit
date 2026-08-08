import type { StoredBubblePosition } from './floating-ui-geometry';

export const AI_BUBBLE_POSITION_KEY = 'xxrealit_ai_chat_bubble_position';
export const AI_DRAG_HINT_SEEN_KEY = 'xxrealit_ai_drag_hint_seen';

export function loadBubblePosition(): StoredBubblePosition | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(AI_BUBBLE_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredBubblePosition;
    if (parsed.side !== 'left' && parsed.side !== 'right') return null;
    if (typeof parsed.yRatio !== 'number' || Number.isNaN(parsed.yRatio)) return null;
    return {
      side: parsed.side,
      yRatio: Math.max(0, Math.min(1, parsed.yRatio)),
    };
  } catch {
    return null;
  }
}

export function saveBubblePosition(pos: StoredBubblePosition): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AI_BUBBLE_POSITION_KEY, JSON.stringify(pos));
  } catch {
    /* ignore quota */
  }
}

export function hasSeenDragHint(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(AI_DRAG_HINT_SEEN_KEY) === 'true';
}

export function markDragHintSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AI_DRAG_HINT_SEEN_KEY, 'true');
  } catch {
    /* ignore */
  }
}
