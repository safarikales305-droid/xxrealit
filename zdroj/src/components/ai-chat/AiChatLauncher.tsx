'use client';

import { Bot } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AI_BUBBLE_SIZE,
  AI_DRAG_THRESHOLD_PX,
  clampBubbleY,
  defaultBubblePosition,
  DESKTOP_LAUNCHER_MIN_WIDTH,
  findNearestFreePosition,
  FLOATING_Z,
  readSafeInsets,
  snapSide,
  type BubbleSide,
} from '@/lib/floating-ui-geometry';
import {
  hasSeenDragHint,
  loadBubblePosition,
  markDragHintSeen,
  saveBubblePosition,
} from '@/lib/floating-ui-storage';
import { useFloatingUi } from '@/components/floating/FloatingUiProvider';
import { useMobileShortsImmersive } from '@/hooks/use-mobile-shorts-immersive';

type Props = {
  onOpen: () => void;
  busy?: boolean;
  hidden?: boolean;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originY: number;
  side: BubbleSide;
  dragged: boolean;
};

export function AiChatLauncher({ onOpen, busy = false, hidden = false }: Props) {
  const { getObstacleRects } = useFloatingUi();
  const mobileShortsImmersive = useMobileShortsImmersive();
  const launcherHidden = hidden || mobileShortsImmersive;
  const [isDesktop, setIsDesktop] = useState(false);
  const [ready, setReady] = useState(false);
  const [side, setSide] = useState<BubbleSide>('right');
  const [y, setY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [snapAnim, setSnapAnim] = useState(true);
  const dragRef = useRef<DragState | null>(null);

  const layoutBubble = useCallback(() => {
    const insets = readSafeInsets();
    const stored = loadBubblePosition();
    const vh = window.innerHeight;
    const base = stored
      ? {
          side: stored.side,
          y: clampBubbleY(stored.yRatio * vh, AI_BUBBLE_SIZE, insets, vh),
        }
      : defaultBubblePosition(insets);
    const obstacles = getObstacleRects('ai-chat-bubble');
    const resolved = findNearestFreePosition(base, obstacles, insets);
    setSide(resolved.side);
    setY(resolved.y);
    saveBubblePosition({ side: resolved.side, yRatio: resolved.y / vh });
    setReady(true);
  }, [getObstacleRects]);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_LAUNCHER_MIN_WIDTH}px)`);
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (isDesktop || launcherHidden) return;
    layoutBubble();
    if (!hasSeenDragHint()) {
      setShowHint(true);
      const t = window.setTimeout(() => {
        setShowHint(false);
        markDragHintSeen();
      }, 4500);
      return () => window.clearTimeout(t);
    }
  }, [launcherHidden, isDesktop, layoutBubble]);

  useEffect(() => {
    if (isDesktop || launcherHidden) return;
    const onResize = () => layoutBubble();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [launcherHidden, isDesktop, layoutBubble]);

  const finishDragSnap = useCallback(
    (nextSide: BubbleSide, nextY: number) => {
      const insets = readSafeInsets();
      const vh = window.innerHeight;
      const obstacles = getObstacleRects('ai-chat-bubble');
      const resolved = findNearestFreePosition({ side: nextSide, y: nextY }, obstacles, insets);
      setSnapAnim(true);
      setSide(resolved.side);
      setY(resolved.y);
      saveBubblePosition({ side: resolved.side, yRatio: resolved.y / vh });
      setDragging(false);
      dragRef.current = null;
    },
    [getObstacleRects],
  );

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (isDesktop) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originY: y,
      side,
      dragged: false,
    };
    setSnapAnim(false);
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const st = dragRef.current;
    if (!st || st.pointerId !== e.pointerId) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    if (!st.dragged && Math.hypot(dx, dy) >= AI_DRAG_THRESHOLD_PX) {
      st.dragged = true;
      setDragging(true);
    }
    if (st.dragged) {
      const insets = readSafeInsets();
      setY(clampBubbleY(st.originY + dy, AI_BUBBLE_SIZE, insets));
      setSide(snapSide(e.clientX));
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const st = dragRef.current;
    if (!st || st.pointerId !== e.pointerId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);

    if (!st.dragged) {
      dragRef.current = null;
      setDragging(false);
      onOpen();
      return;
    }

    const insets = readSafeInsets();
    const dy = e.clientY - st.startY;
    const nextY = clampBubbleY(st.originY + dy, AI_BUBBLE_SIZE, insets);
    finishDragSnap(snapSide(e.clientX), nextY);
  }

  function onPointerCancel(e: React.PointerEvent<HTMLButtonElement>) {
    const st = dragRef.current;
    if (!st || st.pointerId !== e.pointerId) return;
    setDragging(false);
    dragRef.current = null;
    layoutBubble();
    setSnapAnim(true);
  }

  function onDesktopClick() {
    onOpen();
  }

  function onDesktopKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  }

  if (launcherHidden) return null;

  if (isDesktop) {
    return (
      <div
        className="group fixed hidden lg:block"
        style={{
          right: 'max(1.25rem, env(safe-area-inset-right))',
          bottom: 'max(1.5rem, env(safe-area-inset-bottom))',
          zIndex: FLOATING_Z.aiBubble,
        }}
        data-floating-ui
        data-floating-ui-id="ai-chat-bubble"
      >
        <button
          type="button"
          onClick={onDesktopClick}
          onKeyDown={onDesktopKeyDown}
          className="flex max-w-[220px] items-center gap-2.5 rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-3.5 text-left text-white shadow-[0_10px_30px_rgba(255,80,0,0.35)] transition hover:brightness-110 hover:shadow-[0_14px_36px_rgba(255,80,0,0.42)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
          aria-label="Otevřít AI podporu XXREALIT"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15">
            <Bot className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold leading-tight">AI podpora</span>
            <span className="block text-[11px] font-medium text-white/85">Zeptejte se na reality</span>
          </span>
        </button>
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full right-0 mb-2 hidden rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg transition group-hover:block group-hover:opacity-100 group-focus-within:block group-focus-within:opacity-100"
        >
          AI asistent XXREALIT
        </span>
      </div>
    );
  }

  const insets = typeof window !== 'undefined' ? readSafeInsets() : { top: 0, right: 0, bottom: 0, left: 0 };
  const horizontal =
    side === 'left'
      ? { left: `max(12px, env(safe-area-inset-left))` }
      : { right: `max(12px, env(safe-area-inset-right))` };

  return (
    <>
      {showHint && ready ? (
        <div
          className="pointer-events-none fixed z-[519] max-w-[200px] rounded-xl bg-zinc-900/92 px-3 py-2 text-xs text-white shadow-lg lg:hidden"
          style={{
            ...horizontal,
            top: Math.max(insets.top + 8, y - 44),
          }}
        >
          AI podporu můžete přesunout
        </div>
      ) : null}

      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onDesktopKeyDown}
        className={`fixed flex touch-none items-center justify-center rounded-full bg-gradient-to-br from-[#ff6a00] to-[#ff3c00] text-white shadow-[0_10px_28px_rgba(255,80,0,0.38)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 lg:hidden ${
          dragging ? 'scale-[1.06] cursor-grabbing' : 'cursor-grab hover:shadow-[0_14px_34px_rgba(255,80,0,0.45)]'
        } ${busy ? 'animate-pulse' : ''} ${ready ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        style={{
          width: AI_BUBBLE_SIZE,
          height: AI_BUBBLE_SIZE,
          top: y,
          zIndex: FLOATING_Z.aiBubble,
          touchAction: 'none',
          transition: snapAnim ? 'left 180ms ease, right 180ms ease, transform 180ms ease, top 180ms ease' : 'none',
          ...horizontal,
        }}
        data-floating-ui
        data-floating-ui-id="ai-chat-bubble"
        data-floating-action="ai-chat"
        aria-label="Otevřít AI podporu XXREALIT"
      >
        <Bot className="size-7" strokeWidth={2.2} aria-hidden />
        {busy ? (
          <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-white bg-amber-300" />
        ) : null}
      </button>
    </>
  );
}
