import type { ReactNode } from 'react';
import { SellerPortalShell } from '@/components/rental/SellerPortalShell';

export default function NemovitostiLayout({ children }: { children: ReactNode }) {
  return <SellerPortalShell>{children}</SellerPortalShell>;
}
