import { isEligibleCompanyForSeoGeneration } from './company-seo-page.eligibility';

describe('company-seo-page.eligibility', () => {
  it('allows public active companies', () => {
    expect(
      isEligibleCompanyForSeoGeneration({
        publicProfile: true,
        hidden: false,
        inLiquidation: false,
        inactive: false,
        dissolved: false,
      }),
    ).toBe(true);
  });

  it('skips liquidation and inactive', () => {
    expect(
      isEligibleCompanyForSeoGeneration({
        publicProfile: true,
        hidden: false,
        inLiquidation: true,
        inactive: false,
        dissolved: false,
      }),
    ).toBe(false);
  });
});
