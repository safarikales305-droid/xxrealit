'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Legacy URL — přesměrování na /pracovnik */
export default function LegacyPortalWorkerProfilePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/pracovnik');
  }, [router]);
  return null;
}
