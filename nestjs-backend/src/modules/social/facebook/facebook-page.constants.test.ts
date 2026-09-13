import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FACEBOOK_PAGE_API_SCOPES,
  FACEBOOK_PAGE_API_SCOPES_LEGACY_INSTAGRAM,
} from './facebook-page.constants';

describe('facebook page OAuth scopes', () => {
  it('does not request deprecated instagram OAuth scopes in page connect flow', () => {
    assert.doesNotMatch(FACEBOOK_PAGE_API_SCOPES, /instagram_basic/);
    assert.doesNotMatch(FACEBOOK_PAGE_API_SCOPES, /instagram_content_publish/);
    assert.match(FACEBOOK_PAGE_API_SCOPES, /pages_manage_posts/);
  });

  it('keeps legacy instagram scopes isolated for reference only', () => {
    assert.match(FACEBOOK_PAGE_API_SCOPES_LEGACY_INSTAGRAM, /instagram_basic/);
    assert.match(FACEBOOK_PAGE_API_SCOPES_LEGACY_INSTAGRAM, /instagram_content_publish/);
  });
});
