import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import {
  imageContentHash,
  isSrealityCdnResponseUrl,
  matchKeysForImageUrl,
  shouldSuggestBrowserMediaFallback,
  urlsLikelySameImage,
  validateSrealityImageBuffer,
} from './sreality-browser-media.util';

describe('sreality-browser-media.util', () => {
  it('allows sdn.cz CDN URLs', () => {
    assert.equal(isSrealityCdnResponseUrl('https://d18-a.sdn.cz/d_/abc.jpg'), true);
    assert.equal(isSrealityCdnResponseUrl('https://evil.example/photo.jpg'), false);
  });

  it('suggests browser fallback for 401/403 only', () => {
    assert.equal(shouldSuggestBrowserMediaFallback(401), true);
    assert.equal(shouldSuggestBrowserMediaFallback(403), true);
    assert.equal(shouldSuggestBrowserMediaFallback(200), false);
    assert.equal(shouldSuggestBrowserMediaFallback(null), false);
  });

  it('matches URL variants to the same gallery image keys', () => {
    const url = 'https://d18-a.sdn.cz/d_/test.jpg?fl=res';
    const keys = matchKeysForImageUrl(url);
    assert.ok(keys.length > 0);
    assert.equal(new Set(keys).size, keys.length);
  });

  it('fuzzy-matches CDN response URL to parser URL', () => {
    const parser = 'https://d18-a.sdn.cz/dms/monline2/photo/abc/def/image.jpg';
    const response = 'https://d18-a.sdn.cz/dms/monline2/photo/abc/def/image.jpg?fl=res,1920,1280';
    assert.equal(urlsLikelySameImage(parser, response), true);
  });

  it('validates a real JPEG buffer', async () => {
    const width = 800;
    const height = 600;
    const raw = Buffer.alloc(width * height * 3);
    for (let i = 0; i < raw.length; i += 1) raw[i] = i % 256;
    const buffer = await sharp(raw, { raw: { width, height, channels: 3 } })
      .jpeg({ quality: 90 })
      .toBuffer();

    const validated = await validateSrealityImageBuffer(buffer, 'image/jpeg');
    assert.ok(validated);
    assert.equal(validated!.width, width);
    assert.equal(validated!.height, height);
    assert.equal(validated!.contentHash, imageContentHash(buffer));
  });

  it('rejects HTML and tiny buffers', async () => {
    assert.equal(await validateSrealityImageBuffer(Buffer.from('<html>401</html>')), null);
    assert.equal(await validateSrealityImageBuffer(Buffer.alloc(100)), null);
  });
});
