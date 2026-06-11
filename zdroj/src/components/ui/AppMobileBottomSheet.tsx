'use client';

import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { appMobilePanel } from '@/components/ui/app-mobile-panel-styles';

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  ariaLabel?: string;
};

export function AppMobileBottomSheet({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  ariaLabel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col justify-end md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
    >
      <button
        type="button"
        className={appMobilePanel.overlay}
        aria-label="Zavřít"
        onClick={onClose}
      />
      <div
        className={`relative z-[101] flex max-h-[min(88dvh,calc(100dvh-env(safe-area-inset-bottom)))] w-full flex-col ${appMobilePanel.sheet} ${appMobilePanel.sheetRoundedTop} motion-safe:animate-[app-sheet-in_0.28s_cubic-bezier(0.22,1,0.36,1)]`}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-white/20" aria-hidden />
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-3">
          <div className="min-w-0">
            <h2 className={appMobilePanel.title}>{title}</h2>
            {subtitle ? <p className={`mt-1 ${appMobilePanel.subtitle}`}>{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className={appMobilePanel.closeBtn}
            aria-label="Zavřít"
            onClick={onClose}
          >
            <X className="size-5" strokeWidth={2.25} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-2">
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 space-y-2.5 border-t border-white/10 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
