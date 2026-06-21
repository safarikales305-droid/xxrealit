'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AuthPageShell } from '@/components/auth/auth-page-shell';
import { WhatsAppPhoneVerificationCard } from '@/components/profile/WhatsAppPhoneVerificationCard';
import { useAuth } from '@/hooks/use-auth';

export default function OvereniWhatsappPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login?redirect=/registrace/overeni-whatsapp');
      return;
    }
    if (user.role !== 'PROPERTY_SEEKER') {
      router.replace('/');
    }
  }, [user, isLoading, router]);

  function onVerified() {
    router.push('/registrace/sdileni');
    router.refresh();
  }

  return (
    <AuthPageShell variant="register">
      <h1 className="mb-2 text-center text-lg font-semibold text-zinc-900">Ověření WhatsApp</h1>
      <p className="mb-5 text-center text-sm text-zinc-600">
        Pro dokončení registrace ověřte své WhatsApp číslo. Číslo musí být unikátní a nesmí být
        použité na jiném účtu.
      </p>
      <WhatsAppPhoneVerificationCard token={apiAccessToken} onVerified={onVerified} />
    </AuthPageShell>
  );
}
