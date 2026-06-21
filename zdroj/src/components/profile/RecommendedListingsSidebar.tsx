import Link from 'next/link';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { classicListingCoverUrl, formatListingPrice, type PropertyFeedItem } from '@/types/property';

type Props = {
  items: PropertyFeedItem[];
};

export function RecommendedListingsSidebar({ items }: Props) {
  const preview = items.slice(0, 3);
  if (preview.length === 0) return null;

  return (
    <aside className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm">
      <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">
        Doporučené inzeráty
      </h2>
      <ul className="mt-4 space-y-3">
        {preview.map((item) => {
          const cover = classicListingCoverUrl(item);
          const imgSrc = cover ? nestAbsoluteAssetUrl(cover) : null;
          return (
            <li key={item.id}>
              <Link
                href={`/nemovitost/${encodeURIComponent(item.id)}?source=classic`}
                className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition hover:border-orange-200 hover:shadow-sm"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-100">
                  {imgSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imgSrc}
                      alt=""
                      className="size-full object-cover transition group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-xs text-zinc-400">
                      Bez náhledu
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="line-clamp-2 text-sm font-semibold text-zinc-900">{item.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">{item.location}</p>
                  <p className="mt-2 text-sm font-bold text-[#e85d00]">
                    {formatListingPrice(item.price)}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
