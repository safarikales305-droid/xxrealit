import type { Metadata } from 'next';
import { LegalPageShell } from '@/components/legal/LegalPageShell';
import { PrivacyPolicyContent } from '@/components/legal/PrivacyPolicyContent';

export const metadata: Metadata = {
  title: 'Privacy Policy | XXRealit',
  description:
    'Privacy Policy for XXRealit — user registration, Facebook Login, cookies and data subject rights under GDPR.',
  robots: { index: true, follow: true },
  alternates: {
    canonical: '/privacy-policy',
  },
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell title="Privacy Policy" breadcrumb="Privacy Policy">
      <PrivacyPolicyContent />
    </LegalPageShell>
  );
}
