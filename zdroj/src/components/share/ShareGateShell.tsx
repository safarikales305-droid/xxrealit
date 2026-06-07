'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  fetchShareGateVideo,
  isShareGateSeen,
  markShareGateSeen,
  type ShareGateTargetType,
  type ShareGateVideoPublic,
} from '@/lib/share-gate';
import { ShareGateModal } from '@/components/share/ShareGateModal';

type Props = {
  type: ShareGateTargetType;
  listingId: string;
  children: ReactNode;
};

export function ShareGateShell({ type, listingId, children }: Props) {
  const { isAuthenticated, isLoading } = useAuth();
  const [gatePassed, setGatePassed] = useState(false);
  const [video, setVideo] = useState<ShareGateVideoPublic | null>(null);
  const [loadingGate, setLoadingGate] = useState(true);

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated) {
      setGatePassed(true);
      setLoadingGate(false);
      return;
    }

    if (isShareGateSeen(type, listingId)) {
      setGatePassed(true);
      setLoadingGate(false);
      return;
    }

    let cancelled = false;
    void fetchShareGateVideo(type).then((v) => {
      if (cancelled) return;
      setVideo(v);
      if (!v) setGatePassed(true);
      setLoadingGate(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isLoading, isAuthenticated, type, listingId]);

  function handleContinue() {
    markShareGateSeen(type, listingId);
    setGatePassed(true);
  }

  if (isLoading || loadingGate) {
    return <div className="min-h-[100dvh] bg-black" aria-hidden />;
  }

  if (!gatePassed && video) {
    return <ShareGateModal video={video} onContinue={handleContinue} />;
  }

  return <>{children}</>;
}
