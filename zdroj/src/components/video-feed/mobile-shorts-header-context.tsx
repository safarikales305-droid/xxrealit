'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useShortsEmailSignup } from '@/hooks/use-shorts-email-signup';

type MobileShortsHeaderContextValue = {
  headerVisible: boolean;
  notifyVerticalSwipe: (direction: 'up' | 'down') => void;
  scrollLocked: boolean;
  setScrollLocked: (locked: boolean) => void;
};

const MobileShortsHeaderContext = createContext<MobileShortsHeaderContextValue | null>(null);

export function MobileShortsHeaderProvider({ children }: { children: ReactNode }) {
  const [headerVisible, setHeaderVisible] = useState(true);
  const [scrollLocked, setScrollLocked] = useState(false);
  const { open: signupOpen } = useShortsEmailSignup();

  const notifyVerticalSwipe = useCallback(
    (direction: 'up' | 'down') => {
      if (scrollLocked || signupOpen) return;
      if (direction === 'up') {
        setHeaderVisible(false);
      } else {
        setHeaderVisible(true);
      }
    },
    [scrollLocked, signupOpen],
  );

  const value = useMemo(
    () => ({
      headerVisible,
      notifyVerticalSwipe,
      scrollLocked: scrollLocked || signupOpen,
      setScrollLocked,
    }),
    [headerVisible, notifyVerticalSwipe, scrollLocked, signupOpen],
  );

  return (
    <MobileShortsHeaderContext.Provider value={value}>
      <div
        data-mobile-shorts-header={headerVisible ? 'visible' : 'hidden'}
        className="flex h-full min-h-0 min-w-0 flex-col"
      >
        {children}
      </div>
    </MobileShortsHeaderContext.Provider>
  );
}

export function useMobileShortsHeader(): MobileShortsHeaderContextValue | null {
  return useContext(MobileShortsHeaderContext);
}
