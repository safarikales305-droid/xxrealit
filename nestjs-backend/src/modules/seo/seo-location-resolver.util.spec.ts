import {
  buildResolvedSeoLocation,
  isInvalidPublicLocationName,
  isNumericLocationLabel,
  pickSeoLocationDisplayName,
} from './seo-location-resolver.util';

describe('seo-location-resolver.util', () => {
  it('detects numeric-only location labels', () => {
    expect(isNumericLocationLabel('500011')).toBe(true);
    expect(isNumericLocationLabel('Pardubice')).toBe(false);
  });

  it('resolves municipality name from search terms when raw name is numeric', () => {
    const picked = pickSeoLocationDisplayName({
      name: '500011',
      kind: 'MESTO',
      searchTerms: ['Pardubice'],
      parent: null,
      district: { name: 'Pardubice' },
      region: { name: 'Pardubický kraj' },
    });
    expect(picked.displayName).toBe('Pardubice');
    expect(picked.status).toBe('READY');
  });

  it('marks unresolved when only numeric data exists', () => {
    const picked = pickSeoLocationDisplayName({
      name: '500011',
      kind: 'OBEC',
      searchTerms: [],
      parent: null,
      district: null,
      region: null,
    });
    expect(picked.status).toBe('LOCATION_UNRESOLVED');
  });

  it('builds public slug from resolved name', () => {
    const resolved = buildResolvedSeoLocation({
      id: 'loc1',
      officialCode: '500011',
      name: '500011',
      slug: '500011',
      slugAscii: '500011',
      locative: '',
      kind: 'MESTO',
      searchTerms: ['Pardubice'],
      parent: null,
      district: { name: 'Pardubice' },
      region: { name: 'Pardubický kraj' },
    });
    expect(resolved.name).toBe('Pardubice');
    expect(resolved.slug).toBe('pardubice');
    expect(isInvalidPublicLocationName(resolved.name)).toBe(false);
  });
});
