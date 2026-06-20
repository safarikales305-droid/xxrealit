'use client';

type Props = {
  label?: string;
  className?: string;
  size?: 'sm' | 'md';
};

export function PageLoadingSpinner({ label, className = '', size = 'md' }: Props) {
  const dim = size === 'sm' ? 'size-6' : 'size-9';
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-8 ${className}`}
      role="status"
      aria-live="polite"
    >
      <div
        className={`${dim} animate-spin rounded-full border-2 border-orange-500 border-t-transparent`}
        aria-hidden
      />
      {label ? <p className="text-sm text-zinc-500">{label}</p> : null}
    </div>
  );
}

export function FeedSkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-zinc-200" />
            <div className="h-3 w-32 rounded bg-zinc-200" />
          </div>
          <div className="mt-4 h-40 rounded-2xl bg-zinc-100" />
          <div className="mt-3 h-3 w-full rounded bg-zinc-100" />
          <div className="mt-2 h-3 w-2/3 rounded bg-zinc-100" />
        </div>
      ))}
    </div>
  );
}

export function ProfileCarouselSkeleton() {
  return (
    <div className="mb-4 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm md:mb-6 md:p-5">
      <div className="h-4 w-40 animate-pulse rounded bg-zinc-200" />
      <div className="mt-3 flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex w-[5.5rem] shrink-0 flex-col items-center gap-2">
            <div className="size-[4.5rem] animate-pulse rounded-full bg-zinc-200 sm:size-[5rem]" />
            <div className="h-2.5 w-12 animate-pulse rounded bg-zinc-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
