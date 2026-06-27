'use client';

import { SupportContactButton } from '@/components/support/SupportContactButton';

export function OperatorContactSupport() {
  return (
    <p className="mt-2 text-sm leading-relaxed text-zinc-700">
      Dotazy k obchodním podmínkám a provozu portálu směřujte přes{' '}
      <SupportContactButton
        variant="link"
        label="formulář podpory"
        subject="Dotaz k obchodním podmínkám"
        category="OTHER"
      />
      .
    </p>
  );
}
