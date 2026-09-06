export type ScriptProviderStatusInput = {
  enabled: boolean;
  configured: boolean;
  connected: boolean | null;
  lastError?: string | null;
};

export type ScriptProviderReadiness = {
  ready: boolean;
  label: 'READY' | 'CONFIGURED' | 'NOT_READY';
  code?: 'SCRIPT_PROVIDER_DISABLED' | 'AI_PROVIDER_DISABLED';
  message: string;
};

/** OpenAI je jediný script provider — ready = lze spustit generování scénáře. */
export function getScriptProviderReadiness(
  input: ScriptProviderStatusInput,
): ScriptProviderReadiness {
  if (!input.enabled && !input.configured) {
    return {
      ready: false,
      label: 'NOT_READY',
      code: 'AI_PROVIDER_DISABLED',
      message: 'Není dostupný aktivní AI provider.',
    };
  }
  if (!input.configured) {
    return {
      ready: false,
      label: 'NOT_READY',
      code: 'AI_PROVIDER_DISABLED',
      message: 'AI provider není nakonfigurován (chybí API klíč).',
    };
  }
  if (input.connected === false) {
    return {
      ready: false,
      label: 'NOT_READY',
      code: 'AI_PROVIDER_DISABLED',
      message: input.lastError?.trim() || 'Poslední test AI providera selhal.',
    };
  }
  if (input.connected === true) {
    return {
      ready: true,
      label: 'READY',
      message: 'AI script provider je připraven.',
    };
  }
  return {
    ready: true,
    label: 'CONFIGURED',
    message: 'OpenAI je nakonfigurováno (test připojení nebyl spuštěn).',
  };
}
