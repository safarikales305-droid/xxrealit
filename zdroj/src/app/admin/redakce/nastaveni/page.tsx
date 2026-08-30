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
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Reel šablony</p>
          <h2 className="mt-1 font-semibold text-zinc-900">Správa vzhledu automatických Facebook Reels</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Intro, segmenty, CTA, logo a hudební podkres pro kompilace z YouTube thumbnailů.
          </p>
          <Link
            href="/admin/redakce/facebook-reels/sablony"
            className="mt-4 inline-block rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
          >
            Spravovat šablony
          </Link>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="font-semibold text-zinc-900">Automatické publikování</h2>
          <p className="mt-2 text-sm text-zinc-600">YouTube → Shorts, Reels a RSS import.</p>
          <Link href="/admin/redakce/automatizace" className="mt-4 inline-block text-sm text-orange-700 underline">
            Otevřít automatizaci →
          </Link>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="font-semibold text-zinc-900">AI redakce a články</h2>
          <Link href="/admin/aktuality?tab=ai" className="mt-2 inline-block text-sm text-orange-700 underline">
            Legacy AI redakce →
          </Link>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="font-semibold text-zinc-900">Shorts feed mix</h2>
          <Link href="/admin/shorts-feed" className="mt-2 inline-block text-sm text-orange-700 underline">
            Nastavení Shorts feedu →
          </Link>
        </div>
      </div>
    </EditorialCenterShell>
  );
}
