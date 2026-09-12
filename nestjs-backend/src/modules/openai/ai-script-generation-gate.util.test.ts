import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildScriptGenerationRuntimeContext,
  evaluateScriptGenerationGate,
  evaluateScriptGenerationGateFromContext,
  resolveOpenAiEnabled,
  resolveScriptGenerationConfigSource,
} from './ai-script-generation-gate.util';

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

  it('blocks when API key is missing', () => {
    const gate = evaluateScriptGenerationGate({
      enabled: true,
      configured: false,
      connected: null,
    });
    assert.equal(gate.usable, false);
    assert.equal(gate.label, 'NOT_READY');
    assert.equal(gate.configured, false);
    assert.match(gate.reason, /není nakonfigurován/i);
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

describe('script generation runtime context', () => {
  it('resolves enabled from DB or ENV', () => {
    assert.equal(resolveOpenAiEnabled(false, true), true);
    assert.equal(resolveOpenAiEnabled(true, false), true);
    assert.equal(resolveOpenAiEnabled(false, false), false);
  });

  it('maps config source from DB/ENV flags', () => {
    assert.equal(
      resolveScriptGenerationConfigSource({ dbEnabled: true, envEnabled: true }),
      'both',
    );
    assert.equal(
      resolveScriptGenerationConfigSource({ dbEnabled: true, envEnabled: false }),
      'database',
    );
    assert.equal(
      resolveScriptGenerationConfigSource({ dbEnabled: false, envEnabled: true }),
      'environment',
    );
  });

  it('builds the same gate via runtime context helper', () => {
    const ctx = buildScriptGenerationRuntimeContext({
      dbEnabled: true,
      envEnabled: false,
      configured: true,
      connected: true,
    });
    const gate = evaluateScriptGenerationGateFromContext(ctx);
    assert.equal(gate.label, 'READY');
    assert.equal(gate.usable, true);
  });
});
