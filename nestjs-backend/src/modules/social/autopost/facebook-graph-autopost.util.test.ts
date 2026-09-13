import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseFacebookGraphError } from './facebook-graph-autopost.util';

describe('parseFacebookGraphError', () => {
  it('maps Meta application rate limit (#4) to a non-disconnect message', () => {
    const parsed = parseFacebookGraphError(403, {
      error: {
        message: '(#4) Application request limit reached',
        type: 'OAuthException',
        code: 4,
      },
    });
    assert.match(parsed.userMessage, /rate limit/i);
    assert.match(parsed.userMessage, /připojení/i);
  });

  it('still maps expired tokens to auth guidance', () => {
    const parsed = parseFacebookGraphError(400, {
      error: {
        message: 'Error validating access token: Session has expired',
        code: 190,
      },
    });
    assert.match(parsed.userMessage.toLowerCase(), /token|oauth|expired|platn/i);
  });
});
