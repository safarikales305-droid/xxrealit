import { fetchCurrentPortalTerms } from '@/lib/portal-terms';
import { TermsReacceptPageClient } from './TermsReacceptPageClient';

export const metadata = {
  title: 'Souhlas s podmínkami | XXRealit',
};

export default async function SouhlasSPodminkamiPage() {
  const terms = await fetchCurrentPortalTerms();
  return <TermsReacceptPageClient initialTerms={terms} />;
}
