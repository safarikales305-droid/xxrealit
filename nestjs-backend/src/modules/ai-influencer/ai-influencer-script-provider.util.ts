export type ScriptProviderStatusInput = {
  enabled: boolean;
  configured: boolean;
  connected: boolean | null;
  lastError?: string | null;
};

export type ScriptProviderReadiness = {
  ready: boolean;
  label: 'READY' | 'CONFIGURED' | 'NOT_READY';
  code?: 'SCRIPT_PROVIDER_DISABLED';
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
      code: 'SCRIPT_PROVIDER_DISABLED',
      message: 'OpenAI je vypnuto v nastavení.',
    };
  }
  if (!input.configured) {
    return {
      ready: false,
      label: 'NOT_READY',
      code: 'SCRIPT_PROVIDER_DISABLED',
      message: 'Chybí OpenAI API klíč.',
    };
  }
  if (input.connected === false) {
    return {
      ready: false,
      label: 'NOT_READY',
      code: 'SCRIPT_PROVIDER_DISABLED',
      message: input.lastError?.trim() || 'Poslední test OpenAI selhal.',
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
