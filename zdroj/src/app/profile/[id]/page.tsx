import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FollowButton } from '@/components/profile/follow-button';
import { UserPropertiesList } from '@/components/profile/user-properties-list';
import { ROLE_LABELS, isUserRole } from '@/lib/roles';
import { getServerSideApiBaseUrl } from '@/lib/api';
import { getServerAuthorizationHeader } from '@/lib/server-bearer';
import {
  safeNormalizePropertyFromApi,
  type PropertyFeedItem,
} from '@/types/property';

export const dynamic = 'force-dynamic';

type PublicProfile = {
  id: string;
  name: string | null;
  role: string;
  avatar: string | null;
  bio: string | null;
  city: string | null;
  rating: number;
  followersCount?: number;
  followingCount?: number;
  isFollowedByViewer?: boolean | null;
};

async function fetchJson<T>(url: string, auth?: string): Promise<T | null> {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: auth ? { Authorization: auth } : {},
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const base = getServerSideApiBaseUrl();
  if (!base) {
    notFound();
  }

  const auth = await getServerAuthorizationHeader();

  const [profile, me, propertiesRaw] = await Promise.all([
    fetchJson<PublicProfile>(
      `${base}/users/${encodeURIComponent(id)}`,
      auth,
    ),
    auth
      ? fetchJson<{ id: string }>(`${base}/auth/me`, auth)
      : Promise.resolve(null),
    fetchJson<unknown[]>(
      `${base}/users/${encodeURIComponent(id)}/properties`,
      auth,
    ),
  ]);

  if (!profile) {
    notFound();
  }

  const items: PropertyFeedItem[] = Array.isArray(propertiesRaw)
    ? propertiesRaw
        .map(safeNormalizePropertyFromApi)
        .filter((x): x is PropertyFeedItem => x != null)
    : [];

  const roleLabel = isUserRole(profile.role)
    ? ROLE_LABELS[profile.role]
    : profile.role;

  const isOwn = me?.id === profile.id;
  const stars = '⭐'.repeat(Math.min(5, Math.max(0, Math.round(profile.rating))));

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900">
      <header className="border-b border-zinc-200 bg-white px-4 py-4 md:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <Link
            href="/"
            className="text-sm font-semibold text-[#e85d00] hover:text-[#ff6a00]"
          >
            ← XXrealit
          </Link>
          <Link
            href="/login"
            className="text-sm text-zinc-600 hover:text-zinc-900"
          >
            Účet
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 md:px-8">
        <div className="flex flex-col gap-8 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm md:flex-row md:items-start">
          <div className="flex shrink-0 flex-col items-center gap-3">
            {profile.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar}
                alt=""
                className="size-28 rounded-2xl border border-zinc-200 object-cover"
              />
            ) : (
              <div className="flex size-28 items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-100 text-3xl font-semibold text-zinc-400">
                {(profile.name ?? profile.id).slice(0, 1).toUpperCase()}
              </div>
            )}
            {!isOwn ? (
              <FollowButton
                userId={profile.id}
                initialFollowing={
                  auth ? (profile.isFollowedByViewer ?? false) : null
                }
                initialFollowersCount={profile.followersCount ?? 0}
              />
            ) : (
              <p className="text-center text-sm text-zinc-500">Váš profil</p>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {profile.name ?? 'Uživatel'}
            </h1>
            <p className="mt-1 text-sm font-medium text-[#e85d00]">{roleLabel}</p>
            {profile.city ? (
              <p className="mt-2 text-[15px] text-zinc-600">📍 {profile.city}</p>
            ) : null}
            <p className="mt-2 text-[15px] text-zinc-600">
              Hodnocení:{' '}
              <span className="font-semibold text-zinc-900">
                {profile.rating.toFixed(1)} {stars}
              </span>
            </p>
            {profile.bio ? (
              <p className="mt-4 text-[15px] leading-relaxed text-zinc-700">
                {profile.bio}
              </p>
            ) : null}
            <p className="mt-4 text-xs text-zinc-400">
              Sleduje: {profile.followingCount ?? 0}
            </p>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-zinc-900">
            Nemovitosti a videa
          </h2>
          <div className="mt-4">
            <UserPropertiesList items={items} />
          </div>
        </section>
      </main>
    </div>
  );
}
