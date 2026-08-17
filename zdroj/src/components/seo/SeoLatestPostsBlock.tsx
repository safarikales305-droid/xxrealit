import Link from 'next/link';
import Image from 'next/image';

export type SeoLatestPostItem = {
  id: string;
  slug: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  category?: string | null;
  excerpt: string;
  thumbnailUrl?: string | null;
  mediaType?: string | null;
  publishedAt: string;
  href: string;
  reactionCount?: number;
};

export function SeoLatestPostsBlock({ items }: { items: SeoLatestPostItem[] }) {
  if (!items.length) return null;

  const [featured, ...rest] = items;

  return (
    <section className="mt-10 rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-zinc-900">Aktuálně na XXREALIT</h2>
        <Link href="/?tab=posts" className="text-sm font-semibold text-orange-700 hover:underline">
          Všechny příspěvky
        </Link>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Link
          href={featured.href}
          className="group overflow-hidden rounded-2xl border border-zinc-100 bg-zinc-50 p-4 transition hover:border-orange-200"
        >
          <div className="relative mb-3 aspect-[16/10] overflow-hidden rounded-xl bg-zinc-200">
            {featured.thumbnailUrl ? (
              <Image src={featured.thumbnailUrl} alt="" fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-400">Příspěvek</div>
            )}
            {featured.mediaType === 'video' ? (
              <span className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-xs text-white">Video</span>
            ) : null}
          </div>
          <p className="text-xs text-zinc-500">
            {featured.authorName}
            {featured.publishedAt ? ` · ${new Date(featured.publishedAt).toLocaleDateString('cs-CZ')}` : ''}
          </p>
          <p className="mt-2 line-clamp-4 text-sm text-zinc-700">{featured.excerpt}</p>
        </Link>

        <ul className="space-y-3">
          {rest.map((post) => (
            <li key={post.id}>
              <Link href={post.href} className="flex gap-3 rounded-xl border border-zinc-100 p-3 transition hover:border-orange-200">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                  {post.thumbnailUrl ? (
                    <Image src={post.thumbnailUrl} alt="" fill className="object-cover" sizes="64px" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] text-zinc-400">Post</div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-zinc-500">{post.authorName}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-700">{post.excerpt}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
