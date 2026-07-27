'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AdminLoadingOverlay } from './AdminLoadingSpinner';

export type AdminLoadingEntry = {
  key: string;
  label: string;
  progress?: number;
  sublabel?: string;
};

type StartInput = {
  key: string;
  label: string;
  progress?: number;
  sublabel?: string;
};

type UpdateInput = {
  key: string;
  label?: string;
  progress?: number;
  sublabel?: string;
};

type AdminLoadingContextValue = {
  entries: AdminLoadingEntry[];
  startLoading: (input: StartInput) => void;
  updateLoading: (input: UpdateInput) => void;
  stopLoading: (key: string) => void;
  isLoading: (key?: string) => boolean;
};

const AdminLoadingContext = createContext<AdminLoadingContextValue | null>(null);

export function AdminLoadingProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<AdminLoadingEntry[]>([]);

  const startLoading = useCallback((input: StartInput) => {
    setEntries((prev) => {
      const rest = prev.filter((e) => e.key !== input.key);
      return [...rest, { key: input.key, label: input.label, progress: input.progress, sublabel: input.sublabel }];
    });
  }, []);

  const updateLoading = useCallback((input: UpdateInput) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.key === input.key
          ? {
              ...e,
              label: input.label ?? e.label,
              progress: input.progress ?? e.progress,
              sublabel: input.sublabel ?? e.sublabel,
            }
          : e,
      ),
    );
  }, []);

  const stopLoading = useCallback((key: string) => {
    setEntries((prev) => prev.filter((e) => e.key !== key));
  }, []);

  const isLoading = useCallback(
    (key?: string) => {
      if (!key) return entries.length > 0;
      return entries.some((e) => e.key === key);
    },
    [entries],
  );

  const value = useMemo(
    () => ({ entries, startLoading, updateLoading, stopLoading, isLoading }),
    [entries, startLoading, updateLoading, stopLoading, isLoading],
  );

  const primary = entries[entries.length - 1];

  return (
    <AdminLoadingContext.Provider value={value}>
      {children}
      <AdminLoadingOverlay
        visible={Boolean(primary)}
        label={primary?.label}
        progress={primary?.progress}
        sublabel={primary?.sublabel}
      />
    </AdminLoadingContext.Provider>
  );
}

export function useAdminLoading() {
  const ctx = useContext(AdminLoadingContext);
  if (!ctx) {
    throw new Error('useAdminLoading must be used within AdminLoadingProvider');
  }
  return ctx;
}

/** Runs async work with global overlay; always stops loading in finally. */
export async function withAdminLoading<T>(
  ctx: AdminLoadingContextValue,
  key: string,
  label: string,
  fn: () => Promise<T>,
  options?: { onProgress?: (update: (p: UpdateInput) => void) => void },
): Promise<T> {
  ctx.startLoading({ key, label });
  try {
    options?.onProgress?.((p) => ctx.updateLoading({ ...p, key }));
    return await fn();
  } finally {
    ctx.stopLoading(key);
  }
}
