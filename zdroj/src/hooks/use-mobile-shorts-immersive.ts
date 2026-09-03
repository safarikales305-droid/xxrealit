'use client';

import { useEffect, useState } from 'react';

/** Sleduje `data-mobile-shorts-immersive` na `<html>` (nastavuje MobileShortsHeaderProvider). */
export function useMobileShortsImmersive(): boolean {
  const [immersive, setImmersive] = useState(false);

  useEffect(() => {
    const read = () => {
      setImmersive(document.documentElement.getAttribute('data-mobile-shorts-immersive') === 'true');
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-mobile-shorts-immersive'],
    });
    return () => obs.disconnect();
  }, []);

  return immersive;
}
