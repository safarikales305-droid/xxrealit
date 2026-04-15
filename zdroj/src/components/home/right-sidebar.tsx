'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Star } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { nestListPublicBrokers, type NestPublicBrokerCard } from '@/lib/nest-client';
type Props = {
  className?: string;
};

const lightCard =
  'border border-zinc-200/90 bg-white shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08),0_8px_24px_-12px_rgba(0,0,0,0.06)]';

export function RightSidebar({ className = '' }: Props) {
  const { isLoading, apiAccessToken } = useAuth();
  const [professionals, setProfessionals] = useState<NestPublicBrokerCard[]>([]);
  const [loadingProfessionals, setLoadingProfessionals] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingProfessionals(true);
    void nestListPublicBrokers(apiAccessToken).then((rows) => {
      if (!active) return;
      if (!Array.isArray(rows)) {
        setProfessionals([]);
        setLoadingProfessionals(false);
        return;
      }
      const ranked = [...rows].sort((a, b) => {
        const aScore =
          (a.isVerified ? 1_000 : 0) +
          (a.avatarUrl ? 100 : 0) +
          ((a.ratingCount ?? 0) > 0 ? 10 : 0) +
          ((a.officeName.trim().length > 0 || a.regionLabel.trim().length > 0) ? 1 : 0);
        const bScore =
          (b.isVerified ? 1_000 : 0) +
          (b.avatarUrl ? 100 : 0) +
          ((b.ratingCount ?? 0) > 0 ? 10 : 0) +
          ((b.officeName.trim().length > 0 || b.regionLabel.trim().length > 0) ? 1 : 0);
        return bScore - aScore;
      });
      setProfessionals(ranked);
      setLoadingProfessionals(false);
    });
    return () => {
      active = false;
    };
  }, [apiAccessToken]);

  const preview = useMemo(() => professionals.slice(0, 3), [professionals]);
  const placeholderCount = Math.max(0, 3 - preview.length);
  const roleLabel = (role: NestPublicBrokerCard['role']) => {
    if (role === 'AGENT') return 'Ověřený makléř';
    if (role === 'COMPANY') return 'Ověřená stavební firma';
    if (role === 'AGENCY') return 'Ověřená realitní kancelář';
    if (role === 'FINANCIAL_ADVISOR') return 'Ověřený finanční poradce';
    return 'Ověřený investor';
  };
  const profileHref = (p: NestPublicBrokerCard) => (p.slug ? `/makler/${p.slug}` : `/profil/${p.id}`);

  return (
    <aside
      className={`flex flex-col gap-6 rounded-2xl p-6 ${lightCard} ${className}`}
    >
      {!isLoading ? (
        <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-5">
          <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">Profesionálové</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">
            Veřejné profesionální účty napříč všemi kategoriemi.
          </p>
          <div className="mt-4 space-y-2.5">
            {preview.map((p) => (
              <Link
                key={p.id}
                href={profileHref(p)}
                className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-2.5 transition hover:border-zinc-300"
              >
                <img
                  src={p.avatarUrl || '/images/default-avatar.svg'}
                  alt={p.name ?? 'Profilová fotka'}
                  className="h-11 w-11 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-zinc-900">
                    {p.name ?? 'Profesionální profil'}
                  </div>
                  <div className="truncate text-[12px] text-zinc-500">{roleLabel(p.role)}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span>{typeof p.ratingAverage === 'number' ? p.ratingAverage.toFixed(1) : '0.0'}</span>
                    <span>({p.ratingCount ?? 0})</span>
                  </div>
                </div>
                {p.isVerified ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Ověřeno
                  </span>
                ) : null}
              </Link>
            ))}
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
            {!loadingProfessionals && preview.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-600">
                Zatím nejsou dostupné veřejné profesionální profily.
              </div>
            ) : null}
            {!loadingProfessionals &&
              preview.length > 0 &&
              Array.from({ length: placeholderCount }).map((_, idx) => (
                <div
                  key={`placeholder-${idx}`}
                  className="flex items-center gap-3 rounded-xl border border-dashed border-zinc-200 bg-white p-2.5"
                >
                  <div className="h-11 w-11 rounded-full bg-zinc-100" />
                  <div className="flex-1">
                    <div className="h-3.5 w-32 rounded bg-zinc-100" />
                    <div className="mt-1.5 h-3 w-24 rounded bg-zinc-100" />
                  </div>
                </div>
              ))}
          </div>
          <Link
            href="/makleri"
            className="mt-3 inline-flex rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-2 text-xs font-semibold text-white"
          >
            Zobrazit více profesionálů
          </Link>
        </div>
      ) : null}
    </aside>
  );
}
