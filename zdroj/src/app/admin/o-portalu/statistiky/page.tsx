'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { OPortaluStatsAdmin } from '@/components/admin/OPortaluStatsAdmin';

export default function AdminOPortaluStatsPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();

  useEffect(() => {
    if (!isLoading && (!apiAccessToken || !user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, apiAccessToken, user, router]);

  if (isLoading || !apiAccessToken || !user || user.role !== 'ADMIN') {
    return <p className="p-6 text-sm text-zinc-500">Načítám…</p>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <OPortaluStatsAdmin token={apiAccessToken} />
    </div>
  );
}
