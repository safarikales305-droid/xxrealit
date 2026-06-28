import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { SellerPortalShell } from '@/components/rental/SellerPortalShell';
import { buildSiteMetadata, pageTitle } from '@/lib/seo/metadata';

export const metadata: Metadata = buildSiteMetadata({
  title: pageTitle('Nemovitosti'),
  description:
    'Prohlížejte video i klasické inzeráty nemovitostí na XXREALIT — byty, domy, pozemky a komerční prostory v celé ČR.',
  path: '/nemovitosti',
});

export default function NemovitostiLayout({ children }: { children: ReactNode }) {
  return <SellerPortalShell>{children}</SellerPortalShell>;
}
