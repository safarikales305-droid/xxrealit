'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ShieldCheck, UserRound } from 'lucide-react';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  nestListPublicProfessionals,
  nestListPurchaseAdviceArticles,
  type NestPublicBrokerCard,
  type PurchaseAdviceArticleRow,
} from '@/lib/nest-client';
import { professionalRoleLabel } from '@/lib/professional-sidebar-roles';

type ProfileSection = {
  title: string;
  roles: string;
};

const PROFILE_SECTIONS: ProfileSection[] = [
  { title: 'Makléři a partneři', roles: 'AGENT,AGENCY' },
  { title: 'Stavební firmy', roles: 'COMPANY,CRAFTSMAN' },
  { title: 'Investoři', roles: 'INVESTOR' },
  { title: 'Finanční poradci', roles: 'FINANCIAL_ADVISOR' },
];

function profileHref(p: NestPublicBrokerCard) {
  return p.slug ? `/makler/${p.slug}` : `/profile/${p.id}`;
}

function avatarSrc(p: NestPublicBrokerCard) {
  if (!p.avatarUrl?.trim()) return null;
  return /^https?:\/\//i.test(p.avatarUrl)
    ? p.avatarUrl
    : nestAbsoluteAssetUrl(p.avatarUrl) || p.avatarUrl;
}

function ProfileCard({ profile }: { profile: NestPublicBrokerCard }) {
  const img = avatarSrc(profile);
  return (
    <article className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-3">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-200">
          {img ? (
            <img src={img} alt="" className="size-full object-cover" />
          ) : (
            <UserRound className="size-5 text-zinc-400" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-zinc-900">
              {profile.name ?? 'Profesionální profil'}
            </p>
            {profile.isVerified ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                <ShieldCheck className="size-3" aria-hidden />
                Ověřený
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            {professionalRoleLabel(profile.role)}
          </p>
          <Link
            href={profileHref(profile)}
            className="mt-2 inline-flex rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold text-zinc-800 hover:border-orange-300"
          >
            Zobrazit profil
          </Link>
        </div>
      </div>
    </article>
  );
}

function ProfileSectionBox({ title, roles }: ProfileSection) {
  const [profiles, setProfiles] = useState<NestPublicBrokerCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void nestListPublicProfessionals({ roles })
      .then((rows) => {
        if (!active) return;
        const list = Array.isArray(rows) ? rows : [];
        setProfiles(list.slice(0, 2));
      })
      .catch(() => {
        if (active) setProfiles([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [roles]);

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-zinc-900">{title}</p>
      <div className="mt-3 space-y-2">
        {loading ? (
          <p className="text-sm text-zinc-500">Načítám…</p>
        ) : profiles.length === 0 ? (
          <p className="text-sm text-zinc-500">Zatím žádné veřejné profily.</p>
        ) : (
          profiles.map((profile) => <ProfileCard key={profile.id} profile={profile} />)
        )}
      </div>
    </div>
  );
}

function AdviceArticlesBox() {
  const [articles, setArticles] = useState<PurchaseAdviceArticleRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void nestListPurchaseAdviceArticles(6)
      .then((rows) => {
        if (active) setArticles(rows ?? []);
      })
      .catch(() => {
        if (active) setArticles([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-zinc-900">Rady při koupi</p>
      {loading ? (
        <p className="mt-2 text-sm text-zinc-500">Načítám…</p>
      ) : articles.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-600">
          Brzy doplníme užitečné rady a články.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {articles.map((article) => (
            <li key={article.id}>
              <Link
                href={`/rady/${encodeURIComponent(article.id)}`}
                className="block rounded-xl border border-zinc-100 p-2 transition hover:border-orange-200 hover:bg-orange-50/40"
              >
                {article.imageUrl ? (
                  <img
                    src={nestAbsoluteAssetUrl(article.imageUrl) ?? article.imageUrl}
                    alt=""
                    className="mb-2 h-20 w-full rounded-lg object-cover"
                  />
                ) : null}
                <p className="text-sm font-medium text-zinc-900">{article.title}</p>
                {article.category ? (
                  <p className="mt-0.5 text-xs text-zinc-500">{article.category}</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ListingDetailLeftSidebar() {
  return (
    <aside className="hidden space-y-4 xl:col-span-3 xl:block">
      {PROFILE_SECTIONS.map((section) => (
        <ProfileSectionBox key={section.title} {...section} />
      ))}
      <AdviceArticlesBox />
    </aside>
  );
}
