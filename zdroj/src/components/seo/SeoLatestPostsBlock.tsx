import Link from 'next/link';
import type { PortalPostFeedItem } from '@/lib/portal-post-feed';
import { PortalPostMediaCard } from '@/components/community/PortalPostMediaCard';

export function SeoLatestPostsBlock({ items }: { items: PortalPostFeedItem[] }) {
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
        <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
          <PortalPostMediaCard
            post={featured}
            mediaClassName="mb-3 aspect-[16/10] w-full"
          />
          <Link href={featured.href} className="block">
            <p className="text-xs text-zinc-500">
              {featured.authorName}
              {featured.publishedAt ? ` · ${new Date(featured.publishedAt).toLocaleDateString('cs-CZ')}` : ''}
            </p>
            <p className="mt-2 line-clamp-4 text-sm text-zinc-700">{featured.excerpt}</p>
          </Link>
        </div>

        <ul className="space-y-3">
          {rest.map((post) => (
            <li key={post.id}>
              <div className="flex gap-3 rounded-xl border border-zinc-100 p-3">
                <PortalPostMediaCard post={post} compact mediaClassName="size-16 shrink-0" />
                <Link href={post.href} className="min-w-0">
                  <p className="text-xs text-zinc-500">{post.authorName}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-700">{post.excerpt}</p>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
