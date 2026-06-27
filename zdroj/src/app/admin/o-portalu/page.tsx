'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PortalPresentationAdminEditor } from '@/components/admin/PortalPresentationAdminEditor';
import { useAuth } from '@/hooks/use-auth';

export default function AdminOPortaluPage() {
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') {
      router.replace('/admin');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user || user.role !== 'ADMIN' || !apiAccessToken) {
    return <div className="p-8 text-sm text-zinc-500">Načítám…</div>;
  }

  return <PortalPresentationAdminEditor token={apiAccessToken} />;
}
