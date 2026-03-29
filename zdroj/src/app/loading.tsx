export default function Loading() {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#fafafa] text-zinc-900">
      <div className="h-14 shrink-0 border-b border-zinc-200 bg-white md:h-16" />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-2 md:grid-cols-[260px_1fr] md:p-4 xl:grid-cols-[260px_1fr_300px]">
        <div className="hidden min-h-0 rounded-2xl border border-zinc-200 bg-white shadow-sm md:block" />
        <div className="min-h-0 overflow-hidden rounded-2xl bg-black shadow-lg">
          <div className="mx-auto mt-10 h-[65%] max-w-md animate-pulse rounded-xl bg-zinc-800/80" />
        </div>
        <div className="hidden rounded-2xl border border-zinc-200 bg-white shadow-sm xl:block" />
      </div>
    </div>
  );
}
