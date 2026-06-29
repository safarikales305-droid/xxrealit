'use client';

import { useState } from 'react';
import {
  PORTAL_LOGO_ALT_PNG,
  PORTAL_LOGO_PNG,
  PORTAL_LOGO_SVG,
} from '@/lib/portal-logo';

type Props = {
  className?: string;
  alt?: string;
};

export function PortalLogoImage({ className, alt = 'XXREALIT' }: Props) {
  const [src, setSrc] = useState(PORTAL_LOGO_PNG);

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => {
        setSrc((current) => {
          if (current === PORTAL_LOGO_PNG) return PORTAL_LOGO_ALT_PNG;
          if (current === PORTAL_LOGO_ALT_PNG) return PORTAL_LOGO_SVG;
          return current;
        });
      }}
    />
  );
}
