'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AuthPortalPreviewItem } from '@/lib/auth-portal-preview';

type Props = {
  items: AuthPortalPreviewItem[];
};

function StoryRingCard({ item }: { item: AuthPortalPreviewItem }) {
  const router = useRouter();
  const media = item.videoUrl || item.coverUrl;

  return (
    <button
      type="button"
      onClick={() => router.push(item.href)}
      className="group flex w-[4.5rem] shrink-0 flex-col items-center gap-1.5"
    >
      <div className="relative flex size-[4.5rem] items-center justify-center">
        {item.hasLiveMedia ? (
          <span
            className="absolute inset-0 rounded-2xl bg-[conic-gradient(from_0deg,#ff6a00,#ff3c00,#a855f7,#22d3ee,#ff6a00)] opacity-90 animate-[spin_5s_linear_infinite]"
            aria-hidden
          />
        ) : (
          <span className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-orange-400 to-pink-500 opacity-80" />
        )}
        <span className="relative m-[3px] flex size-[calc(100%-6px)] overflow-hidden rounded-[0.85rem] bg-zinc-900 ring-1 ring-black/20">
          {item.videoUrl ? (
            <video
              src={item.videoUrl}
              muted
              playsInline
              loop
              autoPlay
              preload="metadata"
              className="size-full object-cover"
            />
          ) : media ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-[10px] font-bold text-white/70">
              XX
            </span>
          )}
        </span>
      </div>
      <span className="line-clamp-2 w-full text-center text-[10px] font-medium leading-tight text-zinc-600">
        {item.title}
      </span>
    </button>
  );
}

export function AuthMobileStoriesPreview({ items }: Props) {
  const preview = items.slice(0, 10);
  if (!preview.length) return null;

  return (
    <div className="mt-5 lg:hidden">
      <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        Živý náhled portálu
      </p>
      <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {preview.map((item) => (
          <StoryRingCard key={item.id} item={item} />
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] text-zinc-500">
        <Link href="/registrace" className="font-semibold text-orange-600 hover:underline">
          Registrujte se
        </Link>{' '}
        a prohlížejte celý portál
      </p>
    </div>
  );
}
