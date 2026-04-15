import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FollowButton } from '@/components/profile/follow-button';
import { UserPropertiesList } from '@/components/profile/user-properties-list';
import { ROLE_LABELS, isUserRole } from '@/lib/roles';
import { getServerSideApiBaseUrl, nestAbsoluteAssetUrl } from '@/lib/api';
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
  };
  videos?: Array<{ id: string; url: string; description?: string | null; createdAt?: string }>;
  posts?: Array<{
    id: string;
    content?: string | null;
    description?: string | null;
    createdAt?: string;
    media?: Array<{ url?: string; type?: string }>;
  }>;
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

  const avatarSrc = publicAssetUrl(profileUser.avatar);
  const coverSrc = publicAssetUrl(profileUser.coverImage ?? null);

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

      <main className="mx-auto max-w-3xl px-4 py-8 md:px-8">
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
                  <FollowButton
                    userId={profileUser.id}
                    initialFollowing={
                      auth ? (profileUser.isFollowedByViewer ?? false) : null
                    }
                    initialFollowersCount={profileUser.followersCount ?? 0}
                  />
                ) : (
                  <p className="text-center text-sm text-zinc-500 sm:text-left">Váš profil</p>
                )}
              </div>

              <div className="min-w-0 flex-1 pt-1 text-center sm:pt-2 sm:text-left">
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
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
                  <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-700">
                    {profileUser.bio}
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
          <h2 className="text-lg font-semibold text-zinc-900">
            Nemovitosti, videa a příspěvky
          </h2>
          {Array.isArray(profile.posts) && profile.posts.length > 0 ? (
            <div className="mt-4 space-y-3">
              {profile.posts.map((post) => {
                const medias = Array.isArray(post.media)
                  ? post.media.filter((m) => typeof m?.url === 'string' && m.url.trim())
                  : [];
                return (
                  <article key={post.id} className="rounded-xl border border-zinc-200 bg-white p-3">
                    {post.createdAt ? (
                      <p className="text-xs text-zinc-500">
                        {new Date(post.createdAt).toLocaleString('cs-CZ')}
                      </p>
                    ) : null}
                    <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">
                      {post.content || post.description || ''}
                    </p>
                    {medias.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {medias.map((media, idx) => {
                          const mediaUrl =
                            media.url && /^https?:\/\//i.test(media.url)
                              ? media.url
                              : nestAbsoluteAssetUrl(media.url ?? '') || (media.url ?? '');
                          const mediaType =
                            typeof media.type === 'string' ? media.type.toLowerCase() : '';
                          if (mediaType === 'video') {
                            return (
                              <video
                                key={`${post.id}-video-${idx}`}
                                src={mediaUrl}
                                className="max-h-80 w-full rounded-lg bg-black"
                                controls
                                preload="metadata"
                              />
                            );
                          }
                          return (
                            <img
                              key={`${post.id}-image-${idx}`}
                              src={mediaUrl}
                              alt=""
                              className="w-full rounded-lg object-cover"
                            />
                          );
                        })}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : null}
          {Array.isArray(profile.videos) && profile.videos.length > 0 ? (
            <div className="mt-4 space-y-3">
              {profile.videos.map((video) => {
                const url = /^https?:\/\//i.test(video.url)
                  ? video.url
                  : nestAbsoluteAssetUrl(video.url) || video.url;
                return (
                  <article key={video.id} className="rounded-xl border border-zinc-200 bg-white p-3">
                    {video.createdAt ? (
                      <p className="text-xs text-zinc-500">
                        {new Date(video.createdAt).toLocaleString('cs-CZ')}
                      </p>
                    ) : null}
                    {video.description ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">{video.description}</p>
                    ) : null}
                    <video src={url} className="mt-3 max-h-80 w-full rounded-lg bg-black" controls preload="metadata" />
                  </article>
                );
              })}
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
