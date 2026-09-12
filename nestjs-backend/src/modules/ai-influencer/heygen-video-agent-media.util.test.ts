import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildHeyGenMediaPrepStats,
  isBlockedMediaHostname,
  isLikelyPublicCloudinaryUrl,
  isPrivateIpv4,
  isYoutubeMediaUrl,
  sanitizeUrlForLog,
  validateExternalMediaUrl,
} from './heygen-video-agent-media.util';

describe('heygen-video-agent-media.util', () => {
  it('TEST A: accepts likely public Cloudinary image without probe fetch', async () => {
    const result = await validateExternalMediaUrl(
      'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    );
    assert.equal(result.ok, true);
    assert.equal(result.publiclyAccessible, true);
  });

  it('TEST B: rejects localhost authenticated-style URL', async () => {
    const result = await validateExternalMediaUrl('http://localhost:3000/api/media/secret.jpg');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'requires_https');
  });

  it('TEST B: rejects private portal host without public access', async () => {
    const fetchImpl = async () =>
      ({
        ok: false,
        status: 401,
        url: 'https://www.xxrealit.cz/api/media/article.jpg',
        headers: { get: () => null },
      }) as Response;

    const result = await validateExternalMediaUrl(
      'https://www.xxrealit.cz/api/media/article.jpg',
      fetchImpl,
    );
    assert.equal(result.ok, false);
    assert.equal(result.hostname, 'www.xxrealit.cz');
  });

  it('TEST C: dead URL excluded', async () => {
    const fetchImpl = async () =>
      ({
        ok: false,
        status: 404,
        url: 'https://example.com/missing.jpg',
        headers: { get: () => 'image/jpeg' },
      }) as Response;

    const result = await validateExternalMediaUrl('https://example.com/missing.jpg', fetchImpl);
    assert.equal(result.ok, false);
    assert.match(result.reason ?? '', /http_404/);
  });

  it('TEST D: stats count valid vs skipped', () => {
    const stats = buildHeyGenMediaPrepStats({
      selected: [
        {
          sourceUrl: 'https://a.test/1.jpg',
          sourceHost: 'a.test',
          publicUrl: 'https://res.cloudinary.com/demo/1.jpg',
          mimeType: 'image/jpeg',
          sourceType: 'ARTICLE_IMAGE',
          rehosted: false,
        },
        {
          sourceUrl: 'https://a.test/2.jpg',
          sourceHost: 'a.test',
          publicUrl: 'https://res.cloudinary.com/demo/2.jpg',
          mimeType: 'image/jpeg',
          sourceType: 'ARTICLE_IMAGE',
          rehosted: true,
        },
      ],
      skipped: 1,
      invalid: 1,
    });
    assert.equal(stats.selected, 4);
    assert.equal(stats.publicAlready, 1);
    assert.equal(stats.rehosted, 1);
    assert.equal(stats.skipped, 1);
    assert.equal(stats.invalid, 1);
  });

  it('blocks private IPv4 ranges', () => {
    assert.equal(isPrivateIpv4('10.0.0.1'), true);
    assert.equal(isPrivateIpv4('192.168.1.5'), true);
    assert.equal(isPrivateIpv4('8.8.8.8'), false);
  });

  it('blocks localhost hostnames', () => {
    assert.equal(isBlockedMediaHostname('localhost'), true);
    assert.equal(isBlockedMediaHostname('res.cloudinary.com'), false);
  });

  it('skips YouTube URLs', () => {
    assert.equal(isYoutubeMediaUrl('https://www.youtube.com/watch?v=abc'), true);
    assert.equal(isYoutubeMediaUrl('https://res.cloudinary.com/demo/sample.jpg'), false);
  });

  it('sanitizes signed query params in logs', () => {
    const sanitized = sanitizeUrlForLog(
      'https://res.cloudinary.com/demo/image/upload/sample.jpg?sig=secret&s=abc',
    );
    assert.match(sanitized, /sample\.jpg\?…$/);
    assert.doesNotMatch(sanitized, /secret/);
  });

  it('detects Cloudinary delivery URLs', () => {
    assert.equal(
      isLikelyPublicCloudinaryUrl('https://res.cloudinary.com/demo/image/upload/a.jpg'),
      true,
    );
  });
});

console.log('heygen-video-agent-media.util tests PASS');
