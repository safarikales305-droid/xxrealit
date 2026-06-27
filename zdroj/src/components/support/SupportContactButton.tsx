'use client';

import { useSupportContact } from '@/components/support/SupportContactProvider';

type Props = {
  label?: string;
  className?: string;
  variant?: 'link' | 'button' | 'footer';
  subject?: string;
  category?: string;
};

export function SupportContactButton({
  label = 'Napsat na podporu',
  className = '',
  variant = 'button',
  subject,
  category,
}: Props) {
  const { openSupport } = useSupportContact();

  const base =
    variant === 'footer'
      ? 'font-medium transition hover:text-[#e85d00]'
      : variant === 'link'
        ? 'font-semibold text-[#e85d00] hover:underline'
        : 'inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:opacity-95';

  return (
    <button
      type="button"
      className={`${base} ${className}`}
      onClick={() =>
        openSupport({
          subject,
          category: category as import('@/lib/support-tickets').SupportTicketCategory | undefined,
        })
      }
    >
      {label}
    </button>
  );
}
