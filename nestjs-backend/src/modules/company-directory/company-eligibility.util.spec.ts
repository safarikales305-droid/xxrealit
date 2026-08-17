import {
  canAutoEnrollEmailCampaign,
  canEnqueueSocialIntro,
  isCompanyAutomationExcluded,
} from './company-eligibility.util';

describe('company-eligibility.util', () => {
  it('excludes liquidation companies', () => {
    expect(
      isCompanyAutomationExcluded({
        hidden: false,
        inLiquidation: true,
        inactive: false,
        dissolved: false,
        companyStatus: 'AKTIVNI',
        name: 'Firma s.r.o.',
      }),
    ).toBe(true);
  });

  it('allows social intro for enriched public company', () => {
    expect(
      canEnqueueSocialIntro({
        publicProfile: true,
        enrichmentStatus: 'ENRICHED',
        socialIntroPublishedAt: null,
        socialIntroPostId: null,
        hidden: false,
        inLiquidation: false,
        inactive: false,
        dissolved: false,
        companyStatus: 'AKTIVNI',
        name: 'Firma',
      }),
    ).toBe(true);
  });

  it('blocks duplicate social intro', () => {
    expect(
      canEnqueueSocialIntro({
        publicProfile: true,
        enrichmentStatus: 'ENRICHED',
        socialIntroPublishedAt: new Date(),
        socialIntroPostId: 'fb123',
        hidden: false,
        inLiquidation: false,
        inactive: false,
        dissolved: false,
        companyStatus: 'AKTIVNI',
        name: 'Firma',
      }),
    ).toBe(false);
  });

  it('allows email enroll with discovered email', () => {
    expect(
      canAutoEnrollEmailCampaign({
        verifiedBusinessEmail: null,
        discoveredEmail: 'info@firma.cz',
        communicationOptOut: false,
        emailBounced: false,
        profileStatus: 'UNCLAIMED',
        hidden: false,
        inLiquidation: false,
        inactive: false,
        dissolved: false,
        companyStatus: 'AKTIVNI',
        name: 'Firma',
      }),
    ).toBe(true);
  });
});
