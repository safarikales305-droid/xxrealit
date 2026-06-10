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

    if (isShareGateSeen(listingId)) {
      setGatePassed(true);
      setLoadingGate(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      setGatePassed(true);
      setLoadingGate(false);
    }, 6_000);

    void fetchShareGateVideo(type).then((v) => {
      if (cancelled) return;
      setVideo(v);
      if (!v) setGatePassed(true);
      setLoadingGate(false);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isLoading, isAuthenticated, type, listingId]);

  function handleContinue() {
    markShareGateSeen(listingId);
    setGatePassed(true);
  }

  if (isLoading || loadingGate) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-6" aria-busy="true" aria-label="Načítání">
        <div className="h-[42vh] animate-pulse rounded-2xl bg-zinc-200/80" />
        <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="h-7 w-3/4 animate-pulse rounded bg-zinc-200/80" />
          <div className="mt-3 h-5 w-1/3 animate-pulse rounded bg-zinc-200/80" />
        </div>
      </div>
    );
  }

  if (!gatePassed && video) {
    return <ShareGateModal video={video} onContinue={handleContinue} />;
  }

  return <>{children}</>;
}
