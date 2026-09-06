import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertSrealityImportListingUrl,
  isAllowedSrealityImageUrl,
  isAllowedSrealityImageRedirectUrl,
  isTrustedHost,
  SREALITY_MEDIA_HOSTS,
  SREALITY_SOURCE_HOSTS,
  validateSrealityMediaUrl,
} from './sreality-import-security.util';

describe('sreality-import-security', () => {
  it('accepts valid sreality detail URL', () => {
    const url = assertSrealityImportListingUrl(
      'https://www.sreality.cz/detail/prodej/byt/3+kk/praha/123',
    );
    assert.equal(url.hostname, 'www.sreality.cz');
  });

  it('rejects non-sreality listing host', () => {
    assert.throws(() => assertSrealityImportListingUrl('https://evil.example/detail/x'));
  });

  it('accepts img.sreality.cz image URL', () => {
    assert.equal(
      isAllowedSrealityImageUrl('https://img.sreality.cz/full/normal/abc.jpg'),
      true,
    );
  });

  it('accepts sdn.cz CDN image URL', () => {
    const url = 'https://d18-a.sdn.cz/d_/c/l/u/item_photo/abc.webp';
    const v = validateSrealityMediaUrl(url);
    assert.equal(v.hostValidation, 'PASS');
    assert.equal(v.host, 'd18-a.sdn.cz');
    assert.equal(isAllowedSrealityImageUrl(url), true);
  });

  it('accepts subdomain of sdn.cz', () => {
    assert.equal(
      isAllowedSrealityImageUrl('https://some-valid-subdomain.sdn.cz/photo.jpg'),
      true,
    );
  });

  it('rejects subdomain spoof evil.sreality.cz.attacker.com', () => {
    assert.equal(
      isAllowedSrealityImageUrl('https://evil.sreality.cz.attacker.com/x.jpg'),
      false,
    );
  });

  it('rejects sdn.cz.attacker.com spoof', () => {
    assert.equal(isAllowedSrealityImageUrl('https://sdn.cz.attacker.com/x.jpg'), false);
  });

  it('rejects localhost image URL', () => {
    assert.equal(isAllowedSrealityImageUrl('http://127.0.0.1/photo.jpg'), false);
  });

  it('rejects localhost hostname', () => {
    assert.equal(isAllowedSrealityImageUrl('http://localhost/photo.jpg'), false);
  });

  it('rejects link-local metadata IP', () => {
    assert.equal(isAllowedSrealityImageUrl('http://169.254.169.254/latest/meta-data'), false);
  });

  it('rejects file protocol', () => {
    assert.equal(isAllowedSrealityImageUrl('file:///etc/passwd'), false);
  });

  it('rejects ftp protocol', () => {
    assert.equal(isAllowedSrealityImageUrl('ftp://cdn.example/photo.jpg'), false);
  });

  it('rejects data URL', () => {
    assert.equal(isAllowedSrealityImageUrl('data:image/png;base64,abc'), false);
  });

  it('rejects redirect to private IP URL', () => {
    assert.equal(isAllowedSrealityImageRedirectUrl('http://127.0.0.1/secret.jpg'), false);
  });

  it('allows redirect within trusted CDN', () => {
    assert.equal(
      isAllowedSrealityImageRedirectUrl('https://d19-b.sdn.cz/other/path.jpg'),
      true,
    );
  });

  it('isTrustedHost uses suffix match not includes', () => {
    assert.equal(isTrustedHost('d18-a.sdn.cz', SREALITY_MEDIA_HOSTS), true);
    assert.equal(isTrustedHost('sdn.cz', SREALITY_MEDIA_HOSTS), true);
    assert.equal(isTrustedHost('www.sreality.cz', SREALITY_SOURCE_HOSTS), true);
    assert.equal(isTrustedHost('sdn.cz.attacker.com', SREALITY_MEDIA_HOSTS), false);
  });
});
