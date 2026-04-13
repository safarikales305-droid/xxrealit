'use client';

import Link from 'next/link';
import { X } from 'lucide-react';

const upgradeLinkClass =
  'inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-3 text-sm font-bold text-white shadow-md transition hover:brightness-105';

const upgradeOutlineClass =
  'inline-flex w-full items-center justify-center rounded-full border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50';

export function professionalListingRestrictionCopy(): { title: string; body: string } {
  return {
    title: 'Jen pro profesionální účty',
    body: 'Příspěvky a inzerci mohou přidávat pouze makléři, stavební firmy a realitní kanceláře.',
  };
}

function UpgradeActions({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="mt-5 flex flex-col gap-2">
      <p className="text-center text-xs font-medium uppercase tracking-wide text-zinc-500">
        Rozšířit účet
      </p>
      <Link href="/profil?uct=agent" className={upgradeLinkClass} onClick={onNavigate}>
        Jsem makléř
      </Link>
      <Link href="/profil?uct=company" className={upgradeOutlineClass} onClick={onNavigate}>
        Mám stavební firmu
      </Link>
      <Link href="/profil?uct=agency" className={upgradeOutlineClass} onClick={onNavigate}>
        Jsem realitní kancelář
      </Link>
    </div>
  );
}

type DialogProps = {
  open: boolean;
  onClose: () => void;
};

export function ProfessionalOnlyDialog({ open, onClose }: DialogProps) {
  if (!open) return null;
  const { title, body } = professionalListingRestrictionCopy();
  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pro-listing-dialog-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="Zavřít"
        onClick={onClose}
      />
      <div className="relative z-[1] w-full max-w-md rounded-t-2xl border border-zinc-200 bg-white p-6 shadow-2xl sm:rounded-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
          aria-label="Zavřít"
        >
          <X className="size-5" strokeWidth={2} aria-hidden />
        </button>
        <h2 id="pro-listing-dialog-title" className="pr-10 text-lg font-bold text-zinc-900">
          {title}
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-zinc-600">{body}</p>
        <UpgradeActions onNavigate={onClose} />
      </div>
    </div>
  );
}

export function ProfessionalListingBlockedCard() {
  const { title, body } = professionalListingRestrictionCopy();
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
      <h2 className="text-lg font-bold text-zinc-900">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-zinc-600">{body}</p>
      <UpgradeActions />
    </div>
  );
}
