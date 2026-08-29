'use client';

import Link from 'next/link';
import { useState } from 'react';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { pickCategoryFallbackImage } from '@/lib/news-hero-fallback';

type Props = {
  imageUrl?: string | null;
  previewImage?: string | null;
  category?: string | null;
  seed: string;
  alt?: string;
  href?: string | null;
  className?: string;
};

export function NewsArticleHeroImage({
  imageUrl,
  previewImage,
  category,
  seed,
  alt = '',
  href,
  className = '',
}: Props) {
  const fallback = pickCategoryFallbackImage(category ?? 'reality', seed);
  const initial =
    [previewImage, imageUrl].find((u) => u?.trim())?.trim() || fallback;
  const [src, setSrc] = useState(() => nestAbsoluteAssetUrl(initial));

  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="aspect-[16/9] w-full object-cover"
      onError={() => {
        const fb = nestAbsoluteAssetUrl(fallback);
        if (src !== fb) setSrc(fb);
      }}
    />
  );

  const body = (
    <div className={`relative w-full overflow-hidden bg-zinc-100 ${className}`.trim()}>
      {img}
    </div>
  );

  if (href) {
    const isInternal = href.startsWith('/');
    if (isInternal) {
      return (
        <Link href={href} className="block">
          {body}
        </Link>
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block">
        {body}
      </a>
    );
  }
  return body;
}
