'use client';

import Link from 'next/link';

export default function AdminSeoKanonickeUrlPage() {
  return (
    <div className="rounded-2xl border bg-white p-5 text-sm">
      <p className="text-zinc-600">
        Kanonické URL se nastavují automaticky při generování obsahu. Kontrola a úprava v{' '}
        <Link href="/admin/seo/stranky" className="text-orange-600 hover:underline">
          SEO stránkách
        </Link>{' '}
        nebo v{' '}
        <Link href="/admin/seo/audit" className="text-orange-600 hover:underline">
          SEO auditu
        </Link>
        .
      </p>
    </div>
  );
}
