'use client';

import Link from 'next/link';

export default function AdminSeoStrukturovanaDataPage() {
  return (
    <div className="rounded-2xl border bg-white p-5 text-sm">
      <p className="text-zinc-600">
        Schema JSON-LD (WebPage, FAQ, BreadcrumbList) se generuje při vytvoření návrhu. Upravte v{' '}
        <Link href="/admin/seo/stranky" className="text-orange-600 hover:underline">
          editoru stránky
        </Link>
        .
      </p>
    </div>
  );
}
