'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { domRectToRect, type Rect } from '@/lib/floating-ui-geometry';

type FloatingEntry = {
  id: string;
  priority: number;
  el: HTMLElement;
};

type FloatingUiContextValue = {
  register: (id: string, priority: number, el: HTMLElement | null) => void;
  getObstacleRects: (excludeId?: string) => Rect[];
};

const FloatingUiContext = createContext<FloatingUiContextValue | null>(null);

export function FloatingUiProvider({ children }: { children: ReactNode }) {
  const entriesRef = useRef<Map<string, FloatingEntry>>(new Map());
  const [, bump] = useState(0);

  const register = useCallback((id: string, priority: number, el: HTMLElement | null) => {
    if (!el) {
      entriesRef.current.delete(id);
      bump((n) => n + 1);
      return;
    }
    entriesRef.current.set(id, { id, priority, el });
    bump((n) => n + 1);
  }, []);

  const getObstacleRects = useCallback((excludeId?: string) => {
    const rects: Rect[] = [];
    for (const [id, entry] of entriesRef.current) {
      if (excludeId && id === excludeId) continue;
      const r = entry.el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) rects.push(domRectToRect(r));
    }
    if (typeof document !== 'undefined') {
      document.querySelectorAll('[data-floating-ui]').forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (excludeId && node.dataset.floatingUiId === excludeId) return;
        const r = node.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) rects.push(domRectToRect(r));
      });
    }
    return rects;
  }, []);

  const value = useMemo(() => ({ register, getObstacleRects }), [getObstacleRects, register]);

  return <FloatingUiContext.Provider value={value}>{children}</FloatingUiContext.Provider>;
}

export function useFloatingUi() {
  const ctx = useContext(FloatingUiContext);
  if (!ctx) {
    return {
      register: () => undefined,
      getObstacleRects: () => [] as Rect[],
    };
  }
  return ctx;
}

export function useFloatingUiRegister(id: string, priority: number) {
  const { register } = useFloatingUi();
  const ref = useCallback(
    (el: HTMLElement | null) => {
      register(id, priority, el);
    },
    [id, priority, register],
  );
  return ref;
}

/** Skenuje DOM pro [data-floating-ui] bez registrace — fallback pro starší komponenty. */
export function useScanFloatingObstacles(): Rect[] {
  const [rects, setRects] = useState<Rect[]>([]);

  useEffect(() => {
    function scan() {
      const next: Rect[] = [];
      document.querySelectorAll('[data-floating-ui]').forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const r = node.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) next.push(domRectToRect(r));
      });
      setRects(next);
    }
    scan();
    window.addEventListener('resize', scan);
    window.addEventListener('scroll', scan, true);
    const id = window.setInterval(scan, 1500);
    return () => {
      window.removeEventListener('resize', scan);
      window.removeEventListener('scroll', scan, true);
      window.clearInterval(id);
    };
  }, []);

  return rects;
}
