import test from 'node:test';
import assert from 'node:assert/strict';
import {
  communityPostFeedDate,
  pickArticleHeroImageUrl,
  resolveCommunityPostDetailHref,
  sortCommunityPostsByFeedDate,
} from './community-post-feed.util';

test('pickArticleHeroImageUrl returns single deduplicated image', () => {
  const url = 'https://cdn.example/hero.jpg';
  assert.equal(
    pickArticleHeroImageUrl({
      imageUrl: url,
      previewImage: url,
      media: [{ url }],
    }),
    url,
  );
});

test('resolveCommunityPostDetailHref prefers slug', () => {
  assert.equal(
    resolveCommunityPostDetailHref({
      id: '1',
      slug: 'aktualita-test',
      title: '',
      description: '',
      price: null,
      city: '',
      type: 'NEWS_ARTICLE',
      createdAt: '2026-01-01',
      media: [],
    }),
    '/prispevek/aktualita-test',
  );
});

test('sortCommunityPostsByFeedDate orders newest first', () => {
  const sorted = sortCommunityPostsByFeedDate([
    {
      id: 'old',
      title: '',
      description: '',
      price: null,
      city: '',
      type: 'post',
      createdAt: '2026-01-01T10:00:00Z',
      publishedAt: '2026-01-01T10:00:00Z',
      media: [],
    },
    {
      id: 'new',
      title: '',
      description: '',
      price: null,
      city: '',
      type: 'YOUTUBE_VIDEO',
      createdAt: '2026-01-02T10:00:00Z',
      publishedAt: '2026-01-02T10:00:00Z',
      media: [],
    },
  ]);
  assert.equal(sorted[0]?.id, 'new');
  assert.ok(communityPostFeedDate(sorted[0]!) > communityPostFeedDate(sorted[1]!));
});
