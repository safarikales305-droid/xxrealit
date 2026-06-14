import type { Metadata } from 'next';
import { LegalPageShell } from '@/components/legal/LegalPageShell';
import { TermsOfServiceContent } from '@/components/legal/TermsOfServiceContent';

export const metadata: Metadata = {
  title: 'Terms of Service | XXRealit',
  description:
    'Terms of Service for the XXRealit real estate portal — accounts, listings, social integrations and liability.',
  robots: { index: true, follow: true },
  alternates: {
    canonical: 'https://www.xxrealit.cz/terms',
  },
};

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms of Service" breadcrumb="Terms of Service">
      <TermsOfServiceContent />
    </LegalPageShell>
  );
}
