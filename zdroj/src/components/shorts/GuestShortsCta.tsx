'use client';

import Link from 'next/link';

export function GuestShortsCta() {
  return (
    <Link href="/registrace" className="guest-shorts-cta pointer-events-auto">
      Založ účet, inzeruj a vydělávej
    </Link>
  );
}
