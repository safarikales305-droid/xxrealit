/** Stejná pravidla jako OpenAiService.assertCanRun pro ai_influencer_* s adminTest. */
export type ScriptGenerationGateInput = {
  enabled: boolean;
  configured: boolean;
  connected: boolean | null;
  lastError?: string | null;
  provider?: string;
};

export type ScriptGenerationGateResult = {
  allowed: boolean;
  ready: boolean;
  label: 'READY' | 'CONFIGURED' | 'NOT_READY' | 'DISABLED';
  code?: 'AI_PROVIDER_DISABLED' | 'AI_PROVIDER_NOT_CONFIGURED';
  message: string;
  enabled: boolean;
  configured: boolean;
};

export function evaluateScriptGenerationGate(
  input: ScriptGenerationGateInput,
): ScriptGenerationGateResult {
  const provider = input.provider ?? 'OpenAI';

  if (!input.configured) {
    return {
      allowed: false,
      ready: false,
      label: 'NOT_READY',
      code: 'AI_PROVIDER_NOT_CONFIGURED',
      enabled: input.enabled,
      configured: false,
      message: `${provider} není nakonfigurován (chybí API klíč).`,
    };
  }

  if (!input.enabled) {
    return {
      allowed: false,
      ready: false,
      label: 'DISABLED',
      code: 'AI_PROVIDER_DISABLED',
      enabled: false,
      configured: true,
      message: 'OpenAI je vypnuto v nastavení.',
    };
  }

  if (input.connected === false) {
    return {
      allowed: false,
      ready: false,
      label: 'NOT_READY',
      code: 'AI_PROVIDER_DISABLED',
      enabled: true,
      configured: true,
      message: input.lastError?.trim() || `Poslední test ${provider} selhal.`,
    };
  }

  if (input.connected === true) {
    return {
      allowed: true,
      ready: true,
      label: 'READY',
      enabled: true,
      configured: true,
      message: 'AI generování scénáře je připraveno.',
    };
  }

  return {
    allowed: true,
    ready: false,
    label: 'CONFIGURED',
    enabled: true,
    configured: true,
    message: `${provider} je nakonfigurován (test připojení nebyl spuštěn).`,
  };
}
