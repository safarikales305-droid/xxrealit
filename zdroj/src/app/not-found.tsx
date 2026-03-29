import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#fafafa] px-4 text-center text-zinc-900">
      <h1 className="text-2xl font-semibold">Stránka nenalezena</h1>
      <p className="max-w-md text-sm text-zinc-600">
        Tato adresa neexistuje. Zkuste hlavní stránku.
      </p>
      <Link
        href="/"
        className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
      >
        Domů
      </Link>
    </div>
  );
}
