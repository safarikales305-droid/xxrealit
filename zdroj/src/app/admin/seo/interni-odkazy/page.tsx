'use client';

import Link from 'next/link';

export default function AdminSeoInterniOdkazyPage() {
  return (
    <div className="rounded-2xl border bg-white p-5 text-sm">
      <p className="mb-3 text-zinc-600">
        Interní odkazy se generují automaticky u každé programatické stránky. Upravte je v editoru konkrétní stránky.
      </p>
      <Link href="/admin/seo/stranky" className="text-orange-600 hover:underline">
        → Přejít na SEO stránky
      </Link>
    </div>
  );
}
