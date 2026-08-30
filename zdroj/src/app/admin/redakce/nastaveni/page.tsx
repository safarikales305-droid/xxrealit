'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { EditorialCenterShell } from '@/components/admin/redakce/EditorialCenterShell';

export default function RedakceNastaveniPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user?.role !== 'ADMIN') router.replace('/');
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-orange-600" />
      </div>
    );
  }

  return (
    <EditorialCenterShell title="Nastavení" subtitle="Šablony, Facebook a AI redakce.">
      <ul className="space-y-2 text-sm">
        <li>
          <Link href="/admin/redakce/automatizace" className="text-orange-700 underline">
            Automatické publikování a Reels
          </Link>
        </li>
        <li>
          <Link href="/admin/aktuality?tab=settings" className="text-orange-700 underline">
            Facebook šablony a link targets (legacy)
          </Link>
        </li>
        <li>
          <Link href="/admin/shorts-feed" className="text-orange-700 underline">
            Shorts feed mix
          </Link>
        </li>
      </ul>
    </EditorialCenterShell>
  );
}
