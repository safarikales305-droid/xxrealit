import {
  detectLocation,
  detectTopicCluster,
  evaluateYoutubeSeoGate,
  resolveContentMode,
  scoreOriginality,
} from './news-youtube-seo-gate.util';

describe('news-youtube-seo-gate.util', () => {
  it('assigns SHORTS_ONLY for low entertainment content', () => {
    const result = evaluateYoutubeSeoGate({
      videoTitle: 'Fortnite funny moments compilation',
      videoDescription: 'gaming fun',
      channelTitle: 'Gamer',
      embeddable: true,
      thumbnailUrl: 'https://img.youtube.com/1.jpg',
      relevanceScore: 30,
      sourceTrustScore: 50,
      teaser: 'Krátké video.',
      bodyMarkdown: 'Krátký text bez hodnoty.',
    });
    expect(result.contentMode).toBe('SHORTS_ONLY');
    expect(result.isIndexable).toBe(false);
  });

  it('can reach ARTICLE_FEATURE for expert mortgage content', () => {
    const body = Array(80)
      .fill(
        'Refinancování hypotéky vyžaduje porovnání sazeb, poplatků a bonity. V Česku sledujte vývoj sazeb ČNB a podmínky bank.',
      )
      .join(' ');
    const result = evaluateYoutubeSeoGate({
      videoTitle: 'Jak refinancovat hypotéku v roce 2026',
      videoDescription: 'hypoteční poradenství sazby refinancování',
      channelTitle: 'Hypo Expert',
      embeddable: true,
      thumbnailUrl: 'https://img.youtube.com/2.jpg',
      relevanceScore: 88,
      sourceTrustScore: 80,
      teaser:
        'Refinancování hypotéky může snížit měsíční splátku, pokud správně porovnáte nabídky bank a poplatky.',
      bodyMarkdown: body,
      h1: 'Jak refinancovat hypotéku: praktický průvodce',
      perex:
        'Refinancování hypotéky může snížit měsíční splátku, pokud správně porovnáte nabídky bank a poplatky.',
      seoTitle: 'Jak refinancovat hypotéku | XXREALIT',
      seoDescription:
        'Praktický průvodce refinancováním hypotéky v Česku: sazby, poplatky, dokumenty a na co si dát pozor před podpisem nové smlouvy u banky.',
      internalLinks: [
        { label: 'Makléři', path: '/makleri', valid: true },
        { label: 'Aktuality', path: '/aktuality', valid: true },
      ],
      relatedPostIds: ['post-1'],
    });
    expect(result.contentMode).toBe('ARTICLE_FEATURE');
    expect(result.seoQualityScore).toBeGreaterThanOrEqual(75);
  });

  it('detects Brno location with confidence', () => {
    const loc = detectLocation('Prodej domu v Brně', 'realitní trh');
    expect(loc.location).toBe('Brno');
    expect(loc.confidence).toBeGreaterThan(0.85);
  });

  it('keeps location null for generic titles', () => {
    const loc = detectLocation('Jak prodat nemovitost', 'obecné tipy');
    expect(loc.location).toBeNull();
  });

  it('groups similar topics into cluster slug', () => {
    const a = detectTopicCluster('Jak koupit byt v Praze');
    const b = detectTopicCluster('Koupě bytu – rady');
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
  });

  it('penalizes copied YouTube description', () => {
    const yt = 'Toto je originální popis videa o hypotékách a sazbách v Česku.';
    const ai = yt;
    expect(scoreOriginality(ai, yt)).toBeLessThan(30);
  });

  it('downgrades duplicate topic to non-indexable modes', () => {
    const result = evaluateYoutubeSeoGate({
      videoTitle: 'Jak koupit byt',
      videoDescription: 'tipy pro kupující',
      channelTitle: 'Reality',
      embeddable: true,
      thumbnailUrl: 'https://img.youtube.com/3.jpg',
      relevanceScore: 85,
      sourceTrustScore: 75,
      teaser: 'Perex o koupi bytu s důrazem na financování a due diligence.',
      bodyMarkdown: 'Delší text '.repeat(120),
      duplicateTopicBlocked: true,
      h1: 'Jak koupit byt',
      seoTitle: 'Jak koupit byt | XXREALIT',
      seoDescription:
        'Průvodce koupí bytu v Česku: financování, kontrola stavu nemovitosti, smlouvy a časté chyby kupujících při první koupi.',
    });
    expect(result.duplicateTopicBlocked).toBe(true);
    expect(result.contentMode).not.toBe('ARTICLE_FEATURE');
    expect(result.isIndexable).toBe(false);
  });

  it('respects configurable thresholds', () => {
    expect(resolveContentMode(48, { shortsOnlyMax: 49, postAndShortsMax: 74, articleFeatureMin: 75, indexableMin: 75, minArticleWords: 300, maxArticleWords: 800, topicClusterDays: 90 })).toBe('SHORTS_ONLY');
    expect(resolveContentMode(60, { shortsOnlyMax: 49, postAndShortsMax: 74, articleFeatureMin: 75, indexableMin: 75, minArticleWords: 300, maxArticleWords: 800, topicClusterDays: 90 })).toBe('POST_AND_SHORTS');
    expect(resolveContentMode(80, { shortsOnlyMax: 49, postAndShortsMax: 74, articleFeatureMin: 75, indexableMin: 75, minArticleWords: 300, maxArticleWords: 800, topicClusterDays: 90 })).toBe('ARTICLE_FEATURE');
  });
});
