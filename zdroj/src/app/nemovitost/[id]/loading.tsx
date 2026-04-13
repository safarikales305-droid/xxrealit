export default function PropertyDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-6">
          <div className="h-[42vh] animate-pulse rounded-2xl bg-zinc-200/80" />
          <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="h-7 w-3/4 animate-pulse rounded bg-zinc-200/80" />
            <div className="mt-3 h-5 w-1/3 animate-pulse rounded bg-zinc-200/80" />
            <div className="mt-4 space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-zinc-200/70" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-zinc-200/70" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-200/70" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
