import {
  buildCompanyMetaDescription,
  buildCompanySeoTitle,
  computeSeoQualityScore,
  textSimilarity,
} from './company-seo.util';
import { CompanyDirectoryCategory } from '@prisma/client';

describe('company-seo.util', () => {
  const base = {
    name: 'ABC Stavby s.r.o.',
    ico: '12345678',
    city: 'Pardubice',
    region: 'Pardubický kraj',
    street: 'Hlavní 1',
    website: 'https://abc.cz',
    phone: '+420123456789',
    email: 'info@abc.cz',
    description: 'a'.repeat(400),
    shortDescription: 'Stavební firma v Pardubicích zaměřená na rekonstrukce.',
    verifiedBusinessEmail: null,
    xxrealitReviewCount: 2,
    logoUrl: null,
    profileStatus: 'UNCLAIMED' as const,
    contentEnrichedAt: new Date(),
    businessActivities: ['stavba'],
    categories: [CompanyDirectoryCategory.STAVEBNICTVI],
  };

  it('builds unique seo title with city', () => {
    const title = buildCompanySeoTitle(base);
    expect(title).toContain('ABC Stavby');
    expect(title).toContain('Pardubice');
    expect(title).toContain('XXREALIT');
  });

  it('computes score above threshold for enriched profile', () => {
    const score = computeSeoQualityScore({ ...base, serviceCount: 3 });
    expect(score).toBeGreaterThanOrEqual(60);
  });

  it('detects duplicate descriptions', () => {
    const a = 'Stavební firma v Pardubicích nabízí rekonstrukce a výstavbu rodinných domů.';
    const b = 'Stavební firma v Pardubicích nabízí rekonstrukce a výstavbu rodinných domů v regionu.';
    expect(textSimilarity(a, b)).toBeGreaterThan(0.7);
  });

  it('builds meta description from short description', () => {
    const desc = buildCompanyMetaDescription(base);
    expect(desc).toContain('Pardubic');
  });
});
