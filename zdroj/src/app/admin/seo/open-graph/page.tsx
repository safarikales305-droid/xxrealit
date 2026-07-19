'use client';

import Link from 'next/link';

export default function AdminSeoOpenGraphPage() {
  return (
    <div className="rounded-2xl border bg-white p-5 text-sm">
      <p className="text-zinc-600">
        OG Title, Description a Image upravujte v editoru každé SEO stránky nebo je vygeneruje{' '}
        <Link href="/admin/seo/generator" className="text-orange-600 hover:underline">
          AI generátor
        </Link>
        .
      </p>
    </div>
  );
}
