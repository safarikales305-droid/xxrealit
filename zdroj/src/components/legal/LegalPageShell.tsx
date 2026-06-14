import Link from 'next/link';
import type { ReactNode } from 'react';
import Logo from '@/components/Logo';
import { SiteFooter } from '@/components/legal/SiteFooter';

type Props = {
  title: string;
  breadcrumb: string;
  children: ReactNode;
};

export function LegalPageShell({ title, breadcrumb, children }: Props) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#fafafa] text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="inline-flex shrink-0 items-center" aria-label="XXRealit — domů">
            <Logo className="h-7 w-auto sm:h-8" />
          </Link>
          <Link
            href="/login"
            className="text-sm font-semibold text-zinc-600 transition hover:text-[#e85d00]"
          >
            Přihlášení
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <nav aria-label="Drobečková navigace" className="text-sm text-zinc-500">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="font-semibold text-[#e85d00] hover:underline">
                Domů
              </Link>
            </li>
            <li aria-hidden className="text-zinc-400">
              /
            </li>
            <li className="font-medium text-zinc-700">{breadcrumb}</li>
          </ol>
        </nav>

        <article className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">{title}</h1>
          <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-zinc-700">{children}</div>
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}
