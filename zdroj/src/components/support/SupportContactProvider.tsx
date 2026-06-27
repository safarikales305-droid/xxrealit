'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { SupportTicketCategory } from '@/lib/support-tickets';
import { SupportTicketModal } from '@/components/support/SupportTicketModal';

export type SupportOpenOptions = {
  subject?: string;
  category?: SupportTicketCategory;
};

type SupportContactContextValue = {
  openSupport: (options?: SupportOpenOptions) => void;
  closeSupport: () => void;
};

const SupportContactContext = createContext<SupportContactContextValue | null>(null);

export function SupportContactProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<SupportOpenOptions>({});

  const openSupport = useCallback((opts?: SupportOpenOptions) => {
    setOptions(opts ?? {});
    setOpen(true);
  }, []);

  const closeSupport = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ openSupport, closeSupport }),
    [openSupport, closeSupport],
  );

  return (
    <SupportContactContext.Provider value={value}>
      {children}
      <SupportTicketModal open={open} onClose={closeSupport} initial={options} />
    </SupportContactContext.Provider>
  );
}

export function useSupportContact() {
  const ctx = useContext(SupportContactContext);
  if (!ctx) {
    throw new Error('useSupportContact must be used within SupportContactProvider');
  }
  return ctx;
}
