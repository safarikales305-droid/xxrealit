import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AiInfluencerReelJobStatus } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { resolvePipelineFailedStage, extractPipelineErrorCode } from './ai-influencer-pipeline-stage.util';

describe('resolvePipelineFailedStage', () => {
  it('maps OpenAI disabled during evaluation to SCRIPT, not RENDER', () => {
    const stage = resolvePipelineFailedStage({
      jobStatus: AiInfluencerReelJobStatus.EVALUATING,
      message: 'OpenAI je vypnuto v nastavení.',
      error: new ForbiddenException('OpenAI je vypnuto v nastavení.'),
    });
    assert.equal(stage, 'SCRIPT');
  });

  it('maps SCRIPT_PROVIDER_DISABLED code to SCRIPT from RENDERING status', () => {
    const stage = resolvePipelineFailedStage({
      jobStatus: AiInfluencerReelJobStatus.RENDERING,
      message: 'OpenAI je vypnuto v nastavení.',
      errorCode: 'SCRIPT_PROVIDER_DISABLED',
    });
    assert.equal(stage, 'SCRIPT');
  });

  it('respects explicit pipelineStage on error object', () => {
    const stage = resolvePipelineFailedStage({
      jobStatus: AiInfluencerReelJobStatus.RENDERING,
      message: 'ignored',
      error: Object.assign(new Error('x'), { pipelineStage: 'VIDEO_AGENT', code: 'HEYGEN_VIDEO_AGENT_SUBMIT_FAILED' }),
    });
    assert.equal(stage, 'VIDEO_AGENT');
  });

  it('extracts AI_PROVIDER_DISABLED from ForbiddenException message', () => {
    const code = extractPipelineErrorCode(new ForbiddenException('OpenAI je vypnuto v nastavení.'));
    assert.equal(code, 'AI_PROVIDER_DISABLED');
  });
});
