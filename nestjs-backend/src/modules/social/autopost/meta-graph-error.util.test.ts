import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyMetaGraphError,
  isMetaGraphAuthError,
  isMetaGraphRateLimitError,
} from './meta-graph-error.util';

describe('meta-graph-error.util', () => {
  it('TEST A: code 4 maps to RATE_LIMIT', () => {
    assert.equal(isMetaGraphRateLimitError({ code: 4, message: '(#4) Application request limit reached', httpStatus: 403 }), true);
    assert.equal(classifyMetaGraphError({ code: 4, message: '(#4) Application request limit reached', httpStatus: 403 }), 'RATE_LIMIT');
    assert.equal(isMetaGraphAuthError('RATE_LIMIT'), false);
  });

  it('TEST C: code 190 maps to token auth', () => {
    assert.equal(classifyMetaGraphError({ code: 190, message: 'Invalid OAuth access token', httpStatus: 400, error_subcode: 463 }), 'TOKEN_EXPIRED');
    assert.equal(isMetaGraphAuthError('TOKEN_EXPIRED'), true);
  });

  it('429 and rate limit phrases are detected', () => {
    assert.equal(isMetaGraphRateLimitError({ code: 0, message: 'Rate limit exceeded', httpStatus: 429 }), true);
  });
});
