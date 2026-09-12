import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseHeyGenVideoAgentSubmitResponse } from './heygen-video-agent-response.util';

describe('parseHeyGenVideoAgentSubmitResponse', () => {
  it('reads session_id from data envelope', () => {
    const parsed = parseHeyGenVideoAgentSubmitResponse(
      JSON.stringify({ data: { session_id: 'sess_abc', status: 'generating', video_id: null } }),
    );
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.sessionId, 'sess_abc');
  });

  it('returns SESSION_ID_MISSING for empty 200 body', () => {
    const parsed = parseHeyGenVideoAgentSubmitResponse('{}');
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.equal(parsed.code, 'HEYGEN_VIDEO_AGENT_SESSION_ID_MISSING');
  });
});
