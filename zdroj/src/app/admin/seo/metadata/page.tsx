'use client';

import Link from 'next/link';

export default function AdminSeoMetadataPage() {
  return (
    <div className="rounded-2xl border bg-white p-5 text-sm">
      <p className="text-zinc-600">
        Hromadná správa meta title a description probíhá přes{' '}
        <Link href="/admin/seo/stranky" className="text-orange-600 hover:underline">
          SEO stránky
        </Link>{' '}
        nebo{' '}
        <Link href="/admin/seo/generator" className="text-orange-600 hover:underline">
          AI generátor
        </Link>
        . Globální výchozí metadata nastavte v Dashboard.
      </p>
    </div>
  );
}
