import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractHeyGenVideoUrl,
  extractHeyGenVideoId,
  normalizeHeyGenSessionStatus,
} from './heygen-video-agent-poll.util';

describe('heygen-video-agent-poll.util', () => {
  it('normalizes completed statuses', () => {
    assert.equal(normalizeHeyGenSessionStatus('finished'), 'completed');
    assert.equal(normalizeHeyGenSessionStatus('SUCCESS'), 'completed');
  });

  it('extracts direct video_url from session payload', () => {
    const url = extractHeyGenVideoUrl({
      data: { status: 'completed', video_url: 'https://cdn.example/video.mp4' },
    });
    assert.equal(url, 'https://cdn.example/video.mp4');
  });

  it('extracts nested videos list url', () => {
    const url = extractHeyGenVideoUrl({
      data: {
        status: 'completed',
        videos: [{ video_url: 'https://cdn.example/nested.mp4' }],
      },
    });
    assert.equal(url, 'https://cdn.example/nested.mp4');
  });

  it('extracts video id from payload', () => {
    const id = extractHeyGenVideoId({ data: { video_id: 'vid_123' } });
    assert.equal(id, 'vid_123');
  });
});
