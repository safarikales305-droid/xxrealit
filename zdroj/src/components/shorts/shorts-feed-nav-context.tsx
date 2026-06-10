'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { createContext, useContext, type ReactNode } from 'react';

export type ShortsFeedNavApi = {
  goNext: () => void;
  goPrev: () => void;
};

const ShortsFeedNavContext = createContext<ShortsFeedNavApi | null>(null);

export function ShortsFeedNavProvider({
  value,
  children,
}: {
  value: ShortsFeedNavApi;
  children: ReactNode;
}) {
  return (
    <ShortsFeedNavContext.Provider value={value}>{children}</ShortsFeedNavContext.Provider>
  );
}

export function useShortsFeedNav(): ShortsFeedNavApi | null {
  return useContext(ShortsFeedNavContext);
}

export function DesktopShortsNavButtons({ className = '' }: { className?: string }) {
  const nav = useShortsFeedNav();
  if (!nav) return null;

  return (
    <div className={`desktop-shorts-nav ${className}`} aria-label="Navigace Shorts">
      <button
        type="button"
        className="desktop-shorts-nav-btn"
        aria-label="Předchozí inzerát"
        onClick={nav.goPrev}
      >
        <ChevronUp className="size-6" strokeWidth={2.25} aria-hidden />
      </button>
      <button
        type="button"
        className="desktop-shorts-nav-btn"
        aria-label="Další inzerát"
        onClick={nav.goNext}
      >
        <ChevronDown className="size-6" strokeWidth={2.25} aria-hidden />
      </button>
    </div>
  );
}
