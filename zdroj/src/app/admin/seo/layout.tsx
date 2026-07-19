import Link from 'next/link';
import { SeoAdminNav } from '@/components/admin/seo/SeoAdminNav';

export default function SeoAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-2">
        <Link href="/admin" className="text-sm text-zinc-500 hover:underline">
          ← Administrace
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-zinc-900">SEO centrum</h1>
      </div>
      <SeoAdminNav />
      {children}
    </div>
  );
}
