'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  communityCategoryToCompanyCategory,
  companyCategoryLabel,
  professionalRoleLabel,
  type CommunityCategoryKey,
} from '@/lib/community-category-roles';
import { nestListFeaturedProfiles, type FeaturedProfileCard } from '@/lib/company-directory-client';
import { ProfileCarouselSkeleton } from '@/components/ui/page-loading';

type Props = {
  category: CommunityCategoryKey;
};

function ProfileCard({ profile }: { profile: FeaturedProfileCard }) {
  const isCompany = profile.type === 'company';
  const label = isCompany
    ? profile.categoryLabel ?? companyCategoryLabel(profile.category)
    : professionalRoleLabel(profile.role ?? '');

  const img = isCompany
    ? profile.logoUrl
      ? nestAbsoluteAssetUrl(profile.logoUrl)
      : null
    : profile.avatarUrl
      ? nestAbsoluteAssetUrl(profile.avatarUrl)
      : null;

  return (
    <Link
      href={profile.href}
      className="group flex w-[5.5rem] shrink-0 flex-col items-center gap-2 sm:w-[6.25rem]"
    >
      <div className="relative size-[4.5rem] overflow-hidden rounded-full border-2 border-orange-200 bg-zinc-100 shadow-sm ring-2 ring-white transition group-hover:border-orange-400 sm:size-[5rem]">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="size-full object-cover" />
        ) : isCompany ? (
          <div className="flex size-full items-center justify-center bg-orange-50 text-orange-600">
            <Building2 className="size-6" />
          </div>
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-orange-100 to-zinc-200 text-lg font-bold text-orange-600">
            {(profile.name ?? '?').slice(0, 1)}
          </div>
        )}
      </div>
      <p className="line-clamp-2 text-center text-[11px] font-semibold leading-tight text-zinc-700 sm:text-xs">
        {profile.name ?? label}
      </p>
      <p className="line-clamp-1 text-center text-[10px] text-zinc-500">{label}</p>
      {profile.badges.includes('OVĚŘENO') ? (
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold leading-tight text-emerald-800">
          Ověřeno
        </span>
      ) : profile.badges.includes('NEPŘEVZATÝ PROFIL') ? (
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-semibold leading-tight text-zinc-600">
          ARES
        </span>
      ) : null}
    </Link>
  );
}

export function PortalProfilesCarousel({ category }: Props) {
  const [profiles, setProfiles] = useState<FeaturedProfileCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const companyCategory = communityCategoryToCompanyCategory(category);
    void nestListFeaturedProfiles({
      category: companyCategory ?? (category === 'VSE' ? undefined : category),
      limit: 16,
    }).then((rows) => {
      if (cancelled) return;
      setProfiles(rows ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [category]);

  if (loading) return <ProfileCarouselSkeleton />;

  return (
    <section className="mb-4 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm md:mb-6 md:p-5">
      <h2 className="text-sm font-bold text-zinc-900 md:text-base">
        Firmy a profesionálové na portálu
      </h2>
      {profiles.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">V této kategorii zatím nejsou žádné veřejné profily.</p>
      ) : (
        <div className="mt-3 -mx-1 overflow-x-auto pb-1">
          <div className="flex gap-3 px-1 sm:gap-4">
            {profiles.map((profile) => (
              <ProfileCard key={`${profile.type}-${profile.id}`} profile={profile} />
            ))}
          </div>
        </div>
      )}
      <Link
        href="/profesionalove"
        className="mt-3 inline-block text-xs font-semibold text-orange-700 hover:underline"
      >
        Zobrazit všechny profily →
      </Link>
    </section>
  );
}
