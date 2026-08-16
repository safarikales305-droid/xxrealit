'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Building2, MapPin, Search, Star, UserRound } from 'lucide-react';
import { PublicHeader } from '@/components/navigation/PublicHeader';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  COMPANY_DIRECTORY_CATEGORIES,
  nestListFeaturedProfiles,
  nestListPublicProfileDirectory,
  type FeaturedProfileCard,
  type PublicProfileDirectoryItem,
  type PublicProfileDirectoryResponse,
} from '@/lib/company-directory-client';

const FILTERS = [
  { value: 'all', label: 'Vše' },
  { value: 'people', label: 'Lidé' },
  { value: 'companies', label: 'Firmy' },
  { value: 'agents', label: 'Makléři' },
  ...COMPANY_DIRECTORY_CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
];

const REGIONS = [
  'Hlavní město Praha',
  'Středočeský kraj',
  'Jihočeský kraj',
  'Plzeňský kraj',
  'Karlovarský kraj',
  'Ústecký kraj',
  'Liberecký kraj',
  'Královéhradecký kraj',
  'Pardubický kraj',
  'Vysočina',
  'Jihomoravský kraj',
  'Olomoucký kraj',
  'Zlínský kraj',
  'Moravskoslezský kraj',
];

function ProfileCard({ item }: { item: PublicProfileDirectoryItem }) {
  const isCompany = item.type === 'COMPANY';
  const img = isCompany
    ? item.logoUrl
      ? nestAbsoluteAssetUrl(item.logoUrl)
      : null
    : item.avatarUrl
      ? nestAbsoluteAssetUrl(item.avatarUrl)
      : null;

  return (
    <article className="flex h-full flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-100">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" className="size-full object-cover" />
          ) : isCompany ? (
            <Building2 className="size-6 text-orange-600" />
          ) : (
            <UserRound className="size-6 text-zinc-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-zinc-900">{item.displayName}</p>
          <p className="text-sm text-zinc-600">{item.categoryLabel}</p>
          {item.city || item.region ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
              <MapPin className="size-3.5" />
              {[item.city, item.region].filter(Boolean).join(', ')}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {item.badges.map((badge) => (
          <span
            key={badge}
            className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700"
          >
            {badge}
          </span>
        ))}
        {item.active ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
            Aktivní profil
          </span>
        ) : null}
      </div>
      {item.rating != null && item.rating > 0 ? (
        <p className="mt-3 flex items-center gap-1 text-sm text-zinc-700">
          <Star className="size-4 fill-amber-400 text-amber-400" />
          {item.rating.toFixed(1)}
          {item.reviewCount != null ? (
            <span className="text-zinc-500">({item.reviewCount})</span>
          ) : null}
        </p>
      ) : null}
      {item.postCount ? (
        <p className="mt-1 text-xs text-zinc-500">{item.postCount} příspěvků</p>
      ) : null}
      <Link
        href={item.profileUrl}
        className="mt-4 inline-flex w-full justify-center rounded-full border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-800 hover:border-orange-300 hover:bg-orange-50"
      >
        {isCompany ? 'Detail firmy' : 'Zobrazit profil'}
      </Link>
    </article>
  );
}

function FeaturedStrip({
  title,
  profiles,
}: {
  title: string;
  profiles: FeaturedProfileCard[];
}) {
  if (profiles.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-500">{title}</h2>
      <ul className="no-scrollbar mt-3 flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {profiles.map((p) => (
          <li key={`${p.type}-${p.id}`} className="w-40 shrink-0">
            <Link
              href={p.href}
              className="flex h-full flex-col rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition hover:border-orange-300"
            >
              <p className="line-clamp-2 text-sm font-semibold text-zinc-900">{p.name}</p>
              <p className="mt-1 line-clamp-1 text-xs text-zinc-600">
                {p.categoryLabel ?? p.role ?? (p.type === 'company' ? 'Firma' : 'Profesionál')}
              </p>
              {p.city ? <p className="mt-1 text-[10px] text-zinc-500">{p.city}</p> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

type Props = {
  initialFilter?: string;
  initialRegion?: string;
};

export function PublicProfileDirectoryView({ initialFilter = 'all', initialRegion = '' }: Props) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(initialFilter);
  const [region, setRegion] = useState(initialRegion);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<PublicProfileDirectoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<PublicProfileDirectoryResponse['stats'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [featured, setFeatured] = useState<FeaturedProfileCard[]>([]);

  const load = useCallback(
    async (pageNum: number, append: boolean) => {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);
      const res = await nestListPublicProfileDirectory({
        q: q.trim() || undefined,
        filter,
        region: region || undefined,
        page: pageNum,
        pageSize: 24,
      });
      if (!res) {
        if (!append) {
          setItems([]);
          setTotal(0);
        }
      } else {
        setStats(res.stats);
        setTotal(res.total);
        setItems((prev) => (append ? [...prev, ...res.items] : res.items));
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [q, filter, region],
  );

  useEffect(() => {
    setPage(1);
    void load(1, false);
  }, [load]);

  useEffect(() => {
    void nestListFeaturedProfiles({ limit: 12 }).then((rows) => {
      if (rows) setFeatured(rows);
    });
  }, []);

  return (
    <div className="min-h-[100dvh] bg-[#fafafa] pb-16 text-zinc-900">
      <PublicHeader activeSection="profiles" showSearch searchQuery={q} onSearchChange={setQ} />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Lidé a firmy na XXREALIT</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600 md:text-base">
          Najděte makléře, stavební firmy, realitní kanceláře, finanční poradce a další profesionály.
        </p>

        {stats ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs uppercase text-zinc-500">Veřejných profilů</p>
              <p className="mt-1 text-2xl font-bold">{stats.totalPublicProfiles}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs uppercase text-zinc-500">Firmy</p>
              <p className="mt-1 text-2xl font-bold">{stats.companies}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs uppercase text-zinc-500">Profesionálové</p>
              <p className="mt-1 text-2xl font-bold">{stats.professionals}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs uppercase text-zinc-500">Kategorií / regionů</p>
              <p className="mt-1 text-2xl font-bold">
                {stats.categories} / {stats.regions}
              </p>
            </div>
          </div>
        ) : null}

        <FeaturedStrip title="Doporučené profily" profiles={featured.slice(0, 8)} />
        <FeaturedStrip title="Nové profily" profiles={featured.slice(4, 12)} />

        <div className="mt-6 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                filter === f.value
                  ? 'border-orange-300 bg-orange-50 text-orange-800'
                  : 'border-zinc-200 bg-white text-zinc-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          >
            <option value="">Všechny kraje</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load(1, false)}
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
          >
            <Search className="size-4" />
            Filtrovat
          </button>
        </div>

        <p className="mt-6 text-sm text-zinc-500">
          {loading ? 'Načítám…' : `Nalezeno: ${total} profilů`}
        </p>

        {items.length === 0 && !loading ? (
          <div className="mt-6 rounded-2xl border border-dashed border-zinc-200 bg-white p-10 text-center text-sm text-zinc-600">
            Zatím nejsou žádné veřejné profily pro zvolený filtr.
          </div>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <li key={`${item.type}-${item.id}`}>
                <ProfileCard item={item} />
              </li>
            ))}
          </ul>
        )}

        {items.length < total ? (
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => {
                const next = page + 1;
                setPage(next);
                void load(next, true);
              }}
              className="rounded-full border border-zinc-200 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-800 disabled:opacity-60"
            >
              {loadingMore ? 'Načítám…' : 'Načíst další'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
