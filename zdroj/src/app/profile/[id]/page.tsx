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
  user?: {
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
  videos?: Array<{ id: string; url: string; description?: string | null }>;
  posts?: Array<{ id: string; content: string }>;
  properties?: unknown[];
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

  const profileUser = profile.user ?? profile;

  const items: PropertyFeedItem[] = Array.isArray(propertiesRaw)
    ? propertiesRaw
        .map(safeNormalizePropertyFromApi)
        .filter((x): x is PropertyFeedItem => x != null)
    : [];

  const roleLabel = isUserRole(profileUser.role)
    ? ROLE_LABELS[profileUser.role]
    : profileUser.role;

  const isOwn = me?.id === profileUser.id;
  const stars = '⭐'.repeat(
    Math.min(5, Math.max(0, Math.round(profileUser.rating))),
  );

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
            {profileUser.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profileUser.avatar}
                alt=""
                className="size-28 rounded-2xl border border-zinc-200 object-cover"
              />
            ) : (
              <div className="flex size-28 items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-100 text-3xl font-semibold text-zinc-400">
                {(profileUser.name ?? profileUser.id).slice(0, 1).toUpperCase()}
              </div>
            )}
            {!isOwn ? (
              <FollowButton
                userId={profileUser.id}
                initialFollowing={
                  auth ? (profileUser.isFollowedByViewer ?? false) : null
                }
                initialFollowersCount={profileUser.followersCount ?? 0}
              />
            ) : (
              <p className="text-center text-sm text-zinc-500">Váš profil</p>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {profileUser.name ?? 'Uživatel'}
            </h1>
            <p className="mt-1 text-sm font-medium text-[#e85d00]">{roleLabel}</p>
            {profileUser.city ? (
              <p className="mt-2 text-[15px] text-zinc-600">📍 {profileUser.city}</p>
            ) : null}
            <p className="mt-2 text-[15px] text-zinc-600">
              Hodnocení:{' '}
              <span className="font-semibold text-zinc-900">
                {profileUser.rating.toFixed(1)} {stars}
              </span>
            </p>
            {profileUser.bio ? (
              <p className="mt-4 text-[15px] leading-relaxed text-zinc-700">
                {profileUser.bio}
              </p>
            ) : null}
            <p className="mt-4 text-xs text-zinc-400">
              Sleduje: {profileUser.followingCount ?? 0}
            </p>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-zinc-900">
            Nemovitosti, videa a příspěvky
          </h2>
          {Array.isArray(profile.posts) && profile.posts.length > 0 ? (
            <div className="mt-4 space-y-2">
              {profile.posts.slice(0, 3).map((post) => (
                <article key={post.id} className="rounded-xl border border-zinc-200 bg-white p-3">
                  <p className="text-sm text-zinc-800">{post.content}</p>
                </article>
              ))}
            </div>
          ) : null}
          <div className="mt-4">
            <UserPropertiesList items={items} />
          </div>
        </section>
      </main>
    </div>
  );
}
