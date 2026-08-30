import { pickDiscoveryQueries } from './news-youtube-discovery-queries';

describe('pickDiscoveryQueries', () => {
  it('returns multiple unique queries for a known category', () => {
    const queries = pickDiscoveryQueries('makleri', 8, 0);
    expect(queries.length).toBeGreaterThan(1);
    expect(new Set(queries).size).toBe(queries.length);
  });

  it('rotates through the query bank', () => {
    const first = pickDiscoveryQueries('stavebni-firmy', 3, 0);
    const second = pickDiscoveryQueries('stavebni-firmy', 3, 8);
    expect(first.join('|')).not.toBe(second.join('|'));
  });

  it('falls back to ostatni for unknown slugs', () => {
    const queries = pickDiscoveryQueries('neexistujici-kategorie', 5, 0);
    expect(queries.length).toBeGreaterThan(0);
  });

  it('respects maxQueries limit', () => {
    const queries = pickDiscoveryQueries('hypoteky', 4, 0);
    expect(queries.length).toBeLessThanOrEqual(4);
  });
});
