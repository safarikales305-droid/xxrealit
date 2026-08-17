import {
  formatCzechReviewCount,
  formatStarRating,
  pickFacebookIntroVariant,
} from './company-review-social.util';

describe('company-review-social.util', () => {
  it('pluralizes Czech review count', () => {
    expect(formatCzechReviewCount(1)).toBe('1 recenze');
    expect(formatCzechReviewCount(2)).toBe('2 recenze');
    expect(formatCzechReviewCount(4)).toBe('4 recenze');
    expect(formatCzechReviewCount(5)).toBe('5 recenzí');
  });

  it('formats star rating', () => {
    expect(formatStarRating(5)).toBe('★★★★★');
    expect(formatStarRating(3)).toBe('★★★☆☆');
  });

  it('picks stable facebook variant from seed', () => {
    expect(pickFacebookIntroVariant('review-abc')).toBe(pickFacebookIntroVariant('review-abc'));
  });
});
