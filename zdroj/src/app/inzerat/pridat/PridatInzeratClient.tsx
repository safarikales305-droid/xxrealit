'use client';

import Link from 'next/link';
import { ListingCreateForm } from '@/components/listing/listing-create-form';
import { useAuth } from '@/hooks/use-auth';

export function PridatInzeratClient() {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-600">
        Načítání účtu…
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <p className="text-[15px] text-zinc-700">
          Pro vytvoření inzerátu se prosím přihlaste.
        </p>
        <Link
          href={`/prihlaseni?redirect=${encodeURIComponent('/inzerat/pridat')}`}
          className="mt-5 inline-flex rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-8 py-3 text-sm font-bold text-white shadow-md transition hover:brightness-105"
        >
          Přihlásit se
        </Link>
      </div>
    );
  }

  return <ListingCreateForm />;
}
