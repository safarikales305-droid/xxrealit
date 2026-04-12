'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Zpětná kompatibilita: staré odkazy /shorts/[id] přesměrují na veřejný shorts feed
 * s aktivním videem (úvodní stránka, ne samostatný detail stránky).
 */
export default function ShortsLegacyRedirectPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = (params?.id ?? '').trim();

  useEffect(() => {
    if (!id) {
      router.replace('/');
      return;
    }
    router.replace(`/?tab=shorts&video=${encodeURIComponent(id)}`);
  }, [id, router]);

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-black px-4 text-center text-sm text-white/75">
      <p>Otevírám shorts…</p>
    </main>
  );
}
