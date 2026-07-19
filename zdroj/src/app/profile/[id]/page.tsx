import Link from 'next/link';
import type { Metadata } from 'next';
import { FollowButton } from '@/components/profile/follow-button';
import { PublicProfilePostsFeed, type PublicProfilePost } from '@/components/profile/PublicProfilePostsFeed';
import { RecommendedListingsSidebar } from '@/components/profile/RecommendedListingsSidebar';
import { UserPropertiesList } from '@/components/profile/user-properties-list';
import { WhatsAppContactButton } from '@/components/whatsapp/WhatsAppContactButton';
import { RightSidebar } from '@/components/home/right-sidebar';
import { ROLE_LABELS, isUserRole } from '@/lib/roles';
import { getServerSideApiBaseUrl, nestAbsoluteAssetUrl } from '@/lib/api';
import { buildProfileOpenGraphMetadata } from '@/lib/profile-og-metadata';
import { getServerAuthorizationHeader } from '@/lib/server-bearer';
import {
  safeNormalizePropertyFromApi,
  type PropertyFeedItem,
} from '@/types/property';

export const dynamic = 'force-dynamic';

function publicAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return nestAbsoluteAssetUrl(path) || path;
}

type PublicProfile = {
  user?: {
    id: string;
    name: string | null;
    role: string;
    avatar: string | null;
    coverImage?: string | null;
    bio: string | null;
    city: string | null;
    rating: number;
    followersCount?: number;
    followingCount?: number;
    isFollowedByViewer?: boolean | null;
    whatsappEnabled?: boolean;
    facebookUrl?: string | null;
    isVerified?: boolean;
    verifiedBadgeLabel?: string | null;
    profileHref?: string;
  };
  videos?: Array<{ id: string; url: string; description?: string | null; createdAt?: string }>;
  posts?: PublicProfilePost[];
  properties?: unknown[];
  id: string;
  name: string | null;
  role: string;
  avatar: string | null;
  coverImage?: string | null;
  bio: string | null;
  city: string | null;
  rating: number;
  followersCount?: number;
  followingCount?: number;
  isFollowedByViewer?: boolean | null;
  whatsappEnabled?: boolean;
  facebookUrl?: string | null;
  isVerified?: boolean;
  verifiedBadgeLabel?: string | null;
  profileHref?: string;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const base = getServerSideApiBaseUrl();
  if (!base) {
    return buildProfileOpenGraphMetadata({ name: 'Profil', canonicalPath: `/profile/${id}` });
  }

  const res = await fetch(`${base}/users/${encodeURIComponent(id)}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    return buildProfileOpenGraphMetadata({ name: 'Profil', canonicalPath: `/profile/${id}` });
  }

  const profile = (await res.json()) as PublicProfile;
  const user = profile.user ?? profile;
  const name = user.name?.trim() || 'Profil';
  const imageRaw = user.coverImage || user.avatar;
  const image = imageRaw
    ? /^https?:\/\//i.test(imageRaw)
      ? imageRaw
      : nestAbsoluteAssetUrl(imageRaw) || imageRaw
    : null;

  return buildProfileOpenGraphMetadata({
    name,
    description:
      user.bio?.trim() ||
      `${name}${user.city ? ` – ${user.city}` : ''} na XXREALIT.`,
    imageUrl: image,
    canonicalPath: `/profile/${encodeURIComponent(id)}`,
  });
}

async function fetchJson<T>(url: string, auth?: string): Promise<T | null> {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: auth ? { Authorization: auth } : {},
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

async function fetchProfile(
  url: string,
  auth?: string,
): Promise<{ profile: PublicProfile | null; forbidden: boolean }> {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: auth ? { Authorization: auth } : {},
  });
  if (res.status === 403) {
    return { profile: null, forbidden: true };
  }
  if (!res.ok) {
    return { profile: null, forbidden: false };
  }
  return { profile: (await res.json()) as PublicProfile, forbidden: false };
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fromListing?: string }>;
}) {
  const { id } = await params;
  const fromListing = (await searchParams).fromListing?.trim() ?? '';
  const base = getServerSideApiBaseUrl();
  if (!base) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-zinc-900">Profil není k dispozici</h1>
        <p className="mt-2 text-sm text-zinc-600">API není nakonfigurováno.</p>
        <Link href="/" className="mt-6 inline-block text-sm font-semibold text-[#e85d00] hover:underline">
          Zpět na úvod
        </Link>
      </main>
    );
  }

  const auth = await getServerAuthorizationHeader();
  const profileUrl = fromListing
    ? `${base}/users/${encodeURIComponent(id)}?fromListingId=${encodeURIComponent(fromListing)}`
    : `${base}/users/${encodeURIComponent(id)}`;

  const [profileResult, me, propertiesRaw, recommendedRaw] = await Promise.all([
    fetchProfile(profileUrl, auth),
    auth
      ? fetchJson<{ id: string }>(`${base}/auth/me`, auth)
      : Promise.resolve(null),
    fetchJson<unknown[]>(
      `${base}/users/${encodeURIComponent(id)}/properties`,
      auth,
    ),
    fetchJson<unknown[]>(`${base}/properties?limit=3`, auth),
  ]);

  const profile = profileResult.profile;

  if (profileResult.forbidden) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-zinc-900">Profil inzerenta</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Profil inzerenta se zobrazí po odemčení kontaktu.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm font-semibold text-[#e85d00] hover:underline">
          Zpět na úvod
        </Link>
      </main>
    );
  }

  if (!profile?.user && !profile?.id) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-zinc-900">Profil není k dispozici</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Tento veřejný profil neexistuje nebo není zobrazen.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm font-semibold text-[#e85d00] hover:underline">
          Zpět na úvod
        </Link>
      </main>
    );
  }

  const profileUser = profile.user ?? profile;

  const items: PropertyFeedItem[] = Array.isArray(propertiesRaw)
    ? propertiesRaw
        .map(safeNormalizePropertyFromApi)
        .filter((x): x is PropertyFeedItem => x != null)
    : [];

  const recommendedItems: PropertyFeedItem[] = Array.isArray(recommendedRaw)
    ? recommendedRaw
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

  const avatarSrc = publicAssetUrl(profileUser.avatar);
  const coverSrc = publicAssetUrl(profileUser.coverImage ?? null);

  const posts: PublicProfilePost[] = Array.isArray(profile.posts) ? profile.posts : [];

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900">
      <header className="border-b border-zinc-200 bg-white px-4 py-4 md:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
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

      <main className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="hidden min-w-0 xl:col-span-3 xl:block">
            <div className="sticky top-20">
              <RecommendedListingsSidebar items={recommendedItems} />
            </div>
          </div>

          <div className="min-w-0 xl:col-span-6">
            <section className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm">
              <div className="relative aspect-[21/9] min-h-[120px] w-full sm:min-h-[140px] md:aspect-[3/1] md:min-h-[180px]">
                {coverSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverSrc}
                    alt=""
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-400 via-rose-400 to-violet-600 opacity-95" />
                )}
              </div>
              <div className="relative px-4 pb-8 pt-0 sm:px-8">
                <div className="-mt-12 flex flex-col gap-6 sm:-mt-14 sm:flex-row sm:items-start">
                  <div className="flex shrink-0 flex-col items-center gap-3 sm:items-start">
                    <div className="rounded-full bg-white p-1 shadow-md ring-2 ring-white">
                      {avatarSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatarSrc}
                          alt=""
                          className="size-24 rounded-full object-cover sm:size-28"
                        />
                      ) : (
                        <div className="flex size-24 items-center justify-center rounded-full bg-zinc-100 text-2xl font-semibold text-zinc-400 sm:size-28 sm:text-3xl">
                          {(profileUser.name ?? profileUser.id).slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    {!isOwn ? (
                      <div className="flex flex-col items-center gap-2 sm:items-start">
                        <FollowButton
                          userId={profileUser.id}
                          initialFollowing={
                            auth ? (profileUser.isFollowedByViewer ?? false) : null
                          }
                          initialFollowersCount={profileUser.followersCount ?? 0}
                        />
                        {profileUser.whatsappEnabled ? (
                          <WhatsAppContactButton
                            targetUserId={profileUser.id}
                            variant="primary"
                          />
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-center text-sm text-zinc-500 sm:text-left">Váš profil</p>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 pt-1 text-center sm:pt-2 sm:text-left">
                    <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                      {profileUser.name ?? 'Uživatel'}
                    </h1>
                    <p className="mt-1 text-sm font-medium text-[#e85d00]">{roleLabel}</p>
                    {profileUser.isVerified && profileUser.verifiedBadgeLabel ? (
                      <p className="mt-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                        {profileUser.verifiedBadgeLabel}
                      </p>
                    ) : null}
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
                      <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-700">
                        {profileUser.bio}
                      </p>
                    ) : null}
                    {profileUser.facebookUrl ? (
                      <p className="mt-4">
                        <a
                          href={profileUser.facebookUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-full border border-[#1877F2]/30 bg-[#1877F2]/5 px-4 py-2 text-sm font-semibold text-[#1877F2] hover:bg-[#1877F2]/10"
                        >
                          Facebook stránka
                        </a>
                      </p>
                    ) : null}
                    <p className="mt-4 text-xs text-zinc-400">
                      Sleduje: {profileUser.followingCount ?? 0}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-semibold text-zinc-900">Příspěvky</h2>
              {posts.length > 0 ? (
                <div className="mt-4">
                  <PublicProfilePostsFeed posts={posts} />
                </div>
              ) : (
                <p className="mt-3 text-sm text-zinc-500">Zatím žádné příspěvky.</p>
              )}
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-semibold text-zinc-900">Inzeráty</h2>
              <div className="mt-4">
                <UserPropertiesList items={items} />
              </div>
            </section>
          </div>

          <div className="hidden min-w-0 xl:col-span-3 xl:block">
            <div className="sticky top-20">
              <RightSidebar className="w-full max-w-full flex-col" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
