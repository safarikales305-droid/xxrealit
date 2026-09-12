import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildScriptGenerationRuntimeContext,
  evaluateScriptGenerationGateFromContext,
} from './ai-script-generation-gate.util';

describe('script generation gate alignment (preflight = worker)', () => {
  it('preflight usable=true matches worker path for enabled configured provider', () => {
    const ctx = buildScriptGenerationRuntimeContext({
      dbEnabled: true,
      envEnabled: false,
      configured: true,
      connected: null,
    });
    const preflight = evaluateScriptGenerationGateFromContext(ctx);
    const worker = evaluateScriptGenerationGateFromContext(ctx);

    assert.equal(preflight.usable, true);
    assert.equal(worker.usable, true);
    assert.equal(preflight.enabled, true);
    assert.equal(worker.enabled, true);
    assert.doesNotMatch(preflight.reason, /vypnuto v nastavení/i);
  });

  it('disabled state is consistent between preflight and worker paths', () => {
    const ctx = buildScriptGenerationRuntimeContext({
      dbEnabled: false,
      envEnabled: false,
      configured: true,
      connected: null,
    });
    const preflight = evaluateScriptGenerationGateFromContext(ctx);
    const worker = evaluateScriptGenerationGateFromContext(ctx);

    assert.equal(preflight.usable, false);
    assert.equal(worker.usable, false);
    assert.equal(preflight.enabled, false);
    assert.equal(worker.enabled, false);
    assert.match(preflight.reason, /vypnuto v nastavení/i);
    assert.match(worker.reason, /vypnuto v nastavení/i);
  });

  it('env OPENAI_ENABLED alone enables canonical gate when DB toggle is off', () => {
    const ctx = buildScriptGenerationRuntimeContext({
      dbEnabled: false,
      envEnabled: true,
      configured: true,
      connected: null,
    });
    const gate = evaluateScriptGenerationGateFromContext(ctx);
    assert.equal(gate.usable, true);
    assert.equal(gate.enabled, true);
  });

  it('persisted enabled=true keeps canonical gate enabled without env fallback', () => {
    const before = buildScriptGenerationRuntimeContext({
      dbEnabled: false,
      envEnabled: false,
      configured: true,
      connected: true,
    });
    assert.equal(evaluateScriptGenerationGateFromContext(before).enabled, false);

    const after = buildScriptGenerationRuntimeContext({
      dbEnabled: true,
      envEnabled: false,
      configured: true,
      connected: true,
    });
    const gate = evaluateScriptGenerationGateFromContext(after);
    assert.equal(gate.enabled, true);
    assert.equal(gate.usable, true);
    assert.equal(gate.ready, true);
  });
});
