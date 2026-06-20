'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  nestFetchPortalProfiles,
  type PublicPortalProfileRow,
} from '@/lib/nest-client';
import { ProfileCarouselSkeleton } from '@/components/ui/page-loading';

function PortalAvatar({ profile }: { profile: PublicPortalProfileRow }) {
  const src = profile.avatarUrl ? nestAbsoluteAssetUrl(profile.avatarUrl) : null;
  return (
    <Link
      href={profile.profileHref}
      className="group flex w-[5.5rem] shrink-0 flex-col items-center gap-2 sm:w-[6.25rem]"
    >
      <div className="relative size-[4.5rem] overflow-hidden rounded-full border-2 border-orange-200 bg-zinc-100 shadow-sm ring-2 ring-white transition group-hover:border-orange-400 sm:size-[5rem]">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-orange-100 to-zinc-200 text-lg font-bold text-orange-600">
            ?
          </div>
        )}
      </div>
      <p className="line-clamp-2 text-center text-[11px] font-semibold leading-tight text-zinc-700 sm:text-xs">
        {profile.roleLabel}
      </p>
    </Link>
  );
}

export function PortalProfilesCarousel() {
  const [profiles, setProfiles] = useState<PublicPortalProfileRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void nestFetchPortalProfiles(48).then((rows) => {
      if (cancelled) return;
      setProfiles(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <ProfileCarouselSkeleton />;
  if (profiles.length === 0) return null;

  return (
    <section className="mb-4 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm md:mb-6 md:p-5">
      <h2 className="text-sm font-bold text-zinc-900 md:text-base">Profily na portálu</h2>
      <div className="mt-3 -mx-1 overflow-x-auto pb-1">
        <div className="flex gap-3 px-1 sm:gap-4">
          {profiles.map((profile) => (
            <PortalAvatar key={profile.id} profile={profile} />
          ))}
        </div>
      </div>
    </section>
  );
}
