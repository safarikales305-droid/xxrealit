'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Star } from 'lucide-react';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { nestListPublicBrokers, type NestPublicBrokerCard } from '@/lib/nest-client';
import {
  professionalRoleLabel,
  professionalSidebarRolesQuery,
} from '@/lib/professional-sidebar-roles';

type Props = {
  className?: string;
};

const lightCard =
  'border border-zinc-200/90 bg-white shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08),0_8px_24px_-12px_rgba(0,0,0,0.06)]';

export function RightSidebar({ className = '' }: Props) {
  const [professionals, setProfessionals] = useState<NestPublicBrokerCard[]>([]);
  const [loadingProfessionals, setLoadingProfessionals] = useState(true);

  useEffect(() => {
    let active = true;
    setLoadingProfessionals(true);
    void nestListPublicBrokers(null, { roles: professionalSidebarRolesQuery() })
      .then((rows) => {
        if (!active) return;
        if (!Array.isArray(rows)) {
          setProfessionals([]);
          return;
        }
        const verified = rows.filter((row) => row.isVerified);
        const ranked = [...verified].sort((a, b) => {
          const aScore =
            (a.ratingCount ?? 0) * 10 +
            (a.avatarUrl ? 5 : 0) +
            (a.regionLabel.trim().length > 0 ? 1 : 0);
          const bScore =
            (b.ratingCount ?? 0) * 10 +
            (b.avatarUrl ? 5 : 0) +
            (b.regionLabel.trim().length > 0 ? 1 : 0);
          return bScore - aScore;
        });
        setProfessionals(ranked);
      })
      .catch(() => {
        if (!active) return;
        setProfessionals([]);
      })
      .finally(() => {
        if (active) setLoadingProfessionals(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const preview = useMemo(() => professionals.slice(0, 3), [professionals]);
  const profileHref = (p: NestPublicBrokerCard) =>
    p.slug ? `/makler/${p.slug}` : `/profile/${p.id}`;

  const cityLabel = (p: NestPublicBrokerCard) =>
    p.regionLabel?.trim() || p.officeName?.trim() || '';

  return (
    <aside className={`flex flex-col gap-6 rounded-2xl p-6 ${lightCard} ${className}`}>
      <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-5">
        <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">Profesionálové</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">
          Ověření profesionálové s veřejným profilem.
        </p>
        <div className="mt-4 space-y-2.5">
          {loadingProfessionals
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
          {!loadingProfessionals
            ? preview.map((p) => (
                <article
                  key={p.id}
                  className="rounded-xl border border-zinc-200 bg-white p-2.5"
                >
                  <div className="flex items-start gap-3">
                    <img
                      src={
                        p.avatarUrl
                          ? nestAbsoluteAssetUrl(p.avatarUrl)
                          : '/images/default-avatar.svg'
                      }
                      alt={p.name ?? 'Profilová fotka'}
                      className="h-11 w-11 shrink-0 rounded-full object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-[13px] font-semibold text-zinc-900">
                          {p.name ?? 'Profesionální profil'}
                        </p>
                        {p.isVerified ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700">
                            <ShieldCheck className="h-3 w-3" />
                            Ověřeno
                          </span>
                        ) : null}
                      </div>
                      <p className="truncate text-[12px] text-zinc-500">
                        {professionalRoleLabel(p.role)}
                      </p>
                      {cityLabel(p) ? (
                        <p className="truncate text-[11px] text-zinc-500">{cityLabel(p)}</p>
                      ) : null}
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        <span>
                          {typeof p.ratingAverage === 'number'
                            ? p.ratingAverage.toFixed(1)
                            : '0.0'}
                        </span>
                        <span>({p.ratingCount ?? 0})</span>
                      </div>
                    </div>
                  </div>
                  <Link
                    href={profileHref(p)}
                    prefetch={false}
                    className="mt-2.5 inline-flex w-full items-center justify-center rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
                  >
                    Zobrazit profil
                  </Link>
                </article>
              ))
            : null}
          {!loadingProfessionals && preview.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-600">
              Zatím nejsou dostupné veřejné profesionální profily.
            </div>
          ) : null}
        </div>
        <Link
          href="/makleri"
          className="mt-3 inline-flex rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-2 text-xs font-semibold text-white"
        >
          Zobrazit více profesionálů
        </Link>
      </div>
    </aside>
  );
}
