import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { buildSiteMetadata, pageTitle } from '@/lib/seo/metadata';

export const metadata: Metadata = buildSiteMetadata({
  title: pageTitle('Ověření realitní makléři'),
  description:
    'Najděte ověřené realitní makléře, kanceláře a profesionály na portálu XXREALIT.',
  path: '/makleri',
});

export default function MakleriLayout({ children }: { children: ReactNode }) {
  return children;
}
