'use client';

import Link from 'next/link';

type Props = {
  imageUrl: string;
  listingId?: string;
  /** Pouze pro fotografie, ke kterým má XXREALIT právo zpracování (vlastní inzerát). */
  allowed?: boolean;
};

/** Vstup z detailu inzerátu — předvyplní fotografii do AI vizualizace. */
export function AiVisualizationFromListingButton({ imageUrl, allowed = false }: Props) {
  if (!allowed || !imageUrl.startsWith('http')) return null;
  const href = `/ai-vizualizace?sourceImage=${encodeURIComponent(imageUrl)}`;
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-700"
    >
      ✨ Ukázat po rekonstrukci
    </Link>
  );
}
