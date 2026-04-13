import Link from 'next/link';

export default function PropertyNotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold text-zinc-900">Inzerát nebyl nalezen</h1>
      <p className="mt-3 text-sm text-zinc-600">
        Inzerát mohl být smazán, není veřejný nebo má neplatný odkaz.
      </p>
      <Link
        href="/?tab=shorts"
        className="mt-6 inline-flex rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
      >
        Zpět na přehled
      </Link>
    </div>
  );
}
