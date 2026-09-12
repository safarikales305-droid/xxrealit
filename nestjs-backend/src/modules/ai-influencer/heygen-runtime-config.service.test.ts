import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HeyGenRuntimeConfigService } from './heygen-runtime-config.service';

describe('HeyGenRuntimeConfigService', () => {
  it('assertApiKeyConfigured throws VIDEO_AGENT stage error when key missing', () => {
    delete process.env.HEYGEN_API_KEY;
    delete process.env.HEYGEN_KEY;
    const service = new HeyGenRuntimeConfigService();
    assert.throws(
      () => service.assertApiKeyConfigured('VIDEO_AGENT'),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as { code?: string }).code, 'HEYGEN_NOT_CONFIGURED');
        assert.equal((err as { pipelineStage?: string }).pipelineStage, 'VIDEO_AGENT');
        return true;
      },
    );
  });

  it('getUnifiedDiagnostics reports CONFIGURED when key present', () => {
    process.env.HEYGEN_API_KEY = 'test-key';
    const service = new HeyGenRuntimeConfigService();
    const diag = service.getUnifiedDiagnostics();
    assert.equal(diag.apiProcess, 'CONFIGURED');
    assert.equal(diag.workerProcess, 'CONFIGURED');
    assert.equal(diag.videoAgentService, 'CONFIGURED');
    assert.equal(diag.configured, true);
  });
});
