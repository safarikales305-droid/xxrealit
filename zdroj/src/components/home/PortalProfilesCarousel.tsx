'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  communityCategoryToAuthorRolesCsv,
  professionalRoleLabel,
  type CommunityCategoryKey,
} from '@/lib/community-category-roles';
import { nestListPublicProfessionals, type NestPublicBrokerCard } from '@/lib/nest-client';
import { ProfileCarouselSkeleton } from '@/components/ui/page-loading';

type Props = {
  category: CommunityCategoryKey;
};

function PortalAvatar({ profile }: { profile: NestPublicBrokerCard }) {
  const src = profile.avatarUrl ? nestAbsoluteAssetUrl(profile.avatarUrl) : null;
  const roleLabel = professionalRoleLabel(profile.role);
  return (
    <Link
      href={
        profile.slug
          ? `/makler/${encodeURIComponent(profile.slug)}`
          : `/profile/${encodeURIComponent(profile.id)}`
      }
      className="group flex w-[5.5rem] shrink-0 flex-col items-center gap-2 sm:w-[6.25rem]"
    >
      <div className="relative size-[4.5rem] overflow-hidden rounded-full border-2 border-orange-200 bg-zinc-100 shadow-sm ring-2 ring-white transition group-hover:border-orange-400 sm:size-[5rem]">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-orange-100 to-zinc-200 text-lg font-bold text-orange-600">
            {(profile.name ?? '?').slice(0, 1)}
          </div>
        )}
      </div>
      <p className="line-clamp-2 text-center text-[11px] font-semibold leading-tight text-zinc-700 sm:text-xs">
        {profile.name ?? roleLabel}
      </p>
      <p className="line-clamp-1 text-center text-[10px] text-zinc-500">{roleLabel}</p>
      {profile.isVerified ? (
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold leading-tight text-emerald-800">
          Ověřeno
        </span>
      ) : null}
    </Link>
  );
}

export function PortalProfilesCarousel({ category }: Props) {
  const [profiles, setProfiles] = useState<NestPublicBrokerCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const roles = communityCategoryToAuthorRolesCsv(category);
    void nestListPublicProfessionals(roles ? { roles } : undefined).then((rows) => {
      if (cancelled) return;
      setProfiles(rows ?? []);
      setLoading(false);
      // eslint-disable-next-line no-console
      console.debug('[posts] profiles loaded', {
        category,
        count: rows?.length ?? 0,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [category]);

  if (loading) return <ProfileCarouselSkeleton />;

  return (
    <section className="mb-4 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm md:mb-6 md:p-5">
      <h2 className="text-sm font-bold text-zinc-900 md:text-base">Profily na portálu</h2>
      {profiles.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">V této kategorii zatím nejsou žádné veřejné profily.</p>
      ) : (
        <div className="mt-3 -mx-1 overflow-x-auto pb-1">
          <div className="flex gap-3 px-1 sm:gap-4">
            {profiles.map((profile) => (
              <PortalAvatar key={profile.id} profile={profile} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
