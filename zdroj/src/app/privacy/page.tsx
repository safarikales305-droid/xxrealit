import type { Metadata } from 'next';
import { LegalPageShell } from '@/components/legal/LegalPageShell';
import { PrivacyPolicyContent } from '@/components/legal/PrivacyPolicyContent';

export const metadata: Metadata = {
  title: 'Zásady ochrany osobních údajů | XXRealit',
  description:
    'Zásady ochrany osobních údajů portálu XXRealit — registrace, Facebook Login, cookies a práva subjektů údajů podle GDPR.',
  robots: { index: true, follow: true },
  alternates: {
    canonical: '/privacy',
  },
};

export default function PrivacyPage() {
  return (
    <LegalPageShell title="Zásady ochrany osobních údajů" breadcrumb="Ochrana osobních údajů">
      <PrivacyPolicyContent />
    </LegalPageShell>
  );
}
