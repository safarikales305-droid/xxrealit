/** Stejná pravidla jako OpenAiService.assertCanRun pro ai_influencer_* s adminTest. */
export type ScriptGenerationGateInput = {
  enabled: boolean;
  configured: boolean;
  connected: boolean | null;
  lastError?: string | null;
  provider?: string;
};

/** Runtime snapshot — jediný vstup pro preflight, worker, assertCanRun i job start. */
export type ScriptGenerationRuntimeContext = {
  dbEnabled: boolean;
  envEnabled: boolean;
  configured: boolean;
  connected: boolean | null;
  lastError: string | null;
  provider: string;
};

export function resolveOpenAiEnabled(dbEnabled: boolean, envEnabled: boolean): boolean {
  return dbEnabled || envEnabled;
}

export function buildScriptGenerationRuntimeContext(input: {
  dbEnabled: boolean;
  envEnabled: boolean;
  configured: boolean;
  connected: boolean | null;
  lastError?: string | null;
  provider?: string;
}): ScriptGenerationRuntimeContext {
  return {
    dbEnabled: input.dbEnabled,
    envEnabled: input.envEnabled,
    configured: input.configured,
    connected: input.connected,
    lastError: input.lastError ?? null,
    provider: input.provider ?? 'OpenAI',
  };
}

export function resolveScriptGenerationConfigSource(
  ctx: Pick<ScriptGenerationRuntimeContext, 'dbEnabled' | 'envEnabled'>,
): 'database' | 'environment' | 'both' | 'none' {
  if (ctx.dbEnabled && ctx.envEnabled) return 'both';
  if (ctx.dbEnabled) return 'database';
  if (ctx.envEnabled) return 'environment';
  return 'none';
}

export function evaluateScriptGenerationGateFromContext(
  ctx: ScriptGenerationRuntimeContext,
): ScriptGenerationGateResult {
  return evaluateScriptGenerationGate({
    enabled: resolveOpenAiEnabled(ctx.dbEnabled, ctx.envEnabled),
    configured: ctx.configured,
    connected: ctx.connected,
    lastError: ctx.lastError,
    provider: ctx.provider,
  });
}

export type ScriptGenerationGateResult = {
  allowed: boolean;
  ready: boolean;
  usable: boolean;
  reason: string;
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
    const message = `${provider} není nakonfigurován (chybí API klíč).`;
    return {
      allowed: false,
      ready: false,
      usable: false,
      reason: message,
      label: 'NOT_READY',
      code: 'AI_PROVIDER_NOT_CONFIGURED',
      enabled: input.enabled,
      configured: false,
      message,
    };
  }

  if (!input.enabled) {
    const message = 'OpenAI je vypnuto v nastavení.';
    return {
      allowed: false,
      ready: false,
      usable: false,
      reason: message,
      label: 'DISABLED',
      code: 'AI_PROVIDER_DISABLED',
      enabled: false,
      configured: true,
      message,
    };
  }

  if (input.connected === false) {
    const message = input.lastError?.trim() || `Poslední test ${provider} selhal.`;
    return {
      allowed: false,
      ready: false,
      usable: false,
      reason: message,
      label: 'NOT_READY',
      code: 'AI_PROVIDER_DISABLED',
      enabled: true,
      configured: true,
      message,
    };
  }

  if (input.connected === true) {
    const message = 'AI generování scénáře je připraveno.';
    return {
      allowed: true,
      ready: true,
      usable: true,
      reason: message,
      label: 'READY',
      enabled: true,
      configured: true,
      message,
    };
  }

  const message = `${provider} je nakonfigurován (test připojení nebyl spuštěn).`;
  return {
    allowed: true,
    ready: false,
    usable: true,
    reason: message,
    label: 'CONFIGURED',
    enabled: true,
    configured: true,
    message,
  };
}
