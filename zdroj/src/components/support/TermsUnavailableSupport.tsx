'use client';

import { SupportContactButton } from '@/components/support/SupportContactButton';

export function TermsUnavailableSupport() {
  return (
    <p>
      Obchodní podmínky momentálně nejsou k dispozici.{' '}
      <SupportContactButton variant="link" label="Kontaktujte podporu" subject="Dotaz k obchodním podmínkám" category="OTHER" />
      .
    </p>
  );
}
