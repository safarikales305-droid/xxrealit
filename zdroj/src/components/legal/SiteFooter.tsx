'use client';

import Link from 'next/link';
import { SupportContactButton } from '@/components/support/SupportContactButton';

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-zinc-600">
        <Link href="/privacy-policy" className="font-medium transition hover:text-[#e85d00]">
          Privacy Policy
        </Link>
        <Link href="/o-portalu" className="font-medium transition hover:text-[#e85d00]">
          O portálu
        </Link>
        <Link href="/obchodni-podminky" className="font-medium transition hover:text-[#e85d00]">
          Obchodní podmínky
        </Link>
        <Link href="/terms" className="font-medium transition hover:text-[#e85d00]">
          Terms of Service
        </Link>
        <Link href="/privacy" className="font-medium transition hover:text-[#e85d00]">
          Ochrana osobních údajů
        </Link>
        <Link href="/data-deletion" className="font-medium transition hover:text-[#e85d00]">
          Smazání Facebook dat
        </Link>
        <SupportContactButton variant="footer" label="Kontaktovat podporu" />
      </div>
    </footer>
  );
}
