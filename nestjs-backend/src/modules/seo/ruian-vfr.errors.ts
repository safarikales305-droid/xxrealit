export type RuianVfrErrorInfo = {
  code: string;
  message: string;
  userMessage: string;
};

export function formatRuianVfrError(err: unknown): RuianVfrErrorInfo {
  if (err && typeof err === 'object' && 'userMessage' in err) {
    const e = err as RuianVfrErrorInfo;
    return { code: e.code, message: e.message, userMessage: e.userMessage };
  }

  const nodeErr = err as NodeJS.ErrnoException & { code?: string };
  const code = nodeErr?.code ?? 'UNKNOWN';

  if (code === 'ENOENT') {
    return {
      code,
      message: nodeErr.message ?? 'ENOENT',
      userMessage: 'Soubor nebyl nalezen na disku.',
    };
  }
  if (code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
    return {
      code,
      message: nodeErr.message ?? code,
      userMessage: 'Nelze stáhnout VFR — spojení se zdrojem selhalo.',
    };
  }
  if (code === 'ETIMEDOUT' || code === 'ECONNABORTED') {
    return {
      code,
      message: nodeErr.message ?? code,
      userMessage: 'Vypršel časový limit při stahování VFR souboru.',
    };
  }

  const maybeAxios = err as {
    isAxiosError?: boolean;
    message?: string;
    code?: string;
    response?: { status?: number };
  };
  if (maybeAxios?.isAxiosError || (maybeAxios?.response && maybeAxios.message)) {
    const status = maybeAxios.response?.status;
    const message = maybeAxios.message ?? 'Axios error';
    if (status === 404) {
      return {
        code: 'HTTP_404',
        message,
        userMessage: 'Soubor nebyl nalezen na serveru ČÚZK (HTTP 404).',
      };
    }
    if (status && status >= 400) {
      return {
        code: `HTTP_${status}`,
        message,
        userMessage: `Nelze stáhnout VFR (HTTP ${status}).`,
      };
    }
    if (maybeAxios.code === 'ECONNABORTED') {
      return {
        code: 'TIMEOUT',
        message,
        userMessage: 'Vypršel časový limit při stahování VFR souboru.',
      };
    }
    return {
      code: maybeAxios.code ?? 'AXIOS_ERROR',
      message,
      userMessage: 'Nelze stáhnout VFR soubor.',
    };
  }

  const msg = err instanceof Error ? err.message : String(err);
  if (/ZIP|zip|archiv/i.test(msg)) {
    return { code: 'ZIP_ERROR', message: msg, userMessage: 'ZIP je poškozen nebo neobsahuje XML.' };
  }
  if (/XML|parse|sax/i.test(msg)) {
    return { code: 'XML_PARSE', message: msg, userMessage: 'Chyba při parsování VFR XML.' };
  }
  if (/prisma|Prisma|database|DB/i.test(msg)) {
    return { code: 'PRISMA_ERROR', message: msg, userMessage: 'Nepodařilo se uložit data do databáze.' };
  }
  if (/nenalezen|not found/i.test(msg)) {
    return { code: 'NOT_FOUND', message: msg, userMessage: msg };
  }
  if (/již běží|running/i.test(msg)) {
    return { code: 'ALREADY_RUNNING', message: msg, userMessage: msg };
  }

  return {
    code: code !== 'UNKNOWN' ? code : 'IMPORT_ERROR',
    message: msg,
    userMessage: msg || 'Import RÚIAN selhal.',
  };
}

export function ruianVfrFail(err: unknown, logs?: unknown[]) {
  const info = formatRuianVfrError(err);
  return {
    success: false as const,
    error: info.userMessage,
    code: info.code,
    detail: info.message,
    logs: logs ?? [],
  };
}

export function ruianVfrOk<T extends Record<string, unknown>>(data: T) {
  return { success: true as const, ...data };
}
