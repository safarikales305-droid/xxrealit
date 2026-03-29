'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#fafafa] px-4 text-center text-zinc-900">
      <h1 className="text-xl font-semibold">Nepodařilo se načíst stránku</h1>
      <p className="max-w-md text-sm text-zinc-600">
        {process.env.NODE_ENV === 'development'
          ? error.message
          : 'Zkuste stránku znovu načíst.'}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
      >
        Zkusit znovu
      </button>
    </div>
  );
}
