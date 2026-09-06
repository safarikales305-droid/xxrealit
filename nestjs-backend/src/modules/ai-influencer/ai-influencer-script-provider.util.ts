import type { ActiveAiProvider } from '../openai/ai-provider.service';

export type ScriptProviderStatusInput = {
  enabled: boolean;
  configured: boolean;
  connected: boolean | null;
  lastError?: string | null;
  provider?: string;
};

export type ScriptProviderReadiness = {
  ready: boolean;
  label: 'READY' | 'CONFIGURED' | 'NOT_READY';
  code?: 'SCRIPT_PROVIDER_DISABLED' | 'AI_PROVIDER_DISABLED';
  message: string;
  provider?: string;
  settingsPath?: string;
};

/** Stejná logika jako OpenAiService.assertCanRun — configured API key nestačí, pokud je provider vypnutý. */
export function getScriptProviderReadiness(
  input: ScriptProviderStatusInput,
): ScriptProviderReadiness {
  const providerLabel = input.provider ?? 'OpenAI';

  if (!input.configured) {
    return {
      ready: false,
      label: 'NOT_READY',
      code: 'AI_PROVIDER_DISABLED',
      provider: providerLabel,
      settingsPath: '/admin/marketing/ai-centrum',
      message: `${providerLabel} není nakonfigurován (chybí API klíč).`,
    };
  }

  if (!input.enabled) {
    return {
      ready: false,
      label: 'NOT_READY',
      code: 'AI_PROVIDER_DISABLED',
      provider: providerLabel,
      settingsPath: '/admin/marketing/ai-centrum',
      message: `AI generování scénáře není povoleno. Zapněte ${providerLabel} v AI centru.`,
    };
  }

  if (input.connected === false) {
    return {
      ready: false,
      label: 'NOT_READY',
      code: 'AI_PROVIDER_DISABLED',
      provider: providerLabel,
      settingsPath: '/admin/marketing/ai-centrum',
      message: input.lastError?.trim() || `Poslední test ${providerLabel} selhal.`,
    };
  }

  if (input.connected === true) {
    return {
      ready: true,
      label: 'READY',
      provider: providerLabel,
      settingsPath: '/admin/marketing/ai-centrum',
      message: 'AI generování scénáře je připraveno.',
    };
  }

  return {
    ready: true,
    label: 'CONFIGURED',
    provider: providerLabel,
    settingsPath: '/admin/marketing/ai-centrum',
    message: `${providerLabel} je nakonfigurován (test připojení nebyl spuštěn).`,
  };
}

export function getScriptProviderReadinessFromActiveProvider(
  active: ActiveAiProvider,
): ScriptProviderReadiness {
  return getScriptProviderReadiness({
    enabled: active.enabled,
    configured: active.configured,
    connected: active.connected,
    lastError: active.lastError,
    provider: active.provider,
  });
}
