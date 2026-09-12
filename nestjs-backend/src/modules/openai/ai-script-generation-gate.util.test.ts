import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateScriptGenerationGate } from './ai-script-generation-gate.util';

describe('evaluateScriptGenerationGate', () => {
  it('blocks when OpenAI disabled but API key exists', () => {
    const gate = evaluateScriptGenerationGate({
      enabled: false,
      configured: true,
      connected: null,
    });
    assert.equal(gate.usable, false);
    assert.equal(gate.label, 'DISABLED');
    assert.match(gate.reason, /vypnuto v nastavení/i);
  });

  it('allows configured provider without prior connection test', () => {
    const gate = evaluateScriptGenerationGate({
      enabled: true,
      configured: true,
      connected: null,
    });
    assert.equal(gate.usable, true);
    assert.equal(gate.ready, false);
    assert.equal(gate.label, 'CONFIGURED');
  });

  it('marks verified connection as READY', () => {
    const gate = evaluateScriptGenerationGate({
      enabled: true,
      configured: true,
      connected: true,
    });
    assert.equal(gate.usable, true);
    assert.equal(gate.ready, true);
    assert.equal(gate.label, 'READY');
  });
});
