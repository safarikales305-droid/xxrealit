'use client';

import Link from 'next/link';
import { LogIn, LogOut, MessageSquare, Plus, Shield, User, UserPlus, X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { appMobilePanel } from '@/components/ui/app-mobile-panel-styles';

export type AppMobileMenuItem = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  href?: string;
  badge?: number;
  variant?: 'default' | 'danger';
};

type Props = {
  open: boolean;
  onClose: () => void;
  userName?: string | null;
  isLoading?: boolean;
  items: AppMobileMenuItem[];
};

export function AppMobileMenuPanel({ open, onClose, userName, isLoading, items }: Props) {
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
    <div className="fixed inset-0 z-[100] md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <button
        type="button"
        className={appMobilePanel.overlay}
        aria-label="Zavřít menu"
        onClick={onClose}
      />
      <div
        className={`fixed inset-x-3 top-[max(calc(env(safe-area-inset-top)+4rem),4.25rem)] z-[101] max-h-[min(70dvh,calc(100dvh-5.5rem))] overflow-hidden ${appMobilePanel.sheet} ${appMobilePanel.sheetRoundedPanel} motion-safe:animate-[app-menu-in_0.24s_cubic-bezier(0.22,1,0.36,1)]`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5">
          <div className="min-w-0">
            <p className={appMobilePanel.title}>Menu</p>
            {userName ? (
              <p className="mt-0.5 truncate text-[13px] font-medium text-zinc-400">{userName}</p>
            ) : null}
          </div>
          <button type="button" className={appMobilePanel.closeBtn} aria-label="Zavřít" onClick={onClose}>
            <X className="size-5" strokeWidth={2.25} aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain p-3">
          {isLoading ? (
            <p className="px-2 py-3 text-sm text-zinc-400">Načítání…</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {items.map((item) => {
                const className =
                  item.variant === 'danger' ? appMobilePanel.menuItemDanger : appMobilePanel.menuItem;
                const content = (
                  <>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-orange-300">
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1">{item.label}</span>
                    {item.badge && item.badge > 0 ? (
                      <span className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-2 py-0.5 text-[11px] font-bold text-white">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    ) : null}
                  </>
                );
                if (item.href) {
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      className={className}
                      onClick={() => {
                        item.onClick?.();
                        onClose();
                      }}
                    >
                      {content}
                    </Link>
                  );
                }
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={className}
                    onClick={() => {
                      item.onClick?.();
                      onClose();
                    }}
                  >
                    {content}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const menuIcons = {
  profile: <User className="size-[18px]" strokeWidth={2.25} aria-hidden />,
  messages: <MessageSquare className="size-[18px]" strokeWidth={2.25} aria-hidden />,
  add: <Plus className="size-[18px]" strokeWidth={2.25} aria-hidden />,
  logout: <LogOut className="size-[18px]" strokeWidth={2.25} aria-hidden />,
  login: <LogIn className="size-[18px]" strokeWidth={2.25} aria-hidden />,
  register: <UserPlus className="size-[18px]" strokeWidth={2.25} aria-hidden />,
  admin: <Shield className="size-[18px]" strokeWidth={2.25} aria-hidden />,
};
