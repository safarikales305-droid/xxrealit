'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import type { ShortVideo } from '@/lib/nest-client';
import VideoCard from './VideoCard';

type VideoFeedProps = {
  /** Pořadí z rodiče (např. sdílené video první); bez interního přerovnání. */
  videos: ShortVideo[];
};

/**
 * Mobilní shorts: jeden slide = celá výška feedu (žádný StoriesBar s náhledy jiných inzerátů).
 * Desktop: zaoblený rám; mobil: edge-to-edge pro „klasické“ shorts.
 */
export function VideoFeed({ videos }: VideoFeedProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const showCreateFab =
    !isLoading && isAuthenticated && user != null && user.role !== 'ADMIN';

  return (
    <>
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <div className="min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overflow-x-hidden overscroll-y-contain pb-[env(safe-area-inset-bottom)] pt-0">
          {videos.map((video) => (
            <div
              key={video.id}
              className="h-full min-h-0 w-full shrink-0 snap-start snap-always overflow-hidden rounded-none bg-black max-md:min-h-[calc(100dvh-3.75rem)] md:rounded-xl"
            >
              <VideoCard video={video} />
            </div>
          ))}
        </div>
      </div>
      {showCreateFab ? (
        <Link
          href="/inzerat/pridat"
          className="pointer-events-auto fixed z-[38] flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] text-lg font-bold leading-none text-white shadow-[0_8px_24px_rgba(255,90,0,0.4)] ring-2 ring-white/20 transition hover:brightness-110 active:scale-95 max-md:left-[max(0.75rem,env(safe-area-inset-left))] max-md:bottom-[max(6.5rem,calc(5rem+env(safe-area-inset-bottom,0px)))] md:hidden"
          aria-label="Přidat inzerát"
        >
          +
        </Link>
      ) : null}
    </>
  );
}
