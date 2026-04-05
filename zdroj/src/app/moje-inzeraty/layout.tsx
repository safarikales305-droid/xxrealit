import type { ReactNode } from 'react';
import { SellerPortalShell } from '@/components/rental/SellerPortalShell';

export default function MojeInzeratyLayout({ children }: { children: ReactNode }) {
  return <SellerPortalShell>{children}</SellerPortalShell>;
}
