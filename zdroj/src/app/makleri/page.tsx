'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { nestListPublicProfessionals, type NestPublicBrokerCard } from '@/lib/nest-client';
import {
  isProfessionalVerifiedProfile,
  verifiedBadgeLabelForRole,
} from '@/lib/professional-verification';
import {
  professionalRoleLabel,
  professionalSidebarRolesQuery,
} from '@/lib/professional-sidebar-roles';

function Stars({ value, max = 5 }: { value: number; max?: number }) {
  const full = Math.round(value);
  return (
    <span className="text-amber-500" aria-hidden>
      {Array.from({ length: max }, (_, i) => (i < full ? '★' : '☆')).join('')}
    </span>
  );
}

function profileHref(b: NestPublicBrokerCard) {
  return b.slug ? `/makler/${encodeURIComponent(b.slug)}` : `/profile/${b.id}`;
}

function cityLabel(b: NestPublicBrokerCard) {
  return b.city?.trim() || b.regionLabel?.trim() || b.officeName?.trim() || '';
}

function avatarSrc(b: NestPublicBrokerCard) {
  if (!b.avatarUrl?.trim()) return null;
  return /^https?:\/\//i.test(b.avatarUrl)
    ? b.avatarUrl
    : nestAbsoluteAssetUrl(b.avatarUrl) || b.avatarUrl;
}

export default function MakleriPage() {
  const [rows, setRows] = useState<NestPublicBrokerCard[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void nestListPublicProfessionals({ roles: professionalSidebarRolesQuery() }).then((r) => {
      if (!r) {
        setErr('Katalog profesionálů se nepodařilo načíst. Zkontrolujte připojení k API.');
        setRows([]);
        return;
      }
      setErr(null);
      const seen = new Set<string>();
      const unique = r.filter((row) => {
        if (!row.isVerified) return false;
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      });
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.info('[professionals] /makleri listed', unique.length);
      }
      setRows(unique);
    });
  }, []);

  return (
    <div className="min-h-[100dvh] bg-[#fafafa] pb-16 text-zinc-900">
      <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6">
        <Link href="/" className="text-sm font-semibold text-[#e85d00] hover:underline">
          ← Domů
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-zinc-900">Profesionálové</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600">
          Veřejné profily ověřených makléřů, firem, poradců a dalších profesionálů.
        </p>
      </div>

      <div className="mx-auto mt-8 max-w-4xl px-4 sm:px-6">
        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        {rows === null ? (
          <p className="text-sm text-zinc-500">Načítám…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-10 text-center text-sm text-zinc-600">
            Zatím tu není žádný veřejný profesionální profil.
          </div>
        ) : (
          <ul className="space-y-4">
            {rows.map((b) => {
              const img = avatarSrc(b);
              return (
                <li key={b.id}>
                  <article className="flex gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-100">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" className="size-full object-cover" />
                      ) : (
                        <UserRound className="h-7 w-7 text-zinc-400" aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-zinc-900">{b.name ?? 'Profesionál'}</p>
                        {isProfessionalVerifiedProfile(b) ? (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                            {verifiedBadgeLabelForRole(b.role)}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm text-zinc-600">{professionalRoleLabel(b.role)}</p>
                      {cityLabel(b) ? (
                        <p className="mt-1 text-xs text-zinc-500">{cityLabel(b)}</p>
                      ) : null}
                      {b.phonePublic ? (
                        <p className="mt-1 text-xs text-zinc-600">
                          Tel.:{' '}
                          <a href={`tel:${b.phonePublic}`} className="font-medium text-orange-700 hover:underline">
                            {b.phonePublic}
                          </a>
                        </p>
                      ) : null}
                      {b.emailPublic ? (
                        <p className="mt-0.5 text-xs text-zinc-600">
                          E-mail:{' '}
                          <a
                            href={`mailto:${b.emailPublic}`}
                            className="font-medium text-orange-700 hover:underline"
                          >
                            {b.emailPublic}
                          </a>
                        </p>
                      ) : null}
                      {b.ratingAverage != null && b.ratingCount != null ? (
                        <p className="mt-2 text-sm text-zinc-700">
                          <Stars value={b.ratingAverage} />{' '}
                          <span className="font-medium">{b.ratingAverage.toFixed(1)}</span>
                          <span className="text-zinc-500"> ({b.ratingCount})</span>
                        </p>
                      ) : null}
                      {b.bioExcerpt ? (
                        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-600">
                          {b.bioExcerpt}
                          {(b.bioExcerpt?.length ?? 0) >= 160 ? '…' : ''}
                        </p>
                      ) : null}
                      <Link
                        href={profileHref(b)}
                        className="mt-3 inline-flex rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-800 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
                      >
                        Zobrazit detail
                      </Link>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
