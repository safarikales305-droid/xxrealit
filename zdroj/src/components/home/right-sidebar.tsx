'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Building2, ShieldCheck, Star, UserRound } from 'lucide-react';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  companyCategoryLabel,
  professionalRoleLabel,
} from '@/lib/community-category-roles';
import { nestListFeaturedProfiles, type FeaturedProfileCard } from '@/lib/company-directory-client';

type Props = {
  className?: string;
};

const lightCard =
  'border border-zinc-200/90 bg-white shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08),0_8px_24px_-12px_rgba(0,0,0,0.06)]';

export function RightSidebar({ className = '' }: Props) {
  const [profiles, setProfiles] = useState<FeaturedProfileCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void nestListFeaturedProfiles({ limit: 9 })
      .then((rows) => {
        if (!active) return;
        setProfiles(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!active) return;
        setProfiles([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const preview = useMemo(() => profiles.slice(0, 3), [profiles]);

  return (
    <aside className={`flex flex-col gap-6 rounded-2xl p-6 ${lightCard} ${className}`}>
      <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-5">
        <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">
          Doporučené firmy a profesionálové
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">
          Mix ověřených profesionálů a firem z registru ARES.
        </p>
        <div className="mt-4 space-y-2.5">
          {loading
            ? Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={`loading-${idx}`}
                  className="flex items-center gap-3 rounded-xl border border-dashed border-zinc-200 bg-white p-2.5"
                >
                  <div className="h-11 w-11 rounded-full bg-zinc-100" />
                  <div className="flex-1">
                    <div className="h-3.5 w-32 rounded bg-zinc-100" />
                    <div className="mt-1.5 h-3 w-24 rounded bg-zinc-100" />
                  </div>
                </div>
              ))
            : null}
          {!loading
            ? preview.map((p) => {
                const isCompany = p.type === 'company';
                const img = isCompany
                  ? p.logoUrl
                    ? nestAbsoluteAssetUrl(p.logoUrl)
                    : null
                  : p.avatarUrl
                    ? nestAbsoluteAssetUrl(p.avatarUrl)
                    : null;
                const label = isCompany
                  ? p.categoryLabel ?? companyCategoryLabel(p.category)
                  : professionalRoleLabel(p.role ?? '');
                return (
                  <article
                    key={`${p.type}-${p.id}`}
                    className="rounded-xl border border-zinc-200 bg-white p-2.5"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-100">
                        {img ? (
                          <img
                            src={img}
                            alt={p.name ?? 'Profil'}
                            className="h-full w-full object-cover"
                          />
                        ) : isCompany ? (
                          <Building2 className="h-5 w-5 text-orange-500" aria-hidden />
                        ) : (
                          <UserRound className="h-5 w-5 text-zinc-400" aria-hidden />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-[13px] font-semibold text-zinc-900">
                            {p.name}
                          </p>
                          {p.isVerified ? (
                            <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700">
                              <ShieldCheck className="h-3 w-3" />
                              Ověřeno
                            </span>
                          ) : null}
                        </div>
                        <p className="truncate text-[12px] text-zinc-500">{label}</p>
                        {p.city ? (
                          <p className="truncate text-[11px] text-zinc-500">{p.city}</p>
                        ) : null}
                        {p.rating != null ? (
                          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                            <span>{p.rating.toFixed(1)}</span>
                            <span>({p.ratingCount ?? 0})</span>
                          </div>
                        ) : (
                          <p className="mt-0.5 text-[11px] text-zinc-400">Zatím bez hodnocení</p>
                        )}
                      </div>
                    </div>
                    <Link
                      href={p.href}
                      prefetch={false}
                      className="mt-2.5 inline-flex w-full items-center justify-center rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
                    >
                      Zobrazit profil
                    </Link>
                  </article>
                );
              })
            : null}
          {!loading && preview.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-600">
              Zatím nejsou dostupné veřejné profily.
            </div>
          ) : null}
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <Link
            href="/makleri"
            className="inline-flex justify-center rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-2 text-xs font-semibold text-white"
          >
            Profesionálové
          </Link>
          <Link
            href="/firmy"
            className="inline-flex justify-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-800 hover:border-orange-300"
          >
            Registr firem
          </Link>
        </div>
      </div>
    </aside>
  );
}
