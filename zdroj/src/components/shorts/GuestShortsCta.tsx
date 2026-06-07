'use client';

import Link from 'next/link';

export function GuestShortsCta() {
  return (
    <Link
      href="/registrace"
      className="guest-shorts-cta pointer-events-auto absolute left-1/2 z-40 -translate-x-1/2"
    >
      Založ účet, inzeruj a vydělávej
    </Link>
  );
}
