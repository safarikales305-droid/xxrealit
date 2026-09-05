import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  cloudinaryMissingMessage,
  getCloudinaryRuntimeConfig,
  getElevenLabsRuntimeConfig,
  getHeyGenRuntimeConfig,
  readRuntimeEnv,
} from './ai-influencer-runtime-config.util';

const ORIGINAL_ENV = { ...process.env };

describe('ai-influencer-runtime-config', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('readRuntimeEnv trims quotes', () => {
    process.env.TEST_KEY = '"secret-value"';
    assert.equal(readRuntimeEnv('TEST_KEY'), 'secret-value');
  });

  it('getHeyGenRuntimeConfig reports MISSING without key', () => {
    delete process.env.HEYGEN_API_KEY;
    delete process.env.HEYGEN_KEY;
    const cfg = getHeyGenRuntimeConfig();
    assert.equal(cfg.apiKeyPresence, 'MISSING');
    assert.equal(cfg.apiKey, undefined);
  });

  it('getHeyGenRuntimeConfig reports CONFIGURED with key', () => {
    process.env.HEYGEN_API_KEY = 'test-key';
    const cfg = getHeyGenRuntimeConfig();
    assert.equal(cfg.apiKeyPresence, 'CONFIGURED');
    assert.equal(cfg.apiKey, 'test-key');
  });

  it('getCloudinaryRuntimeConfig accepts CLOUDINARY_URL', () => {
    process.env.CLOUDINARY_URL = 'cloudinary://key:secret@cloud';
    const cfg = getCloudinaryRuntimeConfig();
    assert.equal(cfg.configured, true);
    assert.equal(cfg.source, 'CLOUDINARY_URL');
  });

  it('getCloudinaryRuntimeConfig accepts name/key/secret trio', () => {
    delete process.env.CLOUDINARY_URL;
    process.env.CLOUDINARY_NAME = 'xx';
    process.env.CLOUDINARY_KEY = 'kk';
    process.env.CLOUDINARY_SECRET = 'ss';
    const cfg = getCloudinaryRuntimeConfig();
    assert.equal(cfg.configured, true);
  });

  it('getElevenLabsRuntimeConfig reports MISSING without key', () => {
    delete process.env.ELEVENLABS_API_KEY;
    const cfg = getElevenLabsRuntimeConfig();
    assert.equal(cfg.apiKeyPresence, 'MISSING');
    assert.equal(cfg.apiKey, undefined);
  });

  it('getElevenLabsRuntimeConfig reports CONFIGURED with key and voice', () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    process.env.ELEVENLABS_VOICE_ID = 'voice-123';
    const cfg = getElevenLabsRuntimeConfig();
    assert.equal(cfg.apiKeyPresence, 'CONFIGURED');
    assert.equal(cfg.voiceIdPresence, 'CONFIGURED');
    assert.equal(cfg.apiKey, 'test-key');
    assert.equal(cfg.voiceId, 'voice-123');
  });

  it('getHeyGenRuntimeConfig accepts HEYGEN_KEY alias', () => {
    delete process.env.HEYGEN_API_KEY;
    process.env.HEYGEN_KEY = 'alias-key';
    const cfg = getHeyGenRuntimeConfig();
    assert.equal(cfg.apiKeyPresence, 'CONFIGURED');
  });

  it('cloudinaryMissingMessage lists missing vars', () => {
    delete process.env.CLOUDINARY_URL;
    delete process.env.CLOUDINARY_NAME;
    delete process.env.CLOUDINARY_KEY;
    delete process.env.CLOUDINARY_SECRET;
    const msg = cloudinaryMissingMessage(getCloudinaryRuntimeConfig());
    assert.match(msg, /CLOUDINARY_NAME/);
    assert.match(msg, /CLOUDINARY_KEY/);
    assert.match(msg, /CLOUDINARY_SECRET/);
  });
});
