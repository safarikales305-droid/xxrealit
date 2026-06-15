'use client';

import { useRouter } from 'next/navigation';
import type { AuthPortalPreviewItem } from '@/lib/auth-portal-preview';
import type { AuthShellVariant } from '@/components/auth/auth-page-shell';

type Props = {
  items: AuthPortalPreviewItem[];
  variant?: AuthShellVariant;
};

function StoryRingCard({ item }: { item: AuthPortalPreviewItem }) {
  const router = useRouter();
  const media = item.videoUrl || item.coverUrl;

  return (
    <button
      type="button"
      onClick={() => router.push(item.href)}
      aria-label={item.title}
      className="group relative h-full w-auto shrink-0 aspect-[9/16] max-h-full"
    >
      {item.hasLiveMedia ? (
        <span
          className="pointer-events-none absolute -inset-[2px] rounded-xl bg-[conic-gradient(from_0deg,#ff6a00,#ff3c00,#a855f7,#22d3ee,#ff6a00)] opacity-90 animate-[spin_5s_linear_infinite]"
          aria-hidden
        />
      ) : (
        <span
          className="pointer-events-none absolute -inset-[2px] rounded-xl bg-gradient-to-tr from-orange-400 to-pink-500 opacity-80"
          aria-hidden
        />
      )}
      <span className="relative block h-full w-full overflow-hidden rounded-[0.65rem] bg-zinc-900 ring-1 ring-black/15">
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
    </button>
  );
}

/**
 * Kompaktní horizontální stories carousel — pevná výška, neovlivňuje výšku formuláře.
 */
export function AuthMobileStoriesPreview({ items, variant = 'login' }: Props) {
  const preview = items.slice(0, 12);
  if (!preview.length) return null;

  return (
    <section
      className="mx-auto mt-3 w-full shrink-0 lg:hidden"
      aria-label="Náhled portálu"
    >
      <div className="h-[clamp(140px,min(24dvh,180px),180px)] max-h-[180px] min-h-[140px] overflow-hidden rounded-xl border border-zinc-200/90 bg-gradient-to-b from-zinc-50/90 to-white shadow-inner shadow-zinc-100/50">
        <div className="no-scrollbar flex h-full items-stretch gap-2.5 overflow-x-auto overflow-y-hidden px-2.5 py-2.5">
          {preview.map((item) => (
            <StoryRingCard key={item.id} item={item} />
          ))}
        </div>
      </div>
      {variant === 'login' ? (
        <p className="mt-1.5 text-center text-[10px] leading-snug text-zinc-500 sm:text-[11px]">
          Ukázka z portálu — po přihlášení uvidíte víc
        </p>
      ) : null}
    </section>
  );
}
