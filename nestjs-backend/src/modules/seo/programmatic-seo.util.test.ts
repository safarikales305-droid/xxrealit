import { describe, expect, it } from 'vitest';
import { findCzGeoLocation } from './cz-geo-locations.data';
import { getProgrammaticSeoIntent } from './programmatic-seo-intents';
import {
  buildProgrammaticSeoCopy,
  buildProgrammaticSeoPath,
} from './programmatic-seo.util';

describe('programmatic-seo.util', () => {
  it('builds clean URL path', () => {
    expect(buildProgrammaticSeoPath('prodej-domu', 'pardubice')).toBe('/prodej-domu/pardubice');
  });

  it('generates unique title and h1 for Pardubice houses', () => {
    const intent = getProgrammaticSeoIntent('prodej-domu')!;
    const loc = findCzGeoLocation('pardubice')!;
    const copy = buildProgrammaticSeoCopy(intent, loc);

    expect(copy.h1).toBe('Prodej domů Pardubice');
    expect(copy.title).toContain('Prodej domů Pardubice');
    expect(copy.title).toContain('XXREALIT');
    expect(copy.description).toContain('Pardubicích');
    expect(copy.faq.length).toBeGreaterThanOrEqual(3);
  });

  it('generates different body for Brno apartments', () => {
    const intent = getProgrammaticSeoIntent('prodej-bytu')!;
    const pardubice = findCzGeoLocation('pardubice')!;
    const brno = findCzGeoLocation('brno')!;
    const a = buildProgrammaticSeoCopy(intent, pardubice);
    const b = buildProgrammaticSeoCopy(intent, brno);

    expect(a.bodyText).not.toBe(b.bodyText);
    expect(a.h1).toBe('Prodej bytů Pardubice');
    expect(b.h1).toBe('Prodej bytů Brno');
  });
});
