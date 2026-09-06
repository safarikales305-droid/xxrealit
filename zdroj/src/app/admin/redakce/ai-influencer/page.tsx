'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { EditorialCenterShell } from '@/components/admin/redakce/EditorialCenterShell';
import { AiInfluencerProductionDashboard } from '@/components/admin/redakce/AiInfluencerProductionDashboard';

export default function AiInfluencerPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();

  useEffect(() => {
    if (!isLoading && user?.role !== 'ADMIN') router.replace('/');
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-orange-600" />
      </div>
    );
  }

  return (
    <EditorialCenterShell
      title="AI Influencer"
      subtitle="Video production dashboard — Reels 9:16, Video Agent pipeline a publikování."
    >
      {apiAccessToken ? <AiInfluencerProductionDashboard apiAccessToken={apiAccessToken} /> : null}
    </EditorialCenterShell>
  );
}
