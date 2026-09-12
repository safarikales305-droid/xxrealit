import type { ActiveAiProvider } from '../openai/ai-provider.service';
import {
  evaluateScriptGenerationGate,
  type ScriptGenerationGateInput,
} from '../openai/ai-script-generation-gate.util';

export type ScriptProviderReadiness = {
  ready: boolean;
  allowed: boolean;
  usable: boolean;
  reason: string;
  label: 'READY' | 'CONFIGURED' | 'NOT_READY' | 'DISABLED';
  code?: 'SCRIPT_PROVIDER_DISABLED' | 'AI_PROVIDER_DISABLED' | 'AI_PROVIDER_NOT_CONFIGURED';
  message: string;
  provider?: string;
  settingsPath?: string;
};

export function getScriptProviderReadiness(
  input: ScriptGenerationGateInput,
): ScriptProviderReadiness {
  const gate = evaluateScriptGenerationGate(input);
  return {
    ready: gate.ready,
    allowed: gate.allowed,
    usable: gate.usable,
    reason: gate.reason,
    label: gate.label,
    code: gate.code,
    message: gate.message,
    provider: input.provider,
  };
}

export function getScriptProviderReadinessFromActiveProvider(
  active: ActiveAiProvider,
): ScriptProviderReadiness {
  const gate = evaluateScriptGenerationGate({
    enabled: active.enabled,
    configured: active.configured,
    connected: active.connected,
    lastError: active.lastError,
    provider: active.provider,
  });
  return {
    ready: gate.ready,
    allowed: gate.allowed,
    usable: gate.usable,
    reason: gate.reason,
    label: gate.label,
    code: gate.code,
    message: gate.message,
    provider: active.provider,
    settingsPath: active.settingsPath,
  };
}
