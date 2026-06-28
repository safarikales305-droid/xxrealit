'use client';

import { useEffect } from 'react';

/** Jednorázové logování aktuálního hostitele (diagnostika ERR_CERT / špatné domény). */
export function SiteOriginDebug() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // eslint-disable-next-line no-console
    console.log('Current Host:', window.location.host);
    // eslint-disable-next-line no-console
    console.log('Current Origin:', window.location.origin);
  }, []);

  return null;
}
