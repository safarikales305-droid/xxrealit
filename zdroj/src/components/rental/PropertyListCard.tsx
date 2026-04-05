import Image from 'next/image';
import Link from 'next/link';
import type { MockProperty } from '@/lib/rental/mock-properties';
import { formatCzk, propertyTypeLabel } from '@/lib/rental/mock-properties';

type Props = {
  property: MockProperty;
};

export function PropertyListCard({ property }: Props) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-md transition duration-200 hover:scale-[1.01] hover:shadow-lg">
      <div className="relative aspect-[16/10] w-full bg-zinc-100">
        <Image
          src={property.imageUrl}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 33vw"
          unoptimized
        />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {propertyTypeLabel(property.type)}
        </p>
        <h3 className="mt-1 line-clamp-2 text-base font-semibold text-zinc-900">
          {property.title}
        </h3>
        <p className="mt-2 text-lg font-bold text-[#e85d00]">{formatCzk(property.price)}</p>
        <p className="mt-1 text-sm text-zinc-600">{property.location}</p>
        <Link
          href={`/nemovitost/${property.id}`}
          className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-95"
        >
          Detail
        </Link>
      </div>
    </article>
  );
}
