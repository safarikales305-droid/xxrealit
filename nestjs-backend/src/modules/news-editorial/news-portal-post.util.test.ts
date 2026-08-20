import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNewsFacebookPostText,
  buildNewsPortalPostContent,
  buildNewsSocialExcerpt,
  resolveNewsArticleImageUrl,
} from './news-portal-post.util';

describe('news portal post util', () => {
  it('builds portal content with CTA', () => {
    const content = buildNewsPortalPostContent({
      socialTitle: 'Hypotéky znovu mění směr',
      socialExcerpt: 'Krátký teaser o sazbách.',
      category: 'hypoteky',
      articleUrl: 'https://www.xxrealit.cz/aktuality/hypoteky-test',
    });
    assert.match(content, /AKTUALITY XXREALIT/);
    assert.match(content, /Přečíst celý článek/);
    assert.match(content, /Hypotéky/);
  });

  it('builds facebook text separately from portal content', () => {
    const fb = buildNewsFacebookPostText({
      socialTitle: 'Test',
      socialExcerpt: 'Perex',
      articleUrl: 'https://www.xxrealit.cz/aktuality/test',
    });
    assert.match(fb, /Novinka z realitního trhu/);
    assert.match(fb, /#xxrealit/);
  });

  it('limits teaser length', () => {
    const excerpt = buildNewsSocialExcerpt(
      { perex: 'a'.repeat(400), socialExcerpt: null },
      280,
    );
    assert.ok(excerpt.length <= 280);
  });

  it('uses owned image or fallback', () => {
    const url = resolveNewsArticleImageUrl(
      {
        ogImageUrl: '/uploads/news/test.jpg',
        socialImageUrl: null,
        category: 'hypoteky',
      },
      '/images/aktuality-default-og.jpg',
    );
    assert.ok(url.includes('/uploads/news/test.jpg') || url.startsWith('http'));
  });
});
