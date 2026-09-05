import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertSrealityImportListingUrl,
  isAllowedSrealityImageUrl,
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

  it('rejects localhost image URL', () => {
    assert.equal(isAllowedSrealityImageUrl('http://127.0.0.1/photo.jpg'), false);
  });

  it('accepts img.sreality.cz image URL', () => {
    assert.equal(
      isAllowedSrealityImageUrl('https://img.sreality.cz/full/normal/abc.jpg'),
      true,
    );
  });

  it('rejects subdomain spoof evil.sreality.cz.attacker.com', () => {
    assert.equal(
      isAllowedSrealityImageUrl('https://evil.sreality.cz.attacker.com/x.jpg'),
      false,
    );
  });
});
