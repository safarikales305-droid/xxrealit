'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import {
  listingDetailBackTarget,
  parseListingDetailSource,
} from '@/lib/listing-detail-navigation';

export function ListingDetailBackButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const source = parseListingDetailSource(searchParams);
  const { href, label } = listingDetailBackTarget(source);

  return (
    <button
      type="button"
      onClick={() => router.push(href)}
      className="mb-4 inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50"
    >
      {label}
    </button>
  );
}
