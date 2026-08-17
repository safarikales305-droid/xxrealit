import { describe, expect, it } from '@jest/globals';
import { serializePortalPostFeedItem } from './portal-post-feed.serializer';

describe('serializePortalPostFeedItem', () => {
  it('returns full media fields for feed resolver', () => {
    const row = {
      id: 'p1',
      slug: 'test-post',
      type: 'post',
      title: '',
      description: 'Popis',
      content: 'Obsah příspěvku',
      category: 'MAKLERI',
      imageUrl: null,
      videoUrl: 'https://cdn.example.com/video.mp4',
      externalUrl: null,
      previewTitle: null,
      previewDescription: null,
      previewImage: null,
      previewSiteName: null,
      isFacebookPagePost: false,
      facebookPermalink: null,
      facebookEmbedUrl: null,
      facebookPostType: null,
      facebookVideoThumbnail: 'https://cdn.example.com/poster.jpg',
      facebookVideoHasAudio: true,
      source: 'INTERNAL',
      publishedAt: new Date('2026-07-06T12:00:00.000Z'),
      createdAt: new Date('2026-07-06T12:00:00.000Z'),
      media: [
        {
          id: 'm1',
          url: 'https://cdn.example.com/video.mp4',
          type: 'video',
          order: 1,
          postId: 'p1',
        },
      ],
      user: {
        id: 'u1',
        name: 'Martin Doležel',
        avatar: null,
        companyProfile: null,
      },
      _count: { reactions: 3 },
    };

    const item = serializePortalPostFeedItem(row);
    expect(item.authorName).toBe('Martin Doležel');
    expect(item.media).toHaveLength(1);
    expect(item.videoUrl).toBe('https://cdn.example.com/video.mp4');
    expect(item.facebookVideoThumbnail).toBe('https://cdn.example.com/poster.jpg');
    expect(item.href).toBe('/prispevek/test-post');
    expect(item.reactionCount).toBe(3);
  });
});
