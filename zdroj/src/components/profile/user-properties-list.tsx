import Link from 'next/link';
import { formatListingPrice, type PropertyFeedItem } from '@/types/property';

type Props = {
  items: PropertyFeedItem[];
};

export function UserPropertiesList({ items }: Props) {
  if (items.length === 0) {
    return (
      <p className="text-[15px] text-zinc-500">Zatím žádné inzeráty.</p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
      {items.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <p className="font-medium text-zinc-900">{p.title}</p>
            <p className="text-sm text-zinc-500">{p.location}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-sm font-semibold tabular-nums text-zinc-800">
              {formatListingPrice(p.price)}
            </span>
            <Link
              href="/"
              className="text-sm font-semibold text-[#e85d00] hover:underline"
            >
              Feed →
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
